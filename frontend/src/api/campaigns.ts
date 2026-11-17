import { api } from './client'
import type { CampaignCategory } from '../types'
import i18n from '../i18n'

export type CampaignStatus =
  | 'pending_moderation'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'completed'
  | 'frozen'
  | 'freeze_pending'
  | 'refunding'
  | 'refunded'
  | 'rejected'

export type CampaignDisplayStatus = CampaignStatus | 'expired_partial' | 'expired_no_donations'

export type CampaignDeployStatus = 'not_started' | 'deploying' | 'retrying' | 'deployed' | 'failed' | 'needs_manual_reconcile'

export interface CampaignListItem {
  id: string
  pinned?: boolean
  title: string
  language?: string | null
  translation?: CampaignTranslationMeta
  category: CampaignCategory
  status: CampaignStatus
  displayStatus: CampaignDisplayStatus
  deployStatus: CampaignDeployStatus
  goalAmountUsd: number
  raisedAmountUsd: number
  trustScore: number
  donorCount: number
  deadline: string | null
  photos: string[]
  createdAt: string
  organizerType?: OrganizerType
  channelUsername?: string | null
  channelId?: string | null
  channelAvatarUrl?: string | null
  isPublic: boolean
  photosIllustrative?: boolean
  creator: { id: string; tgFirstName: string | null; tgUsername: string | null; tgPhotoUrl: string | null }
}

export interface CampaignTranslationMeta {
  requestedLanguage: 'ru' | 'en' | 'hi'
  sourceLanguage: string | null
  translated: boolean
  source: 'original' | 'cache' | 'google' | 'lara' | 'unavailable'
}

export interface CampaignDetail extends CampaignListItem {
  story: string
  raisedAmountToken: number
  goalToken: number
  viewCount: number
  payoutAddress: string
  acceptsUsdt?: boolean
  onchainAddress: string | null
  deployError: string | null
  claimStatus: 'unavailable' | 'claimable' | 'claimed'
  claimedAt: string | null
  withdrawalTxHash: string | null
  moderationNote: string | null
  approvedAt: string | null
  channelBotIsAdmin?: boolean
  channelAutopost?: boolean
  creator: CampaignListItem['creator'] & { tgUserId?: string }
}

export interface CampaignsListResponse {
  data: CampaignListItem[]
  nextCursor: string | null
}

export interface CampaignFilters {
  category?: CampaignCategory
  status?: CampaignStatus
  sort?: 'createdAt' | 'trustScore'
  limit?: number
  offset?: number
  cursor?: string
}

export type OrganizerType = 'telegram_channel' | 'organization' | 'personal'

export interface OrganizerData {
  channel_link?: string
  org_name?: string
  org_inn?: string
}

export interface CreateCampaignBody {
  title: string
  story: string
  category: CampaignCategory
  goal_amount_usd: number
  deadline: string
  payout_address: string
  photos: string[]
  organizer_type: OrganizerType
  channel_link?: string
  channel_autopost?: boolean
  is_public?: boolean
  photos_illustrative: boolean
  organizer_data?: OrganizerData
}

export interface ChannelInfo {
  name: string
  username: string
  avatar_url: string | null
  subscribers: number
}

export interface ChannelVerification {
  channelId: number
  name: string
  username: string | null
  subscribers: number
  avatarUrl: string | null
  userRole: 'creator' | 'administrator'
  botIsAdmin: boolean
  hasActiveCampaign: boolean
}

export interface CreatedCampaign {
  id: string
  title: string
  category: CampaignCategory
  status: CampaignStatus
  deployStatus: CampaignDeployStatus
  goalAmountUsd: number
  isPublic: boolean
  photosIllustrative?: boolean
  deadline: string
  createdAt: string
  autoModeration?: {
    decision: string
    reasonCodes?: string[]
    message?: string | null
  }
}

export interface RetryCampaignDeployResponse {
  id: string
  deployStatus: CampaignDeployStatus
  deployError: string | null
  deployAttempts: number
  lastDeployAttemptAt: string | null
}

function buildQuery(filters: CampaignFilters): string {
  const params = new URLSearchParams()
  params.set('lang', i18n.language || 'en')
  if (filters.category) params.set('category', filters.category)
  if (filters.status) params.set('status', filters.status)
  if (filters.sort) params.set('sort', filters.sort)
  if (filters.limit != null) params.set('limit', String(filters.limit))
  if (filters.offset != null) params.set('offset', String(filters.offset))
  if (filters.cursor) params.set('cursor', filters.cursor)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const campaignsApi = {
  list: (filters: CampaignFilters = {}) =>
    api.get<CampaignsListResponse>(`/campaigns${buildQuery(filters)}`),

  getById: (id: string) => api.get<CampaignDetail>(`/campaigns/${id}?lang=${encodeURIComponent(i18n.language || 'en')}`),

  create: (body: CreateCampaignBody) => api.post<CreatedCampaign>('/campaigns', body),

  retryDeploy: (id: string) =>
    api.post<RetryCampaignDeployResponse>(`/campaigns/${id}/retry-deploy`, {}),

  channelInfo: (link: string) =>
    api.get<ChannelInfo>(`/channels/info?link=${encodeURIComponent(link)}`),

  verifyChannel: (link: string) =>
    api.post<ChannelVerification>('/channels/verify', { link }),

  getRateLimit: () =>
    api.get<CampaignRateLimitResponse>('/campaigns/rate-limit'),
}

export interface CampaignRateLimitResponse {
  whitelisted: boolean
  blocked?: boolean
  limits: { max: number; label: string; used: number; exceeded: boolean }[]
}
