import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { kycApi, type MockKycResult } from '../api/kyc'
import { useBackButton } from '../hooks/useBackButton'
import { MockSumsubVerification } from '../components/kyc/MockSumsubVerification'
import { KycResult } from '../components/kyc/KycResult'
import {
  KYC_MAX_VISIBLE_LEVEL,
  VISIBLE_KYC_LEVELS,
  filterVisibleKycLevels,
  getKycLevel,
  getNextVisibleKycLevel,
  getKycVerificationSteps,
  isKycLevelVisible,
  parseTargetKycLevel,
  type KycVerificationLevel,
} from '../constants/kycLevels'
import { deriveScreen, getRequirementRows, getReturnTo, type UserAction } from '../utils/kycPageState'
import { BackButton, RequirementRow } from '../components/kyc/KycPageControls'

const SumsubVerification = lazy(() =>
  import('../components/kyc/SumsubVerification').then((module) => ({
    default: module.SumsubVerification,
  })),
)

function KycFullScreenSpinner() {
  return (
    <div className="tg-app-viewport flex items-center justify-center bg-[var(--tg-theme-bg-color,#fff)]">
      <div className="h-8 w-8 rounded-full border-2 border-[var(--tg-theme-button-color,#007AFF)] border-t-transparent motion-safe:animate-spin" />
    </div>
  )
}

function openVerificationUrl(url: string) {
  const webApp = window.Telegram?.WebApp
  if (webApp?.openLink) {
    webApp.openLink(url, { try_instant_view: false })
    return
  }
  window.location.assign(url)
}

