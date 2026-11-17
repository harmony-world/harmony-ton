import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { kycApi, type KycStatus } from '../api/kyc'
import {
  useProfile,
  usePublicProfile,
  useSetEmojiStatus,
  useSetProfilePrivacy,
  useUserCampaigns,
  useUserDonations,
} from '../hooks/useApi'
import { requestEmojiStatusAccess, shareText as shareTextUtil, shareViaPreparedMessage } from '../utils/telegram'
import { prepareShare } from '../api/share'
import { BOT_USERNAME } from '../utils/env'
import { PageSkeleton } from '../components/PageSkeleton'
import { ErrorState } from '../components/ErrorState'
import { getDonorLevel } from '../constants/donorLevels'
import {
  KYC_MAX_VISIBLE_LEVEL,
  VISIBLE_KYC_LEVELS,
  filterVisibleKycLevels,
  getNextVisibleKycLevel,
  normalizeKycLevel,
  type KycVerificationLevel,
} from '../constants/kycLevels'
import {
  ShieldIcon,
  SpinnerIcon,
  PageHeader,
} from '../components/profile/shared'
import {
  cardStyle,
  kycText,
  kycTone,
  normalizeKycStatus,
  toneColors,
} from '../components/profile/sharedUtils'
import { ProfileIdentity, StatsRow } from '../components/profile/ProfileHeader'
import { NavIcon } from '../components/profile/NavRow'
import {
  DonationCampaignCard,
  ProfileCampaignCard,
  StatusTabs,
} from '../components/profile/ProfileActivityCards'
import { filterByStatusTab, type StatusTab } from '../components/profile/activityUtils'

