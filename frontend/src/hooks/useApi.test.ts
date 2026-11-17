import { describe, it, expect } from 'vitest'
import { campaignPollIntervalMs, userCampaignsPollIntervalMs } from './useApi'

const DEPLOY_POLL_MS = 3_000
const MODERATION_POLL_MS = 15_000
const BACKGROUND_POLL_MS = 30_000

function campaign(overrides: Partial<Parameters<typeof campaignPollIntervalMs>[0]> = {}) {
  return {
    status: 'active',
    deployStatus: 'deployed',
    onchainAddress: 'EQtest',
    ...overrides,
  } as NonNullable<Parameters<typeof campaignPollIntervalMs>[0]>
}

describe('campaignPollIntervalMs', () => {
  it('polls a campaign awaiting moderation so approval arrives without reopening', () => {
    const pending = campaign({ status: 'pending_moderation', deployStatus: null, onchainAddress: null })
    expect(campaignPollIntervalMs(pending)).toBe(MODERATION_POLL_MS)
  })

  it('speeds up to the deploy cadence once the campaign is approved', () => {
    const approved = campaign({ status: 'approved', deployStatus: 'deploying', onchainAddress: null })
    expect(campaignPollIntervalMs(approved)).toBe(DEPLOY_POLL_MS)
  })

  it('falls back to the background cadence once deployed', () => {
    expect(campaignPollIntervalMs(campaign())).toBe(BACKGROUND_POLL_MS)
  })

  it('stops polling on terminal statuses and on a failed deploy', () => {
    expect(campaignPollIntervalMs(campaign({ status: 'completed' }))).toBe(false)
    expect(campaignPollIntervalMs(campaign({ status: 'rejected', deployStatus: null, onchainAddress: null }))).toBe(false)
    expect(campaignPollIntervalMs(campaign({ status: 'approved', deployStatus: 'failed', onchainAddress: null }))).toBe(false)
  })

  it('uses the deploy cadence while a donation is being watched', () => {
    expect(campaignPollIntervalMs(campaign(), true)).toBe(DEPLOY_POLL_MS)
  })

  it('does not poll without data', () => {
    expect(campaignPollIntervalMs(undefined)).toBe(false)
  })
})

describe('userCampaignsPollIntervalMs', () => {
  it('polls while any campaign is awaiting moderation', () => {
    const list = [
      campaign(),
      campaign({ status: 'pending_moderation', deployStatus: null, onchainAddress: null }),
    ]
    expect(userCampaignsPollIntervalMs(list)).toBe(MODERATION_POLL_MS)
  })

  it('polls while any campaign is still being deployed', () => {
    const list = [campaign({ status: 'approved', deployStatus: 'deploying', onchainAddress: null })]
    expect(userCampaignsPollIntervalMs(list)).toBe(MODERATION_POLL_MS)
  })

  it('does not poll a settled list', () => {
    expect(userCampaignsPollIntervalMs([campaign(), campaign({ status: 'completed' })])).toBe(false)
  })

  it('does not poll an empty or missing list', () => {
    expect(userCampaignsPollIntervalMs([])).toBe(false)
    expect(userCampaignsPollIntervalMs(undefined)).toBe(false)
  })
})
