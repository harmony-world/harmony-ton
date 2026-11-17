import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { UserCampaign, UserDonation } from '../../api/users'
import { getCampaignCategoryLabel } from '../../constants/campaignCategories'
import { isCampaignFundraising } from '../../pages/campaignDisplayState'
import { formatDonationAmount, formatProfileDate, formatUsd } from '../../utils/format'
import { cardStyle, toneColors, type Tone } from './sharedUtils'
import type { StatusTab } from './activityUtils'

type Translate = (key: string, options?: Record<string, unknown>) => string

function expenseReportBadgeLabel(status: string | null | undefined, t: Translate): string {
  switch (status) {
    case 'approved': return t('activity.expenseReport.approved')
    case 'pending_review': return t('activity.expenseReport.pending')
    case 'rejected': return t('activity.expenseReport.rejected')
    case 'revision_requested': return t('activity.expenseReport.revision')
    default: return t('activity.expenseReport.missing')
  }
}

function expenseReportBadgeStyle(status?: string | null): { background: string; color: string } {
  switch (status) {
    case 'approved': return { background: '#1F8A5B18', color: '#1F8A5B' }
    case 'pending_review': return { background: '#FF950018', color: '#FF9500' }
    case 'rejected': return { background: '#FF3B3018', color: '#FF3B30' }
    case 'revision_requested': return { background: '#FF950018', color: '#FF9500' }
    default: return { background: '#8E8E9318', color: '#8E8E93' }
  }
}

function campaignStatusLabel(campaign: Pick<UserCampaign, 'status' | 'displayStatus' | 'deployStatus' | 'onchainAddress'>, t: Translate): string {
  if (campaign.displayStatus === 'expired_no_donations') return t('activity.status.expiredNoDonations')
  if (campaign.displayStatus === 'expired_partial') return t('activity.status.expiredPartial')
  if (isCampaignFundraising(campaign)) return t('activity.status.fundraising')
  if (campaign.deployStatus === 'deploying' || campaign.deployStatus === 'retrying') return t('activity.status.deploying')
  if (campaign.deployStatus === 'failed') return t('activity.status.deployFailed')
  if (campaign.deployStatus === 'needs_manual_reconcile') return t('activity.status.needsManualReconcile')

  const labels: Record<UserCampaign['status'], string> = {
    pending_moderation: t('activity.status.pendingModeration'),
    approved: t('activity.status.approved'),
    active: t('activity.status.active'),
    suspended: t('activity.status.suspended'),
    completed: t('activity.status.completed'),
    frozen: t('activity.status.frozen'),
    freeze_pending: t('activity.status.frozen'),
    refunding: t('activity.status.refunding'),
    refunded: t('activity.status.refunded'),
    rejected: t('activity.status.rejected'),
  }
  return labels[campaign.status] ?? campaign.status
}

function campaignStatusTone(campaign: Pick<UserCampaign, 'status' | 'displayStatus' | 'deployStatus' | 'onchainAddress'>): Tone {
  if (campaign.displayStatus === 'expired_no_donations') return 'neutral'
  if (campaign.displayStatus === 'expired_partial') return 'warn'
  if (isCampaignFundraising(campaign) || isCompletedStatus(campaign.status)) return 'ok'
  if (campaign.deployStatus === 'failed' || campaign.deployStatus === 'needs_manual_reconcile') return 'bad'
  if (campaign.deployStatus === 'deploying' || campaign.deployStatus === 'retrying') return 'warn'
  if (campaign.status === 'pending_moderation' || campaign.status === 'approved') return 'warn'
  if (campaign.status === 'rejected' || campaign.status === 'frozen' || campaign.status === 'freeze_pending') return 'bad'
  return 'neutral'
}

function isCompletedStatus(status: UserCampaign['status']) {
  return status === 'completed' || status === 'refunded'
}

function progressPercent(raised: number, goal: number) {
  return goal > 0 ? Math.min(100, (raised / goal) * 100) : 0
}

function storySnippet(story: string) {
  return story.trim().replace(/\s+/g, ' ').slice(0, 118)
}

export function StatusTabs({
  activeTab,
  onChange,
  activeCount,
  completedCount,
}: {
  activeTab: StatusTab
  onChange: (tab: StatusTab) => void
  activeCount: number
  completedCount: number
}) {
  const { t } = useTranslation('profile')
  const tabs: { value: StatusTab; label: string; count: number }[] = [
    { value: 'active', label: t('activity.tabs.active'), count: activeCount },
    { value: 'completed', label: t('activity.tabs.completed'), count: completedCount },
  ]

  return (
    <div className="flex justify-center">
      <div
        className="inline-flex rounded-full p-1"
        style={{
          background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
          border:
            '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 12%, transparent)',
        }}
        role="tablist"
        aria-label={t('activity.tabs.ariaLabel')}
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.value)}
              className="min-h-9 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
              style={{
                background: selected ? 'var(--tg-theme-bg-color, #fff)' : 'transparent',
                color: selected
                  ? 'var(--tg-theme-text-color, #1C1C1E)'
                  : 'var(--tg-theme-hint-color, #8E8E93)',
                boxShadow: selected ? '0 1px 7px rgba(20,20,30,.08)' : 'none',
              }}
            >
              {tab.label}
              <span className="ml-1.5 text-[12px] opacity-70">{tab.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CampaignCover({ campaign }: { campaign: Pick<UserCampaign, 'photos' | 'title'> }) {
  return (
    <div className="relative h-[122px] w-[106px] shrink-0 overflow-hidden rounded-[14px] bg-[var(--tg-theme-bg-color,#fff)]">
      {campaign.photos.length > 0 ? (
        <img src={campaign.photos[0]} alt={campaign.title} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--tg-theme-hint-color,#8E8E93)]">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2.5" y="6" width="19" height="14" rx="2.5" />
            <circle cx="8.5" cy="11.5" r="2" />
            <path d="M21.5 17l-5-4-3 2.5-2.5-2-8.5 5" />
          </svg>
        </div>
      )}
      {campaign.photos.length > 1 && (
        <span className="absolute bottom-2 right-2 rounded-full bg-[rgba(0,0,0,.55)] px-2 py-0.5 text-[11px] font-bold text-white">
          {campaign.photos.length}
        </span>
      )}
    </div>
  )
}

function CampaignProgress({
  raisedAmountUsd,
  goalAmountUsd,
}: Pick<UserCampaign, 'raisedAmountUsd' | 'goalAmountUsd'>) {
  const pct = progressPercent(raisedAmountUsd, goalAmountUsd)
  const pctLabel = pct < 1 && pct > 0 ? pct.toFixed(2) : Math.round(pct).toString()

  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--tg-theme-bg-color,#fff)]">
        <div className="h-full rounded-full bg-[#1E9E52]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px] leading-none">
        <span className="font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">
          {formatUsd(raisedAmountUsd)}{' '}
          <span className="font-medium text-[var(--tg-theme-hint-color,#8E8E93)]">
            / {formatUsd(goalAmountUsd)}
          </span>
        </span>
        <span className="font-semibold text-[var(--tg-theme-hint-color,#8E8E93)]">
          {pctLabel}%
        </span>
      </div>
    </div>
  )
}

