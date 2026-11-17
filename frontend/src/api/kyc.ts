import { api } from './client'
import type { KycLevelDefinition, KycVerificationLevel } from '../constants/kycLevels'

export interface KycTokenResponse {
  accessToken: string
  token?: string
  applicantId: string
  verificationUrl?: string
  provider: 'mock' | 'sumsub' | 'didit'
  mock: boolean
  targetLevel: KycVerificationLevel
  target: KycLevelDefinition
}

export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected' | 'rejected_duplicate'

export interface KycRejection {
  type: 'retry' | 'final' | 'duplicate' | 'unknown'
  message: string
  labels: string[]
}

export interface KycPendingAction {
  type: 'resume'
  provider: 'didit'
  targetLevel: KycVerificationLevel
  verificationUrl: string
}

export interface KycStatusResponse {
  status: KycStatus
  kycStatus?: KycStatus
  kycLevel: number
  kyc_level?: number
  provider: 'mock' | 'sumsub' | 'didit' | null
  kycProvider?: string | null
  verifiedAt: string | null
  kycVerifiedAt?: string | null
  applicantId: string | null
  currentLevel: KycLevelDefinition
  nextLevel: KycLevelDefinition | null
  levels: KycLevelDefinition[]
  campaignGoalMaxUsd?: number | null
  providerCapabilities?: {
    provider: 'mock' | 'sumsub' | 'didit'
    enabledLevels: KycVerificationLevel[]
  }
  pendingAction?: KycPendingAction | null
  kyc4Eligibility: {
    eligible: boolean
    requiredSuccessfulCampaigns: number
    successfulCampaigns: number
    blockingReasons: string[]
  } | null
  rejection: KycRejection | null
  rejection_reason?: string | null
}

export type MockKycResult = 'approved' | 'rejected_retry' | 'rejected_final'

export const kycApi = {
  getToken: (targetLevel?: KycVerificationLevel) =>
    api.post<KycTokenResponse>('/kyc/session', { targetLevel }),
  getStatus: () => api.get<KycStatusResponse>('/kyc/status'),
  retrySession: (targetLevel?: KycVerificationLevel) =>
    api.post<{ ok: boolean; provider: 'didit'; targetLevel: KycVerificationLevel }>('/kyc/session/retry', { targetLevel }),
  completeMock: (result: MockKycResult, targetLevel?: KycVerificationLevel) =>
    api.post<KycStatusResponse>('/kyc/mock/complete', { result, targetLevel }),
}
