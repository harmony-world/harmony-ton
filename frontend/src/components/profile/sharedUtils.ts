import type { CSSProperties } from 'react'
import type { KycStatus, KycStatusResponse } from '../../api/kyc'
import type { UserProfile } from '../../api/users'
import type { KycLevel } from '../../types'

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad'

export const toneColors: Record<Tone, { color: string; bg: string }> = {
  neutral: {
    color: 'var(--tg-theme-hint-color, #8E8E93)',
    bg: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
  },
  ok: { color: '#1E9E52', bg: 'rgba(30,158,82,.12)' },
  warn: { color: '#C77700', bg: 'rgba(255,149,0,.13)' },
  bad: { color: '#D93025', bg: 'rgba(217,48,37,.1)' },
}

export function cardStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
    border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)',
    ...extra,
  }
}

export function normalizeKycStatus(
  profile?: UserProfile | null,
  kycStatus?: KycStatusResponse | null,
): KycStatus {
  if ((profile?.kycLevel ?? kycStatus?.kycLevel ?? 0) >= 1) return 'approved'
  return kycStatus?.status ?? (profile?.kycStatus as KycStatus | undefined) ?? 'not_started'
}

export function kycTone(status: KycStatus): Tone {
  if (status === 'approved') return 'ok'
  if (status === 'pending') return 'warn'
  if (status === 'rejected' || status === 'rejected_duplicate') return 'bad'
  return 'neutral'
}

type Translate = (key: string, options?: Record<string, unknown>) => string

export function kycText(status: KycStatus, level: KycLevel, t?: Translate) {
  if (status === 'approved' || level >= 1) {
    const approvedLevel = Math.max(level, 1) as KycLevel
    const levelTitle = t ? t(`common:kycLevels.${approvedLevel}`) : `KYC ${approvedLevel}`
    return {
      label: `KYC ${approvedLevel} · ${levelTitle}`,
      chip: `KYC ${approvedLevel}`,
    }
  }
  if (status === 'pending') {
    return {
      label: t ? t('profile:kyc.pendingLabel') : 'KYC 0 · Under review',
      chip: t ? t('profile:kyc.pendingChip') : 'Under review',
    }
  }
  if (status === 'rejected' || status === 'rejected_duplicate')
    return {
      label: t ? t('profile:kyc.rejectedLabel') : 'KYC 0 · Rejected',
      chip: t ? t('profile:kyc.rejectedChip') : 'Rejected',
    }
  return {
    label: t ? t('profile:kyc.notStartedLabel') : 'KYC 0 · Not verified',
    chip: t ? t('profile:kyc.notStartedChip') : 'Not passed',
  }
}
