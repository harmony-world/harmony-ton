import { describe, expect, it } from 'vitest'
import {
  getDraftPhotos,
  isDraftMeaningful,
  toCampaignDraftData,
  type CampaignDraftData,
  type CampaignWizardState,
} from './campaignDraft'

const state: CampaignWizardState = {
  organizerType: 'organization',
  channelLink: 'https://t.me/harmony',
  channelAutopost: true,
  orgName: 'Sensitive Org',
  orgInn: '7700000000',
  orgDoc: new File(['pdf'], 'org.pdf', { type: 'application/pdf' }),
  title: 'Помогите накопить на обучение',
  category: 'education',
  story: 'История кампании',
  photos: [
    {
      id: 'photo-1',
      url: '/uploads/photo.jpg',
      name: 'photo.jpg',
      uploadedAt: '2026-07-09T10:00:00.000Z',
    },
  ],
  photosIllustrative: false,
  goalAmount: '500',
  deadline: '2026-08-09',
  payoutAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
  isPublic: true,
}

describe('campaign draft storage', () => {
  it('keeps uploaded photos but removes sensitive payout and organization identifiers', () => {
    const draft = toCampaignDraftData(state, 2, '2026-07-09T10:00:00.000Z')
    const serialized = JSON.stringify(draft)

    expect(draft.photos).toEqual(state.photos)
    expect(serialized).toContain('/uploads/photo.jpg')
    expect(serialized).not.toContain(state.payoutAddress)
    expect(serialized).not.toContain(state.orgName)
    expect(serialized).not.toContain(state.orgInn)
    expect(serialized).not.toContain('org.pdf')
  })

  it('filters malformed photo records before restoring a draft', () => {
    const parsed = {
      photos: [state.photos[0] as NonNullable<(typeof state.photos)[number]>, { url: '/uploads/bad.jpg' }],
    } as Partial<CampaignDraftData>

    expect(getDraftPhotos(parsed)).toEqual(state.photos)
  })

  it('treats a photo-only draft as meaningful', () => {
    expect(isDraftMeaningful({ photos: state.photos })).toBe(true)
  })

  it('treats a non-public visibility choice as meaningful', () => {
    expect(isDraftMeaningful({ isPublic: false })).toBe(true)
  })
})
