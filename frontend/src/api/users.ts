import { api } from './client'
import type { CampaignCategory } from '../types'
import type { CampaignDeployStatus, CampaignDisplayStatus, CampaignStatus, CampaignTranslationMeta } from './campaigns'
import i18n from '../i18n'

export interface EmojiStatusInfo {
  enabled: boolean
  emojiId: string | null
  grantedAt: string | null
  premiumRequired: boolean
  ready: boolean
}

export interface UserProfile {
  id: string
  tgUserId?: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  languageCode?: string | null
  isPremium: boolean
  walletAddress?: string | null
  walletFriendly?: string | null
  walletConnected?: boolean
  kycLevel: number
  kycStatus?: string
  role: string
  trustScore: number
  donorStatus: string | null
  totalDonatedUsd: number
  donationCount: number
  isPublic: boolean
  createdAt?: string
  emojiStatus?: EmojiStatusInfo
  terms?: TermsAcceptance
}

export interface TermsAcceptance {
  currentVersion: string
  acceptedVersion: string | null
  acceptedAt: string | null
}

export interface ProfilePrivacyUpdateResponse {
  id: string
  isPublic: boolean
}

export interface EmojiStatusUpdateResponse {
  status: 'on' | 'off'
  emojiId: string | null
  level: number
}

export interface UserCampaign {
  id: string
  title: string
  story: string
  language?: string | null
  translation?: CampaignTranslationMeta
  category: CampaignCategory
  status: CampaignStatus
  displayStatus: CampaignDisplayStatus
  deployStatus: CampaignDeployStatus
  onchainAddress: string | null
  goalAmountUsd: number
  raisedAmountUsd: number
  donorCount: number
  deadline: string | null
  photos: string[]
  isPublic: boolean
  createdAt: string
  claimStatus?: 'unavailable' | 'claimable' | 'claimed'
  expenseReportStatus?: string | null
}

export interface UserDonation {
  id: string
  campaignId: string
  campaign: UserCampaign
  campaignTitle: string
  isAnonymous: boolean
  donorAddress: string | null
  amount: number | null
  amountUsd: number | null
  amountHidden?: boolean
  currency: string
  txHash: string | null
  createdAt: string
}

export interface WalletRepairResult {
  linkedCount: number
  totalDonatedUsd: number
  donationCount: number
  donorStatus: string
}

export interface WalletProofPayload {
  timestamp: number
  domain: {
    lengthBytes?: number
    value: string
  }
  signature: string
  payload: string
}

export interface WalletChallengeResponse {
  payload: string
  expiresAt: string
  domain: string
  required: boolean
}

export interface UpdateWalletBody {
  walletAddress: string
  walletStateInit?: string
  proof?: WalletProofPayload
}

export const usersApi = {
  me: () => api.get<UserProfile>('/users/me'),
  acceptTerms: (version: string) => api.post<TermsAcceptance>('/users/me/terms', { version }),
  byId: (userId: string, view: 'private' | 'public' = 'private') =>
    api.get<UserProfile>(`/users/${userId}${view === 'public' ? '?view=public' : ''}`),
  walletChallenge: () => api.post<WalletChallengeResponse>('/users/me/wallet/challenge', {}),
  updateWallet: (body: UpdateWalletBody) =>
    api.put<{
      walletAddress: string
      walletFriendly: string
      walletConnected: boolean
      rebind: boolean
      repair: WalletRepairResult
    }>(
      '/users/me/wallet',
      body,
    ),
  repairDonations: () => api.post<WalletRepairResult>('/users/me/repair-donations', {}),
  campaigns: (userId: string, view: 'private' | 'public' = 'private') =>
    api.get<UserCampaign[]>(`/users/${userId}/campaigns?lang=${encodeURIComponent(i18n.language || 'en')}${view === 'public' ? '&view=public' : ''}`),
  donations: (userId: string, view: 'private' | 'public' = 'private') =>
    api.get<UserDonation[]>(`/users/${userId}/donations?lang=${encodeURIComponent(i18n.language || 'en')}${view === 'public' ? '&view=public' : ''}`),
  setProfilePrivacy: (isPublic: boolean) =>
    api.put<ProfilePrivacyUpdateResponse>('/users/me/privacy', { isPublic }),
  setEmojiStatus: (enabled: boolean) =>
    api.put<EmojiStatusUpdateResponse>('/users/me/emoji-status', { enabled }),
}