export function ProfileCampaignCard({ campaign }: { campaign: UserCampaign }) {
  const { t, i18n } = useTranslation('profile')
  const statusTone = campaignStatusTone(campaign)

  return (
    <Link
      to={`/campaign/${campaign.id}`}
      className="flex gap-3 rounded-2xl p-3 text-[var(--tg-theme-text-color,#1C1C1E)] transition-opacity active:opacity-75 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      style={{ ...cardStyle({ boxShadow: '0 2px 14px rgba(20,20,30,.05)' }), textDecoration: 'none' }}
    >
      <CampaignCover campaign={campaign} />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[var(--tg-theme-bg-color,#fff)] px-2 py-1 text-[11px] font-bold leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
            {getCampaignCategoryLabel(campaign.category)}
          </span>
          <span
            className="rounded-full px-2 py-1 text-[11px] font-bold leading-none"
            style={{
              background: toneColors[statusTone].bg,
              color: toneColors[statusTone].color,
            }}
          >
            {campaignStatusLabel(campaign, t)}
          </span>
          {campaign.claimStatus === 'claimed' && campaign.isPublic && (
            <span
              className="rounded-full px-2 py-1 text-[11px] font-bold leading-none"
              style={expenseReportBadgeStyle(campaign.expenseReportStatus)}
            >
              {expenseReportBadgeLabel(campaign.expenseReportStatus, t)}
            </span>
          )}
        </div>
        <h2 className="line-clamp-2 text-[15.5px] font-bold leading-snug tracking-normal">
          {campaign.title}
        </h2>
        {campaign.story && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">
            {storySnippet(campaign.story)}
          </p>
        )}
        <div className="mt-3">
          <CampaignProgress
            raisedAmountUsd={campaign.raisedAmountUsd}
            goalAmountUsd={campaign.goalAmountUsd}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--tg-theme-hint-color,#8E8E93)]">
          <span>{formatProfileDate(campaign.createdAt, i18n.language)}</span>
          <span>{t('activity.donorsShort', { count: campaign.donorCount })}</span>
        </div>
      </div>
    </Link>
  )
}

export function DonationCampaignCard({
  donation,
  amountLabel,
}: {
  donation: UserDonation
  amountLabel?: string
}) {
  const { t, i18n } = useTranslation('profile')
  const statusTone = campaignStatusTone(donation.campaign)
  const displayAmountLabel = amountLabel ?? t('activity.yourDonation')

  return (
    <Link
      to={`/campaign/${donation.campaignId}`}
      className="block rounded-2xl p-3 text-[var(--tg-theme-text-color,#1C1C1E)] transition-opacity active:opacity-75 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      style={{ ...cardStyle({ boxShadow: '0 2px 14px rgba(20,20,30,.05)' }), textDecoration: 'none' }}
    >
      <div className="flex gap-3">
        <CampaignCover campaign={donation.campaign} />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[var(--tg-theme-bg-color,#fff)] px-2 py-1 text-[11px] font-bold leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
              {getCampaignCategoryLabel(donation.campaign.category)}
            </span>
            <span
              className="rounded-full px-2 py-1 text-[11px] font-bold leading-none"
              style={{
                background: toneColors[statusTone].bg,
                color: toneColors[statusTone].color,
              }}
            >
              {campaignStatusLabel(donation.campaign, t)}
            </span>
          </div>
          <h2 className="line-clamp-2 text-[15.5px] font-bold leading-snug tracking-normal">
            {donation.campaignTitle}
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">
            {formatProfileDate(donation.createdAt, i18n.language)}
          </p>
          <div className="mt-3">
            <CampaignProgress
              raisedAmountUsd={donation.campaign.raisedAmountUsd}
              goalAmountUsd={donation.campaign.goalAmountUsd}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-[var(--tg-theme-bg-color,#fff)] px-3 py-2.5">
        <span className="text-[12.5px] font-semibold text-[var(--tg-theme-hint-color,#8E8E93)]">
          {displayAmountLabel}
        </span>
        <span className="text-[15px] font-bold text-[#1E9E52]">
          {donation.amountHidden || donation.amount == null
            ? '***'
            : `${formatDonationAmount(donation.amount)} ${donation.currency}`}
        </span>
      </div>
    </Link>
  )
}
