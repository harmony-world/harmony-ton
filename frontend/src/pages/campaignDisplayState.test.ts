import { describe, expect, it } from 'vitest'
import { getCampaignDisplayState, isCampaignFundraising, isTerminalClaimRefusal } from './campaignDisplayState'

describe('isCampaignFundraising', () => {
  it('returns true for deployed active campaign', () => {
    expect(isCampaignFundraising({ status: 'active', deployStatus: 'deployed', onchainAddress: '0:abc' })).toBe(true)
  })

  it('returns true when onchainAddress field is absent (type compatibility)', () => {
    expect(isCampaignFundraising({ status: 'active', deployStatus: 'deployed' })).toBe(true)
  })

  it('returns false for completed campaign', () => {
    expect(isCampaignFundraising({ status: 'completed', deployStatus: 'deployed', onchainAddress: '0:abc' })).toBe(false)
  })

  it('returns false for frozen campaign', () => {
    expect(isCampaignFundraising({ status: 'frozen', deployStatus: 'deployed', onchainAddress: '0:abc' })).toBe(false)
  })

  it('returns false for a freeze that is still waiting for a signature', () => {
    expect(isCampaignFundraising({ status: 'freeze_pending', deployStatus: 'deployed', onchainAddress: '0:abc' })).toBe(
      false,
    )
  })

  it('returns false for rejected campaign', () => {
    expect(isCampaignFundraising({ status: 'rejected', deployStatus: 'deployed', onchainAddress: '0:abc' })).toBe(false)
  })

  it('returns false for refunding campaign', () => {
    expect(isCampaignFundraising({ status: 'refunding', deployStatus: 'deployed', onchainAddress: '0:abc' })).toBe(false)
  })

  it('returns false for refunded campaign', () => {
    expect(isCampaignFundraising({ status: 'refunded', deployStatus: 'deployed', onchainAddress: '0:abc' })).toBe(false)
  })

  it('returns false when deployStatus is not deployed', () => {
    expect(isCampaignFundraising({ status: 'active', deployStatus: 'deploying', onchainAddress: null })).toBe(false)
  })

  it('returns false when onchainAddress is null', () => {
    expect(isCampaignFundraising({ status: 'active', deployStatus: 'deployed', onchainAddress: null })).toBe(false)
  })
})

describe('getCampaignDisplayState', () => {
  const baseCampaign = {
    claimStatus: 'unavailable' as const,
    status: 'active' as const,
    deployStatus: 'deployed' as const,
    onchainAddress: '0:abc',
  }

  it('active campaign returns isFundraising=true', () => {
    const result = getCampaignDisplayState({ campaign: baseCampaign, isCreator: false })
    expect(result.isFundraising).toBe(true)
    expect(result.isCompleted).toBe(false)
    expect(result.isFrozen).toBe(false)
  })

  it('completed campaign returns isCompleted=true', () => {
    const result = getCampaignDisplayState({
      campaign: { ...baseCampaign, status: 'completed' },
      isCreator: false,
    })
    expect(result.isCompleted).toBe(true)
    expect(result.isFundraising).toBe(false)
    expect(result.completionBadgeLabelKey).toBe('campaignStatus.completed')
    expect(result.bottomCompletedLabelKey).toBe('campaignStatus.campaignCompleted')
  })

  it('completed + claimed by creator shows payout labels', () => {
    const result = getCampaignDisplayState({
      campaign: { ...baseCampaign, status: 'completed', claimStatus: 'claimed' },
      isCreator: true,
    })
    expect(result.showCreatorClaimedState).toBe(true)
    expect(result.completionBadgeLabelKey).toBe('campaignStatus.fundsClaimed')
    expect(result.statsStatusLabelKey).toBe('campaignStatus.claimed')
    expect(result.bottomCompletedLabelKey).toBe('campaignStatus.fundsClaimed')
    expect(result.bottomCompletedColor).toBe('#1F8A5B')
  })

  it('completed + claimed but not creator shows default labels', () => {
    const result = getCampaignDisplayState({
      campaign: { ...baseCampaign, status: 'completed', claimStatus: 'claimed' },
      isCreator: false,
    })
    expect(result.showCreatorClaimedState).toBe(false)
    expect(result.completionBadgeLabelKey).toBe('campaignStatus.completed')
  })

  it('frozen campaign returns isFrozen=true', () => {
    const result = getCampaignDisplayState({
      campaign: { ...baseCampaign, status: 'frozen' },
      isCreator: false,
    })
    expect(result.isFrozen).toBe(true)
  })

  it('shows the frozen state while the freeze is still pending', () => {
    const result = getCampaignDisplayState({
      campaign: { ...baseCampaign, status: 'freeze_pending' },
      isCreator: false,
    })
    expect(result.isFrozen).toBe(true)
  })

  it('claimable campaign returns canClaim=true', () => {
    const result = getCampaignDisplayState({
      campaign: { ...baseCampaign, status: 'completed', claimStatus: 'claimable' },
      isCreator: true,
    })
    expect(result.canClaim).toBe(true)
  })
})

describe('isTerminalClaimRefusal', () => {
  it('treats an emptied or refunded contract as terminal', () => {
    expect(isTerminalClaimRefusal('nothing_raised')).toBe(true)
    expect(isTerminalClaimRefusal('campaign_refunded')).toBe(true)
    expect(isTerminalClaimRefusal('not_deployed')).toBe(true)
  })

  it('keeps refusals that are temporary or actionable', () => {
    expect(isTerminalClaimRefusal('fundraising_in_progress')).toBe(false)
    expect(isTerminalClaimRefusal('campaign_frozen')).toBe(false)
    expect(isTerminalClaimRefusal('insufficient_balance')).toBe(false)
    expect(isTerminalClaimRefusal('already_claimed')).toBe(false)
  })

  it('is false when the chain read gave no refusal', () => {
    expect(isTerminalClaimRefusal(null)).toBe(false)
    expect(isTerminalClaimRefusal(undefined)).toBe(false)
  })
})
