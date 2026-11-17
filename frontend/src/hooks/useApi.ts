import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  campaignsApi,
  type CampaignDetail,
  type CampaignFilters,
  type CreateCampaignBody,
} from '../api/campaigns'
import { donationsApi, type CreateDonationBody } from '../api/donations'
import { usersApi } from '../api/users'
import { priceApi } from '../api/price'
import { leaderboardApi } from '../api/leaderboard'
import { expenseReportsApi, type SubmitExpenseReportBody } from '../api/expenseReports'
import i18n from '../i18n'

const FEED_POLL_MS = 60_000

export function useCampaigns(filters?: CampaignFilters) {
  return useQuery({
    queryKey: ['campaigns', i18n.language, filters ?? {}],
    queryFn: () => campaignsApi.list(filters),
    staleTime: 30_000,
    refetchInterval: FEED_POLL_MS,
  })
}

const CAMPAIGN_POLLING_TERMINAL_STATUSES = new Set(['completed', 'frozen', 'refunding', 'refunded', 'rejected'])

const DEPLOY_POLL_MS = 3_000
const MODERATION_POLL_MS = 15_000
const BACKGROUND_POLL_MS = 30_000

interface CampaignStatusFields {
  status: string
  deployStatus: string | null
  onchainAddress: string | null
}

function isAwaitingModeration(campaign: CampaignStatusFields | undefined) {
  return campaign?.status === 'pending_moderation'
}

function shouldPollCampaignDeploy(campaign: CampaignStatusFields | undefined) {
  if (!campaign) return false
  if (isAwaitingModeration(campaign)) return false
  if (campaign.onchainAddress) return false
  if (campaign.deployStatus === 'failed') return false
  if (CAMPAIGN_POLLING_TERMINAL_STATUSES.has(campaign.status)) return false
  return true
}

interface CampaignQueryOptions {
  pollForDonation?: (campaign: CampaignDetail | undefined) => boolean
}

function isCampaignLive(campaign: CampaignStatusFields | undefined) {
  if (!campaign) return false
  return campaign.deployStatus === 'deployed' && !CAMPAIGN_POLLING_TERMINAL_STATUSES.has(campaign.status)
}

export function campaignPollIntervalMs(
  campaign: CampaignStatusFields | undefined,
  pollForDonation = false,
): number | false {
  if (shouldPollCampaignDeploy(campaign) || pollForDonation) return DEPLOY_POLL_MS
  if (isAwaitingModeration(campaign)) return MODERATION_POLL_MS
  if (isCampaignLive(campaign)) return BACKGROUND_POLL_MS
  return false
}

export function userCampaignsPollIntervalMs(campaigns: CampaignStatusFields[] | undefined): number | false {
  if (!campaigns?.length) return false
  const hasPending = campaigns.some(
    (campaign) => isAwaitingModeration(campaign) || shouldPollCampaignDeploy(campaign),
  )
  return hasPending ? MODERATION_POLL_MS : false
}

export function useCampaign(id: string, options: CampaignQueryOptions = {}) {
  return useQuery({
    queryKey: ['campaign', id, i18n.language],
    queryFn: () => campaignsApi.getById(id),
    enabled: Boolean(id),
    staleTime: 0,
    refetchInterval: (query) =>
      campaignPollIntervalMs(query.state.data, options.pollForDonation?.(query.state.data) ?? false),
  })
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCampaignBody) => campaignsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      void queryClient.invalidateQueries({ queryKey: ['userCampaigns'] })
    },
  })
}

export function useRetryCampaignDeploy(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => campaignsApi.retryDeploy(campaignId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

interface DonationsQueryOptions {
  pollForDonation?: (donations: Awaited<ReturnType<typeof donationsApi.byCampaign>> | undefined) => boolean
}

export function useDonations(campaignId: string, options: DonationsQueryOptions & { backgroundPoll?: boolean } = {}) {
  return useQuery({
    queryKey: ['donations', campaignId],
    queryFn: () => donationsApi.byCampaign(campaignId),
    enabled: Boolean(campaignId),
    refetchInterval: (query) => {
      if (options.pollForDonation?.(query.state.data)) return 3_000
      if (options.backgroundPoll) return BACKGROUND_POLL_MS
      return false
    },
  })
}

export function useCreateDonation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDonationBody) => donationsApi.create(body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['donations', variables.campaign_id] })
    },
  })
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => usersApi.me(),
  })
}

export function usePublicProfile(userId: string) {
  return useQuery({
    queryKey: ['publicProfile', userId],
    queryFn: () => usersApi.byId(userId, 'public'),
    enabled: Boolean(userId),
  })
}

export function useSetEmojiStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => usersApi.setEmojiStatus(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useSetProfilePrivacy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (isPublic: boolean) => usersApi.setProfilePrivacy(isPublic),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['publicProfile'] })
    },
  })
}

export function useUserCampaigns(userId: string, view: 'private' | 'public' = 'private') {
  return useQuery({
    queryKey: ['userCampaigns', userId, view, i18n.language],
    queryFn: () => usersApi.campaigns(userId, view),
    enabled: Boolean(userId),
    staleTime: 0,
    refetchInterval: (query) => userCampaignsPollIntervalMs(query.state.data),
  })
}

export function useUserDonations(userId: string, view: 'private' | 'public' = 'private') {
  return useQuery({
    queryKey: ['userDonations', userId, view, i18n.language],
    queryFn: () => usersApi.donations(userId, view),
    enabled: Boolean(userId),
  })
}

export function useTonPrice() {
  return useQuery({
    queryKey: ['tonPrice'],
    queryFn: () => priceApi.ton(),
    refetchInterval: 60_000,
  })
}

export function useExpenseReport(campaignId: string, enabled = true) {
  return useQuery({
    queryKey: ['expenseReport', campaignId],
    queryFn: () => expenseReportsApi.get(campaignId),
    enabled: Boolean(campaignId) && enabled,
    retry: false,
  })
}

export function useSubmitExpenseReport(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SubmitExpenseReportBody) => expenseReportsApi.submit(campaignId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenseReport', campaignId] })
      void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
    },
  })
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => leaderboardApi.get(),
    staleTime: 60_000,
  })
}
