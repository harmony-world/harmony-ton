import { describe, expect, it } from 'vitest'
import {
  getDraftEditStep,
  INITIAL,
  normalizeDraftStep,
  validateStep,
  WIZARD_STEP_COUNT,
  type WizardState,
} from './createCampaignWizard'

describe('createCampaignWizard validation', () => {
  it('blocks organization flow until organization verification is implemented', () => {
    const state: WizardState = {
      ...INITIAL,
      organizerType: 'organization',
      orgName: 'Фонд помощи',
      orgInn: '7700000000',
    }

    expect(validateStep(0, state)).toMatchObject({
      organizerType: 'Organizations and NGOs will become available later',
    })
  })

  it('requires an explicit answer about photo origin once photos are attached', () => {
    const baseState: WizardState = {
      ...INITIAL,
      title: 'Help kids in need',
      category: 'education',
      story: 'a'.repeat(100),
    }
    const photo = { id: '1', url: '/uploads/a.jpg', name: 'a.jpg', uploadedAt: new Date().toISOString() }

    expect(validateStep(1, baseState).photosIllustrative).toBeUndefined()
    expect(validateStep(1, { ...baseState, photos: [photo] })).toMatchObject({
      photosIllustrative: 'Tell us where the photos come from',
    })
    expect(
      validateStep(1, { ...baseState, photos: [photo], photosIllustrative: false }).photosIllustrative,
    ).toBeUndefined()
    expect(
      validateStep(1, { ...baseState, photos: [photo], photosIllustrative: true }).photosIllustrative,
    ).toBeUndefined()
  })

  it('requires at least one photo', () => {
    const baseState: WizardState = {
      ...INITIAL,
      title: 'Help kids in need',
      category: 'education',
      story: 'a'.repeat(100),
    }
    const photo = { id: '1', url: '/uploads/a.jpg', name: 'a.jpg', uploadedAt: new Date().toISOString() }

    expect(validateStep(1, baseState)).toMatchObject({ photos: 'Add at least one photo' })
    expect(
      validateStep(1, { ...baseState, photos: [photo], photosIllustrative: false }).photos,
    ).toBeUndefined()
  })

  it('refuses a payout address from the other TON network and accepts one from this one', () => {
    const goalState: WizardState = {
      ...INITIAL,
      goalAmount: '500',
      deadline: '2026-12-01',
      payoutAddress: 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ',
    }

    expect(validateStep(2, goalState)).toMatchObject({
      payoutAddress: 'This address belongs to a different TON network',
    })
    expect(
      validateStep(2, { ...goalState, payoutAddress: '0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkT' })
        .payoutAddress,
    ).toBeUndefined()
    expect(validateStep(2, { ...goalState, payoutAddress: 'не адрес' })).toMatchObject({
      payoutAddress: 'Invalid GRAM address',
    })
  })

  it('requires campaign story to be between 100 and 500 characters', () => {
    const baseState: WizardState = {
      ...INITIAL,
      title: 'Help kids in need',
      category: 'education',
      story: 'a'.repeat(100),
    }

    expect(validateStep(1, baseState).story).toBeUndefined()
    expect(validateStep(1, { ...baseState, story: 'a'.repeat(99) })).toMatchObject({
      story: 'Minimum 100 characters (now 99)',
    })
    expect(validateStep(1, { ...baseState, story: 'a'.repeat(501) })).toMatchObject({
      story: 'Maximum 500 characters',
    })
  })

  it('takes the goal ceiling from the server, not from its own number', () => {
    const goalState: WizardState = {
      ...INITIAL,
      goalAmount: '5000',
      deadline: '2026-12-01',
      payoutAddress: 'EQAbcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    }

    expect(validateStep(2, goalState, { goalMaxUsd: 1000 })).toMatchObject({
      goalAmount: 'Maximum $1,000',
    })
    expect(validateStep(2, goalState, { goalMaxUsd: 10000 }).goalAmount).toBeUndefined()
  })

  it('falls back to the KYC 2 ceiling while the server has not answered', () => {
    const goalState: WizardState = {
      ...INITIAL,
      goalAmount: '1001',
      deadline: '2026-12-01',
      payoutAddress: 'EQAbcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    }

    expect(validateStep(2, goalState).goalAmount).toBe('Maximum $1,000')
    expect(validateStep(2, { ...goalState, goalAmount: '1000' }).goalAmount).toBeUndefined()
  })
})

describe('createCampaignWizard draft step', () => {
  it('normalizes anything localStorage can hand back into a real step index', () => {
    expect(normalizeDraftStep(undefined)).toBe(0)
    expect(normalizeDraftStep(null)).toBe(0)
    expect(normalizeDraftStep('не число')).toBe(0)
    expect(normalizeDraftStep(1.5)).toBe(0)
    expect(normalizeDraftStep(-7)).toBe(0)
    expect(normalizeDraftStep(99)).toBe(WIZARD_STEP_COUNT - 1)
    expect(normalizeDraftStep('2')).toBe(2)
  })

  it('reopens the draft where it was left, and a preview on the last editable step', () => {
    expect(getDraftEditStep(1)).toBe(1)
    expect(getDraftEditStep(2)).toBe(2)
    expect(getDraftEditStep(3)).toBe(2)
  })

  it('never returns a step outside the wizard', () => {
    for (const value of [-1, 0, 4, 100, Number.NaN, 'x']) {
      const step = getDraftEditStep(value as number)
      expect(step).toBeGreaterThanOrEqual(0)
      expect(step).toBeLessThanOrEqual(WIZARD_STEP_COUNT - 1)
    }
  })
})
