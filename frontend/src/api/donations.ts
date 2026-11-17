import { api } from './client'

export interface DonationItem {
  id: string
  campaignId: string
  donorAddress: string | null
  donorName: string | null
  donorTelegramUsername: string | null
  donorTelegramUserId: string | null
  donorPhotoUrl: string | null
  donorUserId: string | null
  isAnonymous: boolean
  amount: number | null
  amountUsd: number | null
  tipAmount: number | null
  tipAmountUsd: number | null
  amountHidden?: boolean
  currency: string
  txHash: string
  createdAt: string
}

interface CampaignDonationsResponse {
  data: DonationItem[]
}

export interface CreateDonationBody {
  campaign_id: string
  amount: number
  currency: string
  tx_hash: string
}

export interface CreateDonationIntentBody {
  walletAddress: string
  amount: number
  currency: 'GRAM' | 'USDT'
  donorName?: string | null
  isAnonymous: boolean
}

export interface DonationIntent {
  id: string
  expiresAt: string
}

export interface RefundEligibility {
  eligible: boolean
  reason: 'not_deployed' | 'campaign_not_frozen' | 'no_donation' | null
  onchainAddress: string | null
  amountGram: number
  amountUsdt: number
  gasGram: string | null
}

export interface ClaimEligibility {
  eligible: boolean
  reason:
    | 'not_deployed'
    | 'already_claimed'
    | 'campaign_frozen'
    | 'campaign_refunded'
    | 'nothing_raised'
    | 'fundraising_in_progress'
    | 'insufficient_balance'
    | null
  checked: boolean
  gasGram: string
}

export const donationsApi = {
  byCampaign: (campaignId: string) =>
    api.get<CampaignDonationsResponse>(`/campaigns/${campaignId}/donations`).then((res) => res.data),
  refundEligibility: (campaignId: string, wallet: string) =>
    api.get<RefundEligibility>(
      `/campaigns/${campaignId}/refund-eligibility?wallet=${encodeURIComponent(wallet)}`
    ),
  claimEligibility: (campaignId: string) =>
    api.get<ClaimEligibility>(`/campaigns/${campaignId}/claim-eligibility`),
  createIntent: (campaignId: string, body: CreateDonationIntentBody) =>
    api.post<DonationIntent>(`/campaigns/${campaignId}/donation-intents`, body),
  create: (body: CreateDonationBody) => api.post<DonationItem>('/donations', body),
}
