import type { CampaignDetail } from '../api/campaigns'

interface CampaignDisplayStateInput {
  campaign: Pick<CampaignDetail, 'claimStatus' | 'status' | 'deployStatus' | 'onchainAddress'>
  isCreator: boolean
}

type FundraisingCampaign = Pick<CampaignDetail, 'status' | 'deployStatus'> & {
  onchainAddress?: string | null
}

export function isCampaignFundraising(campaign: FundraisingCampaign) {
  const hasKnownOnchainAddress = !('onchainAddress' in campaign) || Boolean(campaign.onchainAddress)
  return (
    campaign.deployStatus === 'deployed' &&
    hasKnownOnchainAddress &&
    campaign.status !== 'completed' &&
    campaign.status !== 'frozen' &&
    campaign.status !== 'freeze_pending' &&
    campaign.status !== 'suspended' &&
    campaign.status !== 'rejected' &&
    campaign.status !== 'refunding' &&
    campaign.status !== 'refunded'
  )
}

const TERMINAL_CLAIM_REFUSALS = new Set(['nothing_raised', 'campaign_refunded', 'not_deployed'])

export function isTerminalClaimRefusal(reason: string | null | undefined): boolean {
  return !!reason && TERMINAL_CLAIM_REFUSALS.has(reason)
}

export function getCampaignDisplayState({ campaign, isCreator }: CampaignDisplayStateInput) {
  const isCompleted = campaign.status === 'completed'
  const isFrozen = campaign.status === 'frozen' || campaign.status === 'freeze_pending'
  const isClaimed = campaign.claimStatus === 'claimed'
  const canClaim = campaign.claimStatus === 'claimable'
  const isFundraising = isCampaignFundraising(campaign)
  const showCreatorClaimedState = isCreator && isClaimed

  return {
    isCompleted,
    isFrozen,
    isClaimed,
    isFundraising,
    canClaim,
    showCreatorClaimedState,
    completionBadgeLabelKey: showCreatorClaimedState ? 'campaignStatus.fundsClaimed' : 'campaignStatus.completed',
    statsStatusLabelKey: showCreatorClaimedState ? 'campaignStatus.claimed' : 'campaignStatus.completed',
    bottomCompletedLabelKey: showCreatorClaimedState ? 'campaignStatus.fundsClaimed' : 'campaignStatus.campaignCompleted',
    bottomCompletedColor: showCreatorClaimedState ? '#1F8A5B' : 'var(--tg-theme-hint-color, #8E8E93)',
  }
}