export function PublicProfilePage() {
  const { t } = useTranslation('profile')
  const { userId = '' } = useParams<{ userId: string }>()
  const {
    data: profile,
    isLoading: profileLoading,
    isError,
    refetch,
  } = usePublicProfile(userId)
  const { data: campaigns = [], isLoading: campaignsLoading } = useUserCampaigns(userId, 'public')
  const { data: donations = [], isLoading: donationsLoading } = useUserDonations(userId, 'public')
  const isLoading = profileLoading || campaignsLoading || donationsLoading
  const [visibleCampaigns, setVisibleCampaigns] = useState(3)
  const [visibleDonations, setVisibleDonations] = useState(3)

  if (isLoading) return <PageSkeleton />
  if (isError || !profile) {
    return (
      <div className="flex min-h-full flex-col text-[var(--tg-theme-text-color,#1C1C1E)]">
        <PageHeader title={t('public.title')} />
        <main className="flex-1">
          <ErrorState message={t('public.notFound')} onRetry={() => void refetch()} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col text-[var(--tg-theme-text-color,#1C1C1E)]">
      <PageHeader title={t('public.title')} />
      <main className="px-4 pb-8 pt-4">
        <ProfileIdentity profile={profile} showPrivateBadges={false} />
        <StatsRow profile={profile} campaigns={campaigns} donations={donations} />

        <section className="mt-6" aria-labelledby="public-profile-campaigns-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="public-profile-campaigns-title" className="text-[18px] font-bold leading-tight tracking-normal">
              {t('public.campaigns')}
            </h2>
            <span className="text-[13px] font-semibold text-[var(--tg-theme-hint-color,#8E8E93)]">
              {campaigns.length}
            </span>
          </div>
          {campaigns.length === 0 ? (
            <div className="rounded-2xl px-5 py-7 text-center" style={cardStyle()}>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tg-theme-bg-color,#fff)]">
                <NavIcon type="campaign" />
              </div>
              <p className="text-[15px] font-semibold">{t('public.campaignsEmptyTitle')}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
                {t('public.campaignsEmptyText')}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3.5">
                {campaigns.slice(0, visibleCampaigns).map((campaign) => (
                  <ProfileCampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
              {campaigns.length > visibleCampaigns && (
                <button
                  type="button"
                  onClick={() => setVisibleCampaigns((v) => v + 5)}
                  className="mt-3 w-full py-2.5 rounded-xl text-[14px] font-semibold transition-opacity active:opacity-70"
                  style={{ background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)', color: 'var(--tg-theme-link-color, #007AFF)' }}
                >
                  {t('public.showMore')}
                </button>
              )}
            </>
          )}
        </section>

        <section className="mt-6" aria-labelledby="public-profile-donations-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="public-profile-donations-title" className="text-[18px] font-bold leading-tight tracking-normal">
              {t('public.donationsTitle')}
            </h2>
            <span className="text-[13px] font-semibold text-[var(--tg-theme-hint-color,#8E8E93)]">
              {donations.length}
            </span>
          </div>
          {donations.length === 0 ? (
            <div className="rounded-2xl px-5 py-7 text-center" style={cardStyle()}>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tg-theme-bg-color,#fff)]">
                <NavIcon type="heart" />
              </div>
              <p className="text-[15px] font-semibold">{t('public.donationsEmptyTitle')}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
                {t('public.donationsEmptyText')}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3.5">
                {donations.slice(0, visibleDonations).map((donation) => (
                  <DonationCampaignCard key={donation.id} donation={donation} amountLabel={t('activity.donation')} />
                ))}
              </div>
              {donations.length > visibleDonations && (
                <button
                  type="button"
                  onClick={() => setVisibleDonations((v) => v + 5)}
                  className="mt-3 w-full py-2.5 rounded-xl text-[14px] font-semibold transition-opacity active:opacity-70"
                  style={{ background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)', color: 'var(--tg-theme-link-color, #007AFF)' }}
                >
                  {t('public.showMore')}
                </button>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function VerificationAction({
  status,
  isFinal,
  nextLevel,
  t,
}: {
  status: KycStatus
  isFinal: boolean
  nextLevel: number | null
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if ((status === 'approved' || status === 'not_started') && nextLevel === 1) {
    return (
      <Link
        to="/wallet"
        className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        style={{ textDecoration: 'none' }}
      >
        {t('verification.connectWallet')}
      </Link>
    )
  }
  if (status === 'approved' && nextLevel) {
    return (
      <Link
        to={`/kyc/level/${nextLevel}`}
        state={{ returnTo: '/profile/verification' }}
        className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        style={{ textDecoration: 'none' }}
      >
        {t('verification.goToKyc', { level: nextLevel })}
      </Link>
    )
  }
  if (status === 'approved') {
    return (
      <Link
        to="/create"
        className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        style={{ textDecoration: 'none' }}
      >
        {t('verification.createCampaign')}
      </Link>
    )
  }
  if (status === 'pending') {
    return (
      <Link
        to="/profile"
        className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] px-4 text-[17px] font-semibold text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        style={{ textDecoration: 'none' }}
      >
        {t('verification.returnToProfile')}
      </Link>
    )
  }
  if (isFinal) {
    return (
      <Link
        to="/profile/support"
        className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        style={{ textDecoration: 'none' }}
      >
        {t('verification.contactSupport')}
      </Link>
    )
  }
  return (
    <Link
      to="/kyc/level/2"
      state={{ returnTo: '/profile' }}
      className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] px-4 text-[17px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      style={{ textDecoration: 'none' }}
    >
      {status === 'rejected' ? t('verification.tryAgain') : t('verification.start')}
    </Link>
  )
}

export function ProfileVerificationPage() {
  const { t } = useTranslation(['profile', 'common'])
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile()
  const {
    data: kycStatus,
    isLoading: kycLoading,
    isError: kycError,
    refetch: refetchKyc,
  } = useQuery({
    queryKey: ['kycStatus'],
    queryFn: () => kycApi.getStatus(),
  })

  if (profileLoading || kycLoading) return <PageSkeleton />
  if (profileError || kycError) {
    return (
      <ErrorState
        message={t('page.loadError')}
        onRetry={() => {
          void refetchProfile()
          void refetchKyc()
        }}
      />
    )
  }

  const status = normalizeKycStatus(profile, kycStatus)
  const level = normalizeKycLevel(profile?.kycLevel ?? kycStatus?.kycLevel ?? 0)
  const nextLevel = getNextVisibleKycLevel(level)
  const levels = kycStatus?.levels?.length
    ? filterVisibleKycLevels(kycStatus.levels)
    : VISIBLE_KYC_LEVELS
  const tone = kycTone(status)
  const { label } = kycText(status, level, t)
  const isFinal =
    kycStatus?.rejection?.type === 'final' ||
    kycStatus?.rejection?.type === 'duplicate' ||
    status === 'rejected_duplicate'
  const showReason = status === 'rejected' || status === 'rejected_duplicate'
  const reason = kycStatus?.rejection?.message ?? kycStatus?.rejection_reason
  const providerCapabilities = kycStatus?.providerCapabilities
  const processorName = providerCapabilities?.provider === 'didit' ? 'Didit' : 'Sumsub'
  const title =
    status === 'approved'
      ? nextLevel
        ? t('verification.approvedTitle', { level })
        : t('verification.maxTitle')
      : status === 'pending'
        ? t('verification.pendingTitle')
        : status === 'rejected' || status === 'rejected_duplicate'
          ? isFinal
            ? t('verification.errorTitle')
            : t('verification.rejectedTitle')
      : nextLevel === 1
        ? t('verification.connectWalletTitle')
        : t('verification.confirmIdentityTitle')
  const description =
    status === 'approved'
      ? nextLevel
        ? t('verification.nextStepDescription', { level: nextLevel })
        : t('verification.maxDescription')
      : status === 'pending'
        ? t('verification.pendingDescription')
        : status === 'rejected' || status === 'rejected_duplicate'
          ? t('verification.rejectedDescription')
      : nextLevel === 1
        ? t('verification.walletDescription')
        : t('verification.identityDescription')

  return (
    <div className="flex min-h-full flex-col text-[var(--tg-theme-text-color,#1C1C1E)]">
      <PageHeader title={t('verification.title')} />
      <main className="flex-1 px-[22px] py-5">
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-5 flex h-[92px] w-[92px] items-center justify-center rounded-full"
            style={{ background: toneColors[tone].bg }}
          >
            {status === 'pending' ? <SpinnerIcon /> : <ShieldIcon tone={tone} />}
          </div>
          <h1 className="text-[24px] font-bold leading-tight tracking-normal">{title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
            {description}
          </p>
          <div
            className="mt-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold"
            style={{ background: toneColors[tone].bg, color: toneColors[tone].color }}
          >
            {status === 'pending' ? <SpinnerIcon /> : <ShieldIcon tone={tone} />}
            {label}
          </div>
        </div>

        {showReason && reason && (
          <section
            className="mt-5 rounded-[14px] border border-[rgba(217,48,37,.18)] bg-[rgba(217,48,37,.08)] p-4"
            aria-labelledby="kyc-reason-title"
          >
            <h2 id="kyc-reason-title" className="text-[13px] font-semibold text-[#D93025]">
              {t('verification.reason')}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--tg-theme-text-color,#3a3a3c)]">
              {reason}
            </p>
          </section>
        )}

        <section
          className="mt-5 rounded-2xl p-4"
          style={cardStyle()}
          aria-labelledby="kyc-levels-title"
        >
          <h2 id="kyc-levels-title" className="text-[15px] font-semibold">
            {t('verification.levels')}
          </h2>
          <div className="mt-3">
            {levels.map((item) => {
              const done = item.level <= level
              const verificationLevel =
                item.level === 2 || item.level === 3 || item.level === 4
                  ? (item.level as KycVerificationLevel)
                  : null
              const disabledByProvider = Boolean(
                providerCapabilities?.provider === 'didit' &&
                  verificationLevel &&
                  !providerCapabilities.enabledLevels.includes(verificationLevel),
              )
              const laterAction = (item.level === 5 || disabledByProvider) && item.level > level
              const walletAction = item.level === 1 && item.level > level
              const sumsubAction = item.level >= 2 && item.level > level && !laterAction
              const actionable = walletAction || sumsubAction
              return (
                <Link
                  key={item.level}
                  to={walletAction ? '/wallet' : sumsubAction ? `/kyc/level/${item.level}` : '/profile/verification'}
                  state={sumsubAction ? { returnTo: '/profile/verification' } : undefined}
                  aria-disabled={!actionable}
                  tabIndex={actionable ? undefined : -1}
                  className={`flex items-start gap-3 py-3 ${actionable ? 'transition-opacity active:opacity-75' : 'pointer-events-none'}`}
                  style={{
                    textDecoration: 'none',
                    borderBottom:
                      item.level === levels.at(-1)?.level
                        ? 'none'
                        : '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 14%, transparent)',
                  }}
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{
                      background: done
                        ? 'rgba(30,158,82,.12)'
                        : 'var(--tg-theme-bg-color,#fff)',
                      color: done ? '#1E9E52' : 'var(--tg-theme-hint-color,#8E8E93)',
                    }}
                  >
                    {done ? '✓' : item.level}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-snug text-[var(--tg-theme-text-color,#1C1C1E)]">
                      KYC {item.level} · {t(`common:kycLevels.${item.level}`)}
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">
                      {t(`common:kycRequirements.${item.level}`)} · {t(`common:kycLimits.${item.level}`)}
                    </span>
                    {disabledByProvider && (
                      <span className="mt-1 block text-[12.5px] leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">
                        {t(`verification.unavailable.${item.level}`)}
                      </span>
                    )}
                  </span>
                  {laterAction ? (
                    <span className="mt-1 text-[13px] text-[var(--tg-theme-hint-color,#8E8E93)]">
                      {t('verification.later')}
                    </span>
                  ) : actionable && (
                    <span className="mt-1 text-[13px] font-semibold text-[var(--tg-theme-link-color,#007AFF)]">
                      {t('verification.pass')}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </section>

        {KYC_MAX_VISIBLE_LEVEL >= 3 && (
          <section
            className="mt-5 rounded-2xl p-4"
            style={cardStyle()}
            aria-labelledby="kyc-trust-score-title"
          >
            <h2 id="kyc-trust-score-title" className="text-[15px] font-semibold">
              Trust Score
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('verification.trustScoreText')}
            </p>
          </section>
        )}

        <section
          className="mt-5 rounded-2xl p-4"
          style={cardStyle()}
          aria-labelledby="kyc-trust-title"
        >
          <h2 id="kyc-trust-title" className="text-[15px] font-semibold">
            {t('verification.dataProcessor')}
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
              <strong className="font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">
                {processorName}
              </strong>{' '}
            {t('verification.sumsubProcesses')}{' '}
            <strong className="font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">
              HARMONY
            </strong>{' '}
            {t('verification.harmonyReceives')}
          </p>
        </section>
      </main>
      <div className="px-[22px] pb-5">
        <VerificationAction status={status} isFinal={isFinal} nextLevel={nextLevel} t={t} />
      </div>
    </div>
  )
}

export function ProfileCampaignsPage() {
  const { t } = useTranslation('profile')
  const { data: profile, isLoading, isError, refetch } = useProfile()
  const campaignsQuery = useUserCampaigns(profile?.id ?? '')
  const campaigns = campaignsQuery.data ?? []
  const [activeTab, setActiveTab] = useState<StatusTab>('active')

  if (isLoading) return <PageSkeleton />
  if (isError || !profile || campaignsQuery.isError) {
    return (
      <ErrorState
        message={t('page.loadError')}
        onRetry={() => {
          void refetch()
          void campaignsQuery.refetch()
        }}
      />
    )
  }

  const activeCampaigns = filterByStatusTab(campaigns, 'active')
  const completedCampaigns = filterByStatusTab(campaigns, 'completed')
  const visibleCampaigns = activeTab === 'active' ? activeCampaigns : completedCampaigns

  return (
    <div className="flex min-h-full flex-col text-[var(--tg-theme-text-color,#1C1C1E)]">
      <PageHeader title={t('campaigns.title')} />
      {campaigns.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center px-10 pb-8 text-center">
          <div className="mb-5 flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)]">
            <NavIcon type="campaign" />
          </div>
          <h1 className="text-[21px] font-bold leading-snug">{t('campaigns.emptyTitle')}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('campaigns.emptyText')}
          </p>
          <Link
            to="/create"
            className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-button-color,#007AFF)] text-[16px] font-semibold text-[var(--tg-theme-button-text-color,#fff)]"
            style={{ textDecoration: 'none' }}
          >
            {t('campaigns.create')}
          </Link>
        </main>
      ) : (
        <main className="px-[18px] py-4">
          <StatusTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            activeCount={activeCampaigns.length}
            completedCount={completedCampaigns.length}
          />
          {visibleCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
              <h2 className="text-[18px] font-bold leading-snug">
                {activeTab === 'completed' ? t('campaigns.completedEmptyTitle') : t('campaigns.activeEmptyTitle')}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
                {activeTab === 'completed'
                  ? t('campaigns.completedEmptyText')
                  : t('campaigns.activeEmptyText')}
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3.5">
              {visibleCampaigns.map((campaign) => (
                <ProfileCampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  )
}

export function ProfileDonationsPage() {
  const { t } = useTranslation('profile')
  const { data: profile, isLoading, isError, refetch } = useProfile()
  const donationsQuery = useUserDonations(profile?.id ?? '')
  const donations = donationsQuery.data ?? []

  if (isLoading) return <PageSkeleton />
  if (isError || !profile || donationsQuery.isError) {
    return (
      <ErrorState
        message={t('page.loadError')}
        onRetry={() => {
          void refetch()
          void donationsQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col text-[var(--tg-theme-text-color,#1C1C1E)]">
      <PageHeader title={t('donations.title')} />
      {donations.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center px-10 pb-8 text-center">
          <div className="mb-5 flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)]">
            <NavIcon type="heart" />
          </div>
          <h1 className="text-[21px] font-bold leading-snug">{t('donations.emptyTitle')}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('donations.emptyText')}
          </p>
          <Link
            to="/"
            className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] text-[16px] font-semibold text-[var(--tg-theme-link-color,#007AFF)]"
            style={{ textDecoration: 'none' }}
          >
            {t('donations.openFeed')}
          </Link>
        </main>
      ) : (
        <main className="px-[18px] py-4">
          <div className="flex flex-col gap-3.5">
            {donations.map((donation) => (
              <DonationCampaignCard key={donation.id} donation={donation} />
            ))}
          </div>
        </main>
      )}
    </div>
  )
}

export function ProfileSettingsPage() {
  const { t } = useTranslation(['profile', 'common'])
  const { data: profile, isLoading, isError, refetch } = useProfile()
  const setProfilePrivacy = useSetProfilePrivacy()
  const setEmojiStatus = useSetEmojiStatus()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [privacyFeedback, setPrivacyFeedback] = useState<string | null>(null)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)

  if (isLoading) return <PageSkeleton />
  if (isError || !profile) {
    return <ErrorState message={t('page.loadError')} onRetry={() => void refetch()} />
  }

  const donorLevel = getDonorLevel(profile?.totalDonatedUsd ?? 0)
  const profileIsPublic = profile?.isPublic ?? true
  const emojiStatus = profile?.emojiStatus
  const telegramStatusOn = Boolean(emojiStatus?.enabled)
  const isPremium = Boolean(profile?.isPremium)
  const isReady = Boolean(emojiStatus?.ready)
  const emojiBusy = setEmojiStatus.isPending
  const privacyBusy = setProfilePrivacy.isPending
  const toggleAllowed = isPremium && isReady && !emojiBusy
  const profileName = profile?.firstName ?? profile?.username ?? t('page.userFallback')

  const gateNote = !isPremium
    ? t('settings.premiumOnly')
    : !isReady
      ? t('settings.badgesPreparing')
      : null

  const handlePrivacyToggle = async () => {
    if (privacyBusy) return
    setPrivacyFeedback(null)
    try {
      await setProfilePrivacy.mutateAsync(!profileIsPublic)
    } catch (err) {
      const message =
        (err as { message?: string; body?: { message?: string } })?.body?.message ??
        (err as { message?: string })?.message ??
        t('settings.privacyError')
      setPrivacyFeedback(message)
    }
  }

  const handleShareProfile = async () => {
    if (!profile || !profileIsPublic) return
    setShareFeedback(null)

    try {
      const { msgId } = await prepareShare('profile', profile.id)
      const result = await shareViaPreparedMessage(msgId)
      if (result !== 'unsupported') return
    } catch {  }

    const deepLink = `https://t.me/${BOT_USERNAME}?start=profile_${profile.id}`
    const text = t('share.publicProfileText', { name: profileName, link: deepLink })
    const result = await shareTextUtil(text)
    if (result === 'copied') setShareFeedback(t('share.copied'))
    else if (result === 'error') setShareFeedback(t('share.error'))
  }

  const handleToggle = async () => {
    if (!toggleAllowed) return
    setFeedback(null)
    const next = !telegramStatusOn
    try {
      if (next) {
        const granted = await requestEmojiStatusAccess()
        if (!granted) {
          setFeedback(t('settings.emojiPermissionDenied'))
          return
        }
      }
      await setEmojiStatus.mutateAsync(next)
    } catch (err) {
      const errorCode = (err as { body?: { error?: string } })?.body?.error
      if (next && errorCode === 'PERMISSION_REVOKED') {
        const reGranted = await requestEmojiStatusAccess()
        if (reGranted) {
          try {
            await setEmojiStatus.mutateAsync(next)
            return
          } catch {
          }
        }
      }
      const message =
        (err as { message?: string; body?: { message?: string } })?.body?.message ??
        (err as { message?: string })?.message ??
        t('settings.statusError')
      setFeedback(message)
    }
  }

  return (
    <div className="flex min-h-full flex-col text-[var(--tg-theme-text-color,#1C1C1E)]">
      <PageHeader title={t('settings.title')} />
      <main className="px-[18px] py-4">
        <section aria-labelledby="profile-settings-title">
          <h2
            id="profile-settings-title"
            className="px-1.5 pb-2 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]"
          >
            {t('settings.profileSection')}
          </h2>
          <div className="overflow-hidden rounded-[14px]" style={cardStyle()}>
            <div className="flex min-h-[68px] items-center gap-3 px-3.5 py-3.5">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[var(--tg-theme-bg-color,#fff)]">
                <NavIcon type="privacy" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-medium leading-snug">
                  {t('settings.publicProfile')}
                </div>
                <div className="mt-1 text-[13px] leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
                  {profileIsPublic ? t('settings.visible') : t('settings.hidden')}
                </div>
              </div>
              <button
                type="button"
                onClick={handlePrivacyToggle}
                disabled={privacyBusy}
                className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: profileIsPublic ? '#1E9E52' : 'var(--tg-theme-hint-color,#8E8E93)',
                  border: 'none',
                }}
                aria-pressed={profileIsPublic}
                aria-label={t('settings.publicProfileAria')}
              >
                <span
                  className="absolute top-[2.5px] h-[25px] w-[25px] rounded-full bg-white shadow"
                  style={{ left: profileIsPublic ? 22.5 : 2.5 }}
                />
              </button>
            </div>
            <div className="ml-[57px] h-px bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]" />
            <button
              type="button"
              onClick={() => void handleShareProfile()}
              disabled={!profile || !profileIsPublic}
              className="flex min-h-[68px] w-full items-center gap-3 px-3.5 py-3.5 text-left text-[var(--tg-theme-text-color,#1C1C1E)] transition-opacity active:opacity-75 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2 disabled:opacity-55 disabled:active:opacity-55"
              aria-label={t('share.sectionLabel')}
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[var(--tg-theme-bg-color,#fff)]">
                <NavIcon type="share" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium leading-snug">{t('share.button')}</span>
                <span className="mt-1 block text-[13px] leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
                  {profileIsPublic ? t('share.publicHint') : t('share.privateHint')}
                </span>
              </span>
            </button>
            <div className="ml-[57px] h-px bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]" />
            <div className="flex min-h-[68px] items-center gap-3 px-3.5 py-3.5">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[var(--tg-theme-bg-color,#fff)]">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--tg-theme-text-color,#1C1C1E)"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 2L11 13" />
                  <path d="M22 2l-7 20-4-9-9-4z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-medium leading-snug">
                  {t('settings.telegramStatus')}
                </div>
                <div className="mt-1 text-[13px] leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
                  {gateNote ?? (telegramStatusOn ? <><img src={donorLevel.icon} alt="" className="inline-block h-4 w-4 mr-1 align-text-bottom" />{t(`common:donorLevels.levelNames.${donorLevel.level}`)}</> : t('settings.hiddenStatus'))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggle}
                disabled={!toggleAllowed}
                className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: telegramStatusOn ? '#1E9E52' : 'var(--tg-theme-hint-color,#8E8E93)',
                  border: 'none',
                }}
                aria-pressed={telegramStatusOn}
                aria-label={t('settings.telegramStatusAria')}
              >
                <span
                  className="absolute top-[2.5px] h-[25px] w-[25px] rounded-full bg-white shadow"
                  style={{ left: telegramStatusOn ? 22.5 : 2.5 }}
                />
              </button>
            </div>
          </div>
          {privacyFeedback ? (
            <p className="px-1.5 pt-1 text-[12px] leading-relaxed text-[var(--tg-theme-destructive-text-color,#D0021B)]">
              {privacyFeedback}
            </p>
          ) : null}
          {shareFeedback ? (
            <p className="px-1.5 pt-1 text-[12px] font-medium leading-relaxed text-[var(--tg-theme-link-color,#007AFF)]">
              {shareFeedback}
            </p>
          ) : null}
          <p className="px-1.5 pt-2 text-[12px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
            {!isPremium
              ? t('settings.premiumHint')
              : !isReady
                ? t('settings.preparingHint')
                : t('settings.readyHint')}
          </p>
          {feedback ? (
            <p className="px-1.5 pt-1 text-[12px] leading-relaxed text-[var(--tg-theme-destructive-text-color,#D0021B)]">
              {feedback}
            </p>
          ) : null}
        </section>

        <section className="mt-5" aria-labelledby="profile-help-title">
          <h2
            id="profile-help-title"
            className="px-1.5 pb-2 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]"
          >
            {t('settings.supportSection')}
          </h2>
          <Link to="/profile/support" className="block overflow-hidden rounded-[14px]" style={cardStyle()}>
            <div className="flex min-h-[54px] items-center gap-3.5 px-3.5 py-3 text-[var(--tg-theme-text-color,#1C1C1E)]">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[var(--tg-theme-bg-color,#fff)]">
                <NavIcon type="support" />
              </span>
              <span className="min-w-0 flex-1 text-[16px] font-medium leading-tight">
                {t('settings.reportProblem')}
              </span>
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
                <path d="M1 1l5 5-5 5" stroke="var(--tg-theme-hint-color,#8E8E93)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </Link>
        </section>

        <section className="mt-5" aria-labelledby="profile-legal-title">
          <h2
            id="profile-legal-title"
            className="px-1.5 pb-2 text-[12px] font-semibold uppercase tracking-normal text-[var(--tg-theme-hint-color,#8E8E93)]"
          >
            {t('settings.legalSection')}
          </h2>
          <div className="overflow-hidden rounded-[14px]" style={cardStyle()}>
            {(['terms', 'privacy'] as const).map((doc, i) => (
              <Link
                key={doc}
                to={`/legal/${doc}`}
                className={`flex min-h-[54px] items-center gap-3.5 px-3.5 py-3 text-[var(--tg-theme-text-color,#1C1C1E)]${i ? ' border-t border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]' : ''}`}
              >
                <span className="min-w-0 flex-1 text-[16px] font-medium leading-tight">{t(`common:terms.${doc}`)}</span>
                <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">
                  <path d="M1 1l5 5-5 5" stroke="var(--tg-theme-hint-color,#8E8E93)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
