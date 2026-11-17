import type { KycLevel } from '../types'

export interface KycLevelDefinition {
  level: KycLevel
  code: string
  title: string
  requirement: string
  limit: string
  sumsubLevelName: string | null
  route: string | null
  availableInMock: boolean
  availableInSumsub: boolean
}

export type KycVerificationLevel = 2 | 3 | 4 | 5
export type KycNextLevel = 1 | 2 | 3 | 4

export const KYC_MAX_VISIBLE_LEVEL = (() => {
  const parsed = Number(import.meta.env.VITE_KYC_MAX_VISIBLE_LEVEL)
  if (!Number.isFinite(parsed)) return 2
  return Math.min(5, Math.max(2, Math.floor(parsed)))
})()

export function isKycLevelVisible(level: number): boolean {
  return level <= KYC_MAX_VISIBLE_LEVEL
}

export const KYC_LEVEL_LABELS: Record<KycLevel, string> = {
  0: 'Guest',
  1: 'Donor',
  2: 'Recipient',
  3: 'Recipient+',
  4: 'Full KYC',
  5: 'NGO / organization',
}

export const KYC_LEVELS: KycLevelDefinition[] = [
  {
    level: 0,
    code: 'guest',
    title: 'Guest',
    requirement: 'Telegram account',
    limit: 'View and share',
    sumsubLevelName: null,
    route: null,
    availableInMock: false,
    availableInSumsub: false,
  },
  {
    level: 1,
    code: 'donor',
    title: 'Donor',
    requirement: 'TON Connect wallet',
    limit: 'Unlimited donations',
    sumsubLevelName: null,
    route: null,
    availableInMock: false,
    availableInSumsub: false,
  },
  {
    level: 2,
    code: 'recipient_start',
    title: 'Recipient',
    requirement: 'ID document, selfie, and liveness',
    limit: 'Campaigns up to $1,000',
    sumsubLevelName: 'basic-kyc-level',
    route: '/kyc/level/2',
    availableInMock: true,
    availableInSumsub: true,
  },
  {
    level: 3,
    code: 'recipient_verified',
    title: 'Recipient+',
    requirement: 'Document, liveness, and proof of address',
    limit: 'Campaigns up to $10,000',
    sumsubLevelName: 'extended-kyc-level',
    route: '/kyc/level/3',
    availableInMock: true,
    availableInSumsub: true,
  },
  {
    level: 4,
    code: 'recipient_full',
    title: 'Full KYC',
    requirement: 'Proof of address, 2 videos, and 2+ successful campaigns',
    limit: 'No limit',
    sumsubLevelName: 'full-kyc-level',
    route: '/kyc/level/4',
    availableInMock: true,
    availableInSumsub: true,
  },
  {
    level: 5,
    code: 'organization',
    title: 'NGO / organization',
    requirement: 'On-chain/multisig organization verification',
    limit: 'No limit',
    sumsubLevelName: null,
    route: '/kyc/level/5',
    availableInMock: true,
    availableInSumsub: false,
  },
]

export const VISIBLE_KYC_LEVELS: KycLevelDefinition[] = KYC_LEVELS.filter((item) =>
  isKycLevelVisible(item.level),
)

export function filterVisibleKycLevels<T extends { level: number }>(levels: T[]): T[] {
  return levels.filter((item) => isKycLevelVisible(item.level))
}

export function normalizeKycLevel(level: number | null | undefined): KycLevel {
  if (!level || level <= 0) return 0
  if (level >= 5) return 5
  return level as KycLevel
}

export function getKycLevel(level: number | null | undefined): KycLevelDefinition {
  const normalized = normalizeKycLevel(level)
  return KYC_LEVELS.find((item) => item.level === normalized) ?? KYC_LEVELS[0]!
}

export function getNextKycLevel(level: number | null | undefined): KycNextLevel | null {
  const next = normalizeKycLevel(level) + 1
  if (next < 1 || next > 4) return null
  return next as KycNextLevel
}

export function getNextVisibleKycLevel(level: number | null | undefined): KycNextLevel | null {
  const next = getNextKycLevel(level)
  return next !== null && isKycLevelVisible(next) ? next : null
}

export function parseTargetKycLevel(value: string | undefined): KycVerificationLevel | null {
  const level = Number(value)
  if (level === 2 || level === 3 || level === 4 || level === 5) {
    return isKycLevelVisible(level) ? level : null
  }
  return null
}

export function getKycVerificationSteps(level: KycVerificationLevel): string[] {
  if (level === 3) return ['document', 'selfie', 'address', 'processing']
  if (level === 4) return ['document', 'selfie', 'address', 'video1', 'video2', 'campaigns', 'processing']
  if (level === 5) return ['organization', 'documents', 'representative', 'moderation']
  return ['document', 'selfie', 'processing']
}
