import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useProfile,
  useUserCampaigns,
  useUserDonations,
} from '../hooks/useApi'
import { PageSkeleton } from '../components/PageSkeleton'
import { ErrorState } from '../components/ErrorState'
import type { KycLevel } from '../types'
import {
  cardStyle,
  kycText,
  normalizeKycStatus,
} from '../components/profile/sharedUtils'
import { ProfileIdentity, StatsRow } from '../components/profile/ProfileHeader'
import { DonorLevelCard } from '../components/profile/DonorLevelCard'
import { NavRow, NavIcon } from '../components/profile/NavRow'

export function ProfilePage() {
  const { t } = useTranslation(['profile', 'common'])
  const { data: profile, isLoading, isError, refetch } = useProfile()
  const campaignsQuery = useUserCampaigns(profile?.id ?? '')
  const donationsQuery = useUserDonations(profile?.id ?? '')
  const myCampaigns = campaignsQuery.data ?? []
  const myDonations = donationsQuery.data ?? []

  if (isLoading) return <PageSkeleton />
  if (isError || !profile || campaignsQuery.isError || donationsQuery.isError) {
    return (
      <ErrorState
        message={t('page.loadError')}
        onRetry={() => {
          void refetch()
          void campaignsQuery.refetch()
          void donationsQuery.refetch()
        }}
      />
    )
  }

  const status = normalizeKycStatus(profile)
  const level = (profile?.kycLevel ?? 0) as KycLevel
  const { chip } = kycText(status, level, t)

  return (
    <div className="relative px-4 pb-8 pt-3 text-[var(--tg-theme-text-color,#1C1C1E)]">
      <Link
        to="/leaderboard"
        className="absolute right-4 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_12%,transparent)] transition-opacity active:opacity-70"
        aria-label={t('leaderboard:profileButton')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-text-color,#1C1C1E)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </Link>
      <ProfileIdentity profile={profile} />
      <StatsRow profile={profile} campaigns={myCampaigns} donations={myDonations} />
      <DonorLevelCard totalUsd={profile?.totalDonatedUsd ?? 0} />

      <nav
        className="mt-5 overflow-hidden rounded-2xl"
        style={cardStyle({ boxShadow: '0 2px 14px rgba(20,20,30,.05)' })}
        aria-label={t('page.sectionsLabel')}
      >
        <NavRow
          to="/profile/verification"
          icon={<NavIcon type="shield" />}
          label={t('page.verification')}
          meta={chip}
        />
        <div className="ml-[57px] h-px bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]" />
        <NavRow
          to="/profile/campaigns"
          icon={<NavIcon type="campaign" />}
          label={t('page.myCampaigns')}
          meta={String(myCampaigns.length)}
        />
        <div className="ml-[57px] h-px bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]" />
        <NavRow to="/profile/donations" icon={<NavIcon type="heart" />} label={t('page.myDonations')} />
        <div className="ml-[57px] h-px bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]" />
        <NavRow
          to="/profile/settings"
          icon={<NavIcon type="settings" />}
          label={t('page.settings')}
        />
      </nav>
    </div>
  )
}
