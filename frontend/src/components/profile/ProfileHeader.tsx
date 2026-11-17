import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { UserCampaign, UserDonation, UserProfile } from '../../api/users'
import { DonorStatusBadge } from '../common/DonorStatusBadge'
import { TrustBadge } from '../common/TrustBadge'
import { useTelegramApp } from '../../hooks/useTelegramApp'
import type { KycLevel } from '../../types'
import { formatUsd } from '../../utils/format'
import { openTelegramProfile } from '../../utils/telegram'
import {
  ShieldIcon,
  SpinnerIcon,
} from './shared'
import { cardStyle, kycText, kycTone, normalizeKycStatus, toneColors } from './sharedUtils'

function ProfileAvatar({ profile }: { profile?: UserProfile | null }) {
  const { t } = useTranslation('profile')
  const tma = useTelegramApp()
  const firstName = profile?.firstName ?? tma.firstName ?? ''
  const lastName = profile?.lastName ?? tma.lastName ?? ''
  const displayName = `${firstName} ${lastName}`.trim() || t('page.userFallback')
  const initials = `${firstName[0] ?? displayName[0] ?? '?'}${lastName[0] ?? ''}`.toUpperCase()
  const photoUrl = profile?.photoUrl ?? tma.photoUrl

  return (
    <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--tg-brand-color),#1E7FC0)] text-[30px] font-semibold text-white">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={displayName}
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
            event.currentTarget.parentElement!.textContent = initials
          }}
        />
      ) : (
        initials
      )}
    </div>
  )
}

function KycInlineBadge({ profile }: { profile?: UserProfile | null }) {
  const { t } = useTranslation(['profile', 'common'])
  const status = normalizeKycStatus(profile)
  const level = (profile?.kycLevel ?? 0) as KycLevel
  const tone = kycTone(status)
  const { label } = kycText(status, level, t)
  return (
    <Link
      to="/profile/verification"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold leading-none transition-opacity active:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      style={{
        background: toneColors[tone].bg,
        color: toneColors[tone].color,
        textDecoration: 'none',
      }}
      aria-label={t('kyc.ariaLabel', { label })}
    >
      {status === 'pending' ? <SpinnerIcon /> : <ShieldIcon tone={tone} />}
      <span>{label}</span>
    </Link>
  )
}

export function ProfileIdentity({
  profile,
  showPrivateBadges = true,
}: {
  profile?: UserProfile | null
  showPrivateBadges?: boolean
}) {
  const { t } = useTranslation('profile')
  const tma = useTelegramApp()
  const firstName = profile?.firstName ?? tma.firstName ?? ''
  const lastName = profile?.lastName ?? tma.lastName ?? ''
  const displayName = `${firstName} ${lastName}`.trim() || t('page.userFallback')
  const handle = profile?.username ?? (showPrivateBadges ? tma.username : null) ?? null
  const username = handle ? `@${handle}` : null

  return (
    <div className="flex flex-col items-center gap-3">
      <ProfileAvatar profile={profile} />
      <div className="max-w-full text-center">
        <h1 className="truncate text-[20px] font-bold leading-tight tracking-normal text-[var(--tg-theme-text-color,#1C1C1E)]">
          {displayName}
        </h1>
        {handle && username && (
          <button
            type="button"
            onClick={() => openTelegramProfile(handle)}
            aria-label={t('page.openTelegramProfile', { username })}
            className="mt-0.5 inline-flex min-h-8 max-w-full items-center rounded-lg px-2 text-[14px] leading-tight text-[var(--tg-theme-link-color,#007AFF)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tg-theme-link-color,#007AFF)]"
          >
            <span className="truncate">{username}</span>
          </button>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {showPrivateBadges && <KycInlineBadge profile={profile} />}
          <TrustBadge score={profile?.trustScore ?? 50} />
          <DonorStatusBadge totalUsd={profile?.totalDonatedUsd ?? 0} />
        </div>
      </div>
    </div>
  )
}

export function StatsRow({
  profile,
  campaigns,
  donations,
}: {
  profile?: UserProfile | null
  campaigns: UserCampaign[]
  donations: UserDonation[]
}) {
  const { t, i18n } = useTranslation('profile')
  const firstDonation =
    donations.length > 0
      ? donations.reduce((earliest, d) => (d.createdAt < earliest.createdAt ? d : earliest))
      : null
  const joinedLabel = firstDonation
    ? new Date(firstDonation.createdAt).toLocaleDateString(i18n.language, { month: '2-digit', year: 'numeric' })
    : null

  return (
    <div
      className="mt-5 rounded-2xl p-4"
      style={cardStyle({ boxShadow: '0 2px 14px rgba(20,20,30,.05)' })}
    >
      <div className="grid grid-cols-3 divide-x divide-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]">
        <div className="text-center">
          <div className="text-[19px] font-bold leading-none text-[var(--tg-theme-text-color,#1C1C1E)]">
            {formatUsd(profile?.totalDonatedUsd ?? 0)}
          </div>
          <div className="mt-1.5 text-[12px] leading-tight text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('stats.donated')}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[19px] font-bold leading-none text-[var(--tg-theme-text-color,#1C1C1E)]">
            {campaigns.length}
          </div>
          <div className="mt-1.5 text-[12px] leading-tight text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('stats.campaigns')}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[19px] font-bold leading-none text-[var(--tg-theme-text-color,#1C1C1E)]">
            {joinedLabel ?? '—'}
          </div>
          <div className="mt-1.5 text-[12px] leading-tight text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t('stats.joined')}
          </div>
        </div>
      </div>
    </div>
  )
}