export function KycPage() {
  const { t } = useTranslation(['kyc', 'common'])
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const queryClient = useQueryClient()
  const returnTo = getReturnTo(location.state)
  const routeTargetLevel = parseTargetKycLevel(params.targetLevel)
  const [userAction, setUserAction] = useState<UserAction>('idle')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenMeta, setTokenMeta] = useState<{
    mock: boolean
    provider: 'mock' | 'sumsub' | 'didit'
    targetLevel: KycVerificationLevel
    verificationUrl?: string
  } | null>(null)
  const [mockStep, setMockStep] = useState(0)
  const [sdkStep, setSdkStep] = useState(0)
  const [mockError, setMockError] = useState<string | null>(null)

  const { data: kycStatus, isLoading } = useQuery({
    queryKey: ['kycStatus'],
    queryFn: () => kycApi.getStatus(),
    refetchInterval: (query) => {
      const d = query.state.data
      if (!d) return false
      if (d.status === 'pending') return 5000
      if (d.status === 'rejected' || d.status === 'rejected_duplicate') return false
      return false
    },
  })

  const nextLevel = getNextVisibleKycLevel(kycStatus?.kycLevel ?? 0)
  const nextVerificationLevel =
    nextLevel === 2 || nextLevel === 3 || nextLevel === 4 ? nextLevel : 2
  const targetLevel: KycVerificationLevel = routeTargetLevel ?? nextVerificationLevel
  const target = getKycLevel(targetLevel)
  const currentLevel = getKycLevel(kycStatus?.kycLevel ?? 0)
  const levels = kycStatus?.levels?.length
    ? filterVisibleKycLevels(kycStatus.levels)
    : VISIBLE_KYC_LEVELS
  const stepCount = getKycVerificationSteps(targetLevel).length
  const requirementRows = getRequirementRows(targetLevel)
  const kyc4Eligibility = kycStatus?.kyc4Eligibility ?? null
  const kyc4Blocked = targetLevel === 4 && kyc4Eligibility && !kyc4Eligibility.eligible
  const providerCapabilities = kycStatus?.providerCapabilities
  const unavailableForProvider = Boolean(
    providerCapabilities?.provider === 'didit' &&
      !providerCapabilities.enabledLevels.includes(targetLevel),
  )
  const processorName = providerCapabilities?.provider === 'didit' ? 'Didit' : 'Sumsub'

  const { mutateAsync: getToken, isPending: tokenLoading, error: tokenError } = useMutation({
    mutationFn: () => kycApi.getToken(targetLevel),
  })

  useEffect(() => {
    if (params.targetLevel && !isKycLevelVisible(Number(params.targetLevel))) {
      navigate('/profile/verification', { replace: true })
    }
  }, [params.targetLevel, navigate])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.has('verificationSessionId') || params.has('status')) {
      void queryClient.invalidateQueries({ queryKey: ['kycStatus'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  }, [location.search, queryClient])

  const { mutateAsync: completeMock, isPending: completingMock } = useMutation({
    mutationFn: (result: MockKycResult) => kycApi.completeMock(result, targetLevel),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kycStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ])
      setUserAction('idle')
      setAccessToken(null)
      setTokenMeta(null)
      setMockStep(0)
    },
  })

  const { mutateAsync: retrySession, isPending: retryingSession } = useMutation({
    mutationFn: () => kycApi.retrySession(targetLevel),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kycStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ])
    },
  })

  const screen = deriveScreen(kycStatus, isLoading, userAction, accessToken, targetLevel)

  useBackButton(() => {
    if (screen === 'verifying') {
      setUserAction('idle')
      setAccessToken(null)
      setTokenMeta(null)
      return
    }
    navigate('/profile')
  })

  async function handleStart() {
    if (kyc4Blocked || unavailableForProvider) return
    setMockError(null)
    const token = await getToken()
    if (token.provider === 'didit' && token.verificationUrl) {
      openVerificationUrl(token.verificationUrl)
      return
    }
    setAccessToken(token.accessToken)
    setTokenMeta({
      mock: token.mock,
      provider: token.provider,
      targetLevel: token.targetLevel,
      verificationUrl: token.verificationUrl,
    })
    setUserAction('verifying')
    setMockStep(0)
    setSdkStep(0)
  }

  async function handleTokenExpired(): Promise<string> {
    const token = await getToken()
    setAccessToken(token.accessToken)
    setTokenMeta({
      mock: token.mock,
      provider: token.provider,
      targetLevel: token.targetLevel,
      verificationUrl: token.verificationUrl,
    })
    return token.accessToken
  }

  function handleStatusChange(status: string) {
    setSdkStep((prev) => Math.min(prev + 1, stepCount - 1))
    if (status === 'GREEN' || status === 'RED') {
      setUserAction('idle')
      void queryClient.invalidateQueries({ queryKey: ['kycStatus'] })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  async function handleMockComplete(result: MockKycResult) {
    try {
      setMockError(null)
      await completeMock(result)
    } catch (error) {
      setMockError(error instanceof Error ? error.message : t('levels.startError'))
    }
  }

  function handleContinuePending() {
    const verificationUrl = kycStatus?.pendingAction?.verificationUrl
    if (verificationUrl) {
      openVerificationUrl(verificationUrl)
    }
  }

  async function handleRestartPending() {
    setMockError(null)
    await retrySession()
    await handleStart()
  }

  function handleRetry() {
    setUserAction('idle')
    setAccessToken(null)
    setTokenMeta(null)
    setMockStep(0)
    setSdkStep(0)
    setMockError(null)
  }

  if (screen === 'loading') {
    return <KycFullScreenSpinner />
  }

  if (screen === 'verifying' && accessToken) {
    if (tokenMeta?.mock) {
      return (
        <MockSumsubVerification
          currentStep={mockStep}
          targetLevel={tokenMeta.targetLevel}
          targetTitle={t(`common:kycLevels.${getKycLevel(tokenMeta.targetLevel).level}`)}
          isCompleting={completingMock}
          error={mockError}
          onBack={handleRetry}
          onStepForward={() => setMockStep((step) => Math.min(step + 1, getKycVerificationSteps(tokenMeta.targetLevel).length - 1))}
          onComplete={(result) => void handleMockComplete(result)}
        />
      )
    }

    return (
      <Suspense fallback={<KycFullScreenSpinner />}>
        <SumsubVerification
          accessToken={accessToken}
          onTokenExpired={handleTokenExpired}
          onStatusChange={handleStatusChange}
          currentStep={sdkStep}
          targetLevel={targetLevel}
          onBack={handleRetry}
        />
      </Suspense>
    )
  }

  if (screen === 'verified') {
    return (
      <KycResult
        status="verified"
        returnTo={returnTo}
        level={kycStatus?.kycLevel}
        nextLevel={kycStatus?.nextLevel ?? null}
      />
    )
  }
  if (screen === 'pending') {
    return (
      <KycResult
        status="pending"
        pendingAction={kycStatus?.pendingAction ?? null}
        onContinue={handleContinuePending}
        onRetry={() => void handleRestartPending()}
        isRetrying={retryingSession || tokenLoading}
        returnTo={returnTo}
      />
    )
  }
  if (screen === 'rejected') {
    return (
      <KycResult
        status="rejected"
        rejection={kycStatus?.rejection ?? null}
        rejectionReason={kycStatus?.rejection_reason ?? null}
        onRetry={() => void handleStart()}
        returnTo={returnTo}
      />
    )
  }

  return (
    <div className="tg-app-viewport flex flex-col bg-[var(--tg-theme-bg-color,#fff)] text-[var(--tg-theme-text-color,#1C1C1E)]">
      <div className="relative flex h-12 shrink-0 items-center px-3">
        <BackButton onClick={() => navigate('/profile')} />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-5">
        <div className="mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-[color-mix(in_srgb,var(--tg-theme-button-color,#007AFF)_14%,transparent)]">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-button-color,#007AFF)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.5l7.5 2.8v5.7c0 4.7-3.2 8-7.5 10.2-4.3-2.2-7.5-5.5-7.5-10.2V5.3L12 2.5z" />
            <path d="M8.7 12.2l2.2 2.2 4.4-4.6" />
          </svg>
        </div>

        <h1 className="m-0 text-[26px] font-bold leading-tight tracking-normal">
          KYC {target.level}: {t(`common:kycLevels.${target.level}`)}
        </h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
          {t('levels.currentText', {
            current: currentLevel.level,
            target: target.level,
            limit: t(`common:kycLimits.${target.level}`).toLowerCase(),
          })}
        </p>

        <section className="mt-5" aria-labelledby="kyc-levels-title">
          <h2 id="kyc-levels-title" className="mb-2.5 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('levels.routeTitle')}
          </h2>
          <div className="rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] px-4 py-2">
            {levels.map((level) => {
              const done = level.level <= currentLevel.level
              const active = level.level === target.level
              const unavailable =
                providerCapabilities?.provider === 'didit' &&
                (level.level === 3 || level.level === 4) &&
                !providerCapabilities.enabledLevels.includes(level.level)
              return (
                <div
                  key={level.level}
                  className="flex items-start gap-3 py-2.5"
                  style={{
                    borderBottom:
                      level.level === levels.at(-1)?.level
                        ? 'none'
                        : '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 14%, transparent)',
                  }}
                >
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{
                      background: done
                        ? 'rgba(30,158,82,.12)'
                        : active
                          ? 'color-mix(in srgb, var(--tg-theme-button-color,#007AFF) 14%, transparent)'
                          : 'var(--tg-theme-bg-color,#fff)',
                      color: done
                        ? '#1E9E52'
                        : active
                          ? 'var(--tg-theme-link-color,#007AFF)'
                          : 'var(--tg-theme-hint-color,#8E8E93)',
                    }}
                  >
                    {done ? '✓' : level.level}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[14px] font-semibold leading-snug">
                        KYC {level.level} · {t(`common:kycLevels.${level.level}`)}
                      </p>
                      {active && (
                        <span className="shrink-0 rounded-full bg-[var(--tg-theme-bg-color,#fff)] px-2 py-1 text-[11px] font-bold text-[var(--tg-theme-link-color,#007AFF)]">
                          {t('levels.current')}
                        </span>
                      )}
                      {unavailable && (
                        <span className="shrink-0 rounded-full bg-[var(--tg-theme-bg-color,#fff)] px-2 py-1 text-[11px] font-bold text-[var(--tg-theme-hint-color,#8E8E93)]">
                          {t('levels.unavailableBadge')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">
                      {t(`common:kycRequirements.${level.level}`)} · {t(`common:kycLimits.${level.level}`)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-5" aria-labelledby="kyc-requirements-title">
          <h2 id="kyc-requirements-title" className="mb-2.5 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('levels.requirementsTitle')}
          </h2>
          <div className="rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] px-4 py-0.5">
            {requirementRows.map((item, index) => (
              <RequirementRow
                key={item}
                icon={index === 0 ? 'document' : 'camera'}
                withDivider={index < requirementRows.length - 1}
              >
                {t(`requirements.${item}`)}
              </RequirementRow>
            ))}
          </div>
        </section>

        {KYC_MAX_VISIBLE_LEVEL >= 3 && (
          <section className="mt-5" aria-labelledby="kyc-trust-score-title">
            <h2 id="kyc-trust-score-title" className="mb-2.5 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('levels.trustScoreTitle')}
            </h2>
            <div className="rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] p-4">
              <p className="text-[13.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
                {t('levels.trustScoreText')}
              </p>
            </div>
          </section>
        )}

        <section className="mt-5" aria-labelledby="kyc-processor-title">
          <h2 id="kyc-processor-title" className="mb-2.5 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('levels.processorTitle')}
          </h2>
          <div className="flex items-start gap-3 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] p-4">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_16%,transparent)] bg-[var(--tg-theme-bg-color,#fff)]">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-hint-color,#8E8E93)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <p className="min-w-0 text-[13.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
              <strong className="font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">{processorName}</strong> {t('levels.sumsubProcesses')}{' '}
              <strong className="font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">HARMONY</strong> {t('levels.harmonyReceives')}
            </p>
          </div>
        </section>

        {kyc4Blocked && (
          <section className="mt-5" aria-labelledby="kyc4-blocker-title">
            <h2 id="kyc4-blocker-title" className="mb-2.5 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('levels.kyc4Title')}
            </h2>
            <div className="rounded-2xl border border-[rgba(217,48,37,.16)] bg-[rgba(217,48,37,.07)] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(217,48,37,.1)] text-[#D93025]">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5" />
                    <path d="M12 16h.01" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">
                    {t('levels.successfulCampaigns', {
                      current: kyc4Eligibility.successfulCampaigns,
                      required: kyc4Eligibility.requiredSuccessfulCampaigns,
                    })}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(217,48,37,.14)]">
                    <div
                      className="h-full rounded-full bg-[#D93025] transition-[width]"
                      style={{
                        width: `${Math.min(100, (kyc4Eligibility.successfulCampaigns / kyc4Eligibility.requiredSuccessfulCampaigns) * 100)}%`,
                      }}
                    />
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {kyc4Eligibility.blockingReasons.map((reason) => (
                      <li key={reason} className="text-[13px] leading-snug text-[#D93025]">
                        {reason}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate('/profile/campaigns')}
                    className="mt-3 min-h-[42px] rounded-[12px] bg-[var(--tg-theme-bg-color,#fff)] px-4 text-[14px] font-semibold text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
                  >
                    {t('levels.openMyCampaigns')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {tokenError && (
          <div className="mt-4 rounded-[14px] border border-[rgba(217,48,37,.18)] bg-[rgba(217,48,37,.08)] px-4 py-3 text-[13.5px] leading-relaxed text-[#D93025]">
            {tokenError instanceof Error ? tokenError.message : t('levels.startError')}
          </div>
        )}
      </main>

      <div className="tg-safe-bottom shrink-0 px-[22px] pt-3">
        <button
          onClick={() => void handleStart()}
          disabled={tokenLoading || Boolean(kyc4Blocked) || unavailableForProvider}
          className="min-h-[52px] w-full rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        >
          {tokenLoading
            ? t('common.loading')
            : unavailableForProvider
              ? t('levels.levelUnavailable')
              : kyc4Blocked
                ? t('levels.kyc4Unavailable')
                : t('levels.startKyc', { level: target.level })}
        </button>
      </div>

    </div>
  )
}
