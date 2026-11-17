import type { CampaignCategory } from '../constants/campaignCategories'

export type { CampaignCategory } from '../constants/campaignCategories'

export interface TgUser {
  id: number
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
  languageCode?: string
}

export interface Campaign {
  id: string
  title: string
  description: string
  story: string
  category: CampaignCategory
  goalAmount: string
  raisedAmount: string
  currency: 'USDT' | 'GRAM'
  status: 'active' | 'completed' | 'cancelled'
  creatorId: number
  creatorUsername?: string
  contractAddress?: string
  createdAt: string
  endsAt?: string
  deadline?: string
  photos?: string[]
  trustScore?: number
  donorsCount?: number
}

export interface Donation {
  id: string
  campaignId: string
  donorAddress: string
  donorName?: string
  amount: string
  currency: 'USDT' | 'GRAM'
  txHash: string
  createdAt: string
}

export type KycLevel = 0 | 1 | 2 | 3 | 4 | 5

export type DonorLevel = 1 | 2 | 3 | 4 | 5
