import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import type { KycPendingAction, KycRejection } from '../../api/kyc'
import type { KycLevelDefinition } from '../../constants/kycLevels'

interface Props {
  status: 'verified' | 'pending' | 'rejected'
  level?: number
  nextLevel?: KycLevelDefinition | null
  rejection?: KycRejection | null
  rejectionReason?: string | null
  pendingAction?: KycPendingAction | null
  onContinue?: () => void
  onRetry?: () => void | Promise<void>
  isRetrying?: boolean
  returnTo?: string
}

function ResultIcon({ status }: { status: Props['status'] }) {
  if (status === 'verified') {
    return (
      <div
        className="relative mb-7 flex h-[104px] w-[104px] items-center justify-center"
        aria-hidden="true"
      >
        <div className="absolute inset-0 rounded-full bg-[rgba(30,158,82,.16)] motion-safe:animate-[hw-ring_1.8s_ease-out_infinite]" />
        <div className="relative flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[#1E9E52] motion-safe:animate-[hw-pop_.5s_cubic-bezier(.2,.7,.3,1.4)_both]">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6.5L9.2 17.5 4 12.3" />
          </svg>
        </div>
      </div>
    )
  }

  const color = status === 'pending' ? '#C77700' : '#D93025'
  const bg = status === 'pending' ? 'rgba(255,149,0,.13)' : 'rgba(217,48,37,.1)'

  return (
    <div
      className="mb-7 flex h-[104px] w-[104px] items-center justify-center rounded-full"
      style={{ background: bg }}
      aria-hidden="true"
    >
      {status === 'pending' ? (
        <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.2v5l3.2 2" />
        </svg>
      ) : (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 6.5l-11 11M6.5 6.5l11 11" />
        </svg>
      )}
    </div>
  )
}

export function KycResult({
  status,
  level,
  nextLevel,
  rejection,
  rejectionReason,
  pendingAction,
  onContinue,
  onRetry,
  isRetrying = false,
  returnTo = '/create',
}: Props) {
  const { t } = useTranslation(['kyc', 'common'])
  const navigate = useNavigate()
  const isFinalRejection = rejection?.type === 'final' || rejection?.type === 'duplicate'
  const reason = rejection?.message ?? rejectionReason

  if (status === 'verified') {
    return (
      <div className="tg-app-viewport flex flex-col bg-[var(--tg-theme-bg-color,#fff)] px-6 py-6 text-[var(--tg-theme-text-color,#1C1C1E)]">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <ResultIcon status="verified" />
          <h1 className="text-[26px] font-bold leading-tight tracking-normal">
            {t('result.verifiedTitle', { level: level ?? 2 })}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
            {nextLevel
              ? t('result.nextLevel', { level: nextLevel.level, title: t(`common:kycLevels.${nextLevel.level}`) })
              : t('result.maxLevel')}
          </p>
        </div>
        <button
          onClick={() => navigate(nextLevel?.route ?? returnTo)}
          className="min-h-[52px] w-full rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        >
          {nextLevel ? t('result.goToKyc', { level: nextLevel.level }) : returnTo === '/create' ? t('result.createCampaign') : t('result.return')}
        </button>
      </div>
    )
  }

  if (status === 'pending') {
    const canResume = pendingAction?.type === 'resume'
    return (
      <div className="tg-app-viewport flex flex-col bg-[var(--tg-theme-bg-color,#fff)] px-6 py-6 text-[var(--tg-theme-text-color,#1C1C1E)]">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <ResultIcon status="pending" />
          <h1 className="text-[26px] font-bold leading-tight tracking-normal">
            {canResume ? t('result.pendingResumeTitle') : t('result.pendingTitle')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
            {canResume ? t('result.pendingResumeText') : t('result.pendingText')}
          </p>
        </div>
        {canResume ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onContinue}
              className="min-h-[52px] w-full rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
            >
              {t('result.continueVerification')}
            </button>
            <button
              type="button"
              onClick={() => void onRetry?.()}
              disabled={isRetrying}
              className="min-h-[52px] w-full rounded-[14px] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] px-4 text-[17px] font-semibold text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-80 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
            >
              {isRetrying ? t('common.loading') : t('result.startAgain')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="min-h-[52px] w-full rounded-[14px] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] px-4 text-[17px] font-semibold text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
          >
            {t('result.returnToProfile')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="tg-app-viewport flex flex-col bg-[var(--tg-theme-bg-color,#fff)] px-6 py-6 text-[var(--tg-theme-text-color,#1C1C1E)]">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <ResultIcon status="rejected" />
        <h1 className="text-[26px] font-bold leading-tight tracking-normal">
          {isFinalRejection ? t('result.errorTitle') : t('result.rejectedTitle')}
        </h1>
        {reason && (
          <div className="mt-5 w-full rounded-[14px] border border-[rgba(217,48,37,.18)] bg-[rgba(217,48,37,.08)] p-4 text-left">
            <div className="text-[13px] font-semibold text-[#D93025]">{t('result.reason')}</div>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--tg-theme-text-color,#3a3a3c)]">{reason}</p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {!isFinalRejection && (
          <button
            onClick={onRetry}
            className="min-h-[52px] w-full rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
          >
            {t('result.tryAgain')}
          </button>
        )}
        <Link
          to="/profile/support"
          className="min-h-[44px] text-center text-[15px] font-medium leading-[44px] text-[var(--tg-theme-link-color,#007AFF)] underline-offset-2"
        >
          {t('result.contactSupport')}
        </Link>
      </div>
    </div>
  )
}
