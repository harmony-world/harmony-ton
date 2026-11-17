import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CampaignListItem } from '../../api/campaigns'
import { TrustBadge } from '../common/TrustBadge'
import { getCampaignCategoryLabel } from '../../constants/campaignCategories'
import { isCampaignFundraising } from '../../pages/campaignDisplayState'

function daysLeft(deadline: string | null) {
  if (!deadline) return null
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  return diff > 0 ? diff : 0
}

function CategoryIcon({ category }: { category: string }) {
  if (category === 'project')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
  if (category === 'health')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" /></svg>
  if (category === 'education')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l9-5 9 5-9 5-9-5z" /><path d="M3 8v6c3 3 6 4 9 4s6-1 9-4V8" /></svg>
  if (category === 'disaster')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 11c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /></svg>
  if (category === 'housing')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /></svg>
  if (category === 'family')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2 19c0-3 3-5 7-5s7 2 7 5" /><path d="M16 15c2 0 4 1.5 4 4" /></svg>
  if (category === 'channel')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 10v4h3l6 4V6L6 10H3z" /><path d="M16 8.5a5 5 0 0 1 0 7" /></svg>
  if (category === 'social')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11.5a3.5 3.5 0 1 1 7 0c0 3-3.5 5.5-3.5 5.5S7 14.5 7 11.5z" /><path d="M4 20c1.5-2 4-3 6.5-3s5 1 6.5 3" /></svg>
  if (category === 'animals')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 14s1.5-2 4-2 4 2 4 2" /><circle cx="6" cy="8" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="10" cy="5" r="2" /><circle cx="14" cy="5" r="2" /><path d="M7 16c0 2.2 2.2 4 5 4s5-1.8 5-4" /></svg>
  if (category === 'birthday')
    return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 7v14" /><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" /></svg>
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
}

export function CampaignCard({ campaign }: { campaign: CampaignListItem }) {
  const { t } = useTranslation('feed')
  const navigate = useNavigate()
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const touchStartXRef = useRef<number | null>(null)
  const photoSwipeRef = useRef(false)
  const photos = campaign.photos ?? []
  const hasPhotos = photos.length > 0
  const hasMultiplePhotos = photos.length > 1
  const pctRaw =
    campaign.goalAmountUsd > 0
      ? Math.min(100, (campaign.raisedAmountUsd / campaign.goalAmountUsd) * 100)
      : 0
  const pctLabel = pctRaw < 1 && pctRaw > 0 ? pctRaw.toFixed(2) : Math.round(pctRaw).toString()
  const days = daysLeft(campaign.deadline)
  const isChannelCampaign = campaign.organizerType === 'telegram_channel'
  const channelDisplayUsername = isChannelCampaign && campaign.channelUsername
    ? (campaign.channelUsername.startsWith('@') ? campaign.channelUsername : `@${campaign.channelUsername}`)
    : null
  const creatorName = channelDisplayUsername ?? campaign.creator.tgFirstName ?? campaign.creator.tgUsername ?? t('anonymous')
  const initials = creatorName[0]?.toUpperCase() ?? '?'
  const avatarUrl = isChannelCampaign && campaign.channelAvatarUrl
    ? campaign.channelAvatarUrl
    : campaign.creator.tgPhotoUrl
  const ds = campaign.displayStatus
  const isFundraising = isCampaignFundraising(campaign) && ds !== 'expired_partial' && ds !== 'expired_no_donations'

  return (
    <Link
      to={`/campaign/${campaign.id}`}
      className="block rounded-[18px] overflow-hidden active:opacity-80 transition-opacity"
      style={{ background: 'var(--tg-theme-bg-color, #fff)', boxShadow: '0 2px 14px rgba(20,20,30,.06)' }}
      onClickCapture={(event) => {
        if (!photoSwipeRef.current) return
        photoSwipeRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        className="relative overflow-hidden"
        aria-label={t('photosAria')}
        onTouchStart={(event) => {
          if (!hasMultiplePhotos) return
          touchStartXRef.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(event) => {
          if (!hasMultiplePhotos || touchStartXRef.current === null) return
          const endX = event.changedTouches[0]?.clientX ?? touchStartXRef.current
          const delta = touchStartXRef.current - endX
          touchStartXRef.current = null
          if (Math.abs(delta) < 36) return
          photoSwipeRef.current = true
          setActivePhotoIndex((current) => {
            if (delta > 0) return (current + 1) % photos.length
            return current === 0 ? photos.length - 1 : current - 1
          })
        }}
        onTouchCancel={() => {
          touchStartXRef.current = null
        }}
        style={{ height: 150, background: 'var(--tg-theme-secondary-bg-color, #E7ECF3)', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pan-y' }}
      >
        {hasPhotos ? (
          <div className="absolute inset-0 flex h-full transition-transform duration-300 ease-out" style={{ width: `${photos.length * 100}%`, transform: `translateX(-${activePhotoIndex * (100 / photos.length)}%)` }}>
            {photos.map((photo, index) => (
              <div key={photo} className="relative h-full shrink-0" style={{ width: `${100 / photos.length}%` }}>
                <img
                  src={photo}
                  alt={index === activePhotoIndex ? campaign.title : ''}
                  aria-hidden={index === activePhotoIndex ? undefined : true}
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
            <rect x="2" y="6" width="20" height="14" rx="2.5" />
            <circle cx="8.5" cy="11.5" r="2" />
            <path d="M22 17l-5.5-4.5-3 2.5-3-2L2 18" />
          </svg>
        )}
        <span className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-full text-[11.5px] font-semibold" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)', background: 'color-mix(in srgb, var(--tg-theme-bg-color, #fff) 95%, transparent)' }}>
          <CategoryIcon category={campaign.category} />
          {getCampaignCategoryLabel(campaign.category)}
        </span>
        {isChannelCampaign && (
          <span className="pointer-events-none absolute right-2.5 top-11 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ color: 'var(--tg-brand-color)', background: 'color-mix(in srgb, var(--tg-theme-bg-color, #fff) 93%, transparent)' }}>
            {t('fromChannel')}
          </span>
        )}
        {(hasMultiplePhotos || (hasPhotos && campaign.photosIllustrative)) && (
          <div className="pointer-events-none absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
            {hasPhotos && campaign.photosIllustrative && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-white" style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
                </svg>
                {t('photosIllustrative')}
              </span>
            )}
            {hasMultiplePhotos && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-white" style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="14" rx="2.5" /><circle cx="8.5" cy="11.5" r="2" /><path d="M22 17l-5.5-4.5-3 2.5-3-2L2 18" />
                </svg>
                {activePhotoIndex + 1}/{photos.length}
              </span>
            )}
          </div>
        )}
        {isFundraising && (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: 'rgba(31,138,91,.94)', backdropFilter: 'blur(4px)' }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
            {t('fundraising')}
          </span>
        )}
        {campaign.status === 'completed' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(31,138,91,0.95)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-[12px] font-bold text-white">{t('cardCompleted')}</span>
            </span>
          </div>
        )}
        {campaign.displayStatus === 'expired_no_donations' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(142,142,147,0.9)' }}>
              <span className="text-[12px] font-bold text-white">{t('cardNoFunds')}</span>
            </span>
          </div>
        )}
        {campaign.displayStatus === 'expired_partial' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,149,0,0.9)' }}>
              <span className="text-[12px] font-bold text-white">{t('cardExpired')}</span>
            </span>
          </div>
        )}
      </div>

      <div className="p-3.5">
        <div
          className="flex min-h-8 items-center gap-1.5 mb-1.5 rounded-lg focus-within:ring-2 focus-within:ring-[var(--tg-theme-link-color,#007AFF)]"
          role="button"
          tabIndex={0}
          aria-label={isChannelCampaign ? t('openChannel', { name: creatorName }) : t('openProfile', { name: creatorName })}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (isChannelCampaign && campaign.channelUsername) {
              const username = campaign.channelUsername.replace(/^@/, '')
              window.open(`https://t.me/${username}`, '_blank')
            } else {
              navigate(`/profile/${campaign.creator.id}`)
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            e.stopPropagation()
            if (isChannelCampaign && campaign.channelUsername) {
              const username = campaign.channelUsername.replace(/^@/, '')
              window.open(`https://t.me/${username}`, '_blank')
            } else {
              navigate(`/profile/${campaign.creator.id}`)
            }
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
          ) : (
            <span className="w-5 h-5 rounded-full bg-[var(--tg-brand-color)] text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
              {initials}
            </span>
          )}
          <span className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--tg-theme-hint-color, #5a5a5e)' }}>
            {creatorName}
          </span>
          <TrustBadge score={campaign.trustScore} compact />
        </div>

        {campaign.translation?.translated && (
          <span
            className="mb-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              background: 'color-mix(in srgb, var(--tg-theme-link-color, #007AFF) 12%, transparent)',
              color: 'var(--tg-theme-link-color, #007AFF)',
            }}
          >
            {t('translated')}
          </span>
        )}
        <div className="font-bold leading-snug mb-3" style={{ fontSize: 16, color: 'var(--tg-theme-text-color, #1C1C1E)', letterSpacing: '-0.2px' }}>
          {campaign.title}
        </div>

        <div className="w-full rounded-full overflow-hidden" style={{ height: 7, background: 'var(--tg-theme-secondary-bg-color, #EBEBEF)' }}>
          <div className="h-full rounded-full" style={{ width: `${pctRaw}%`, background: '#1F8A5B' }} />
        </div>

        <div className="flex items-baseline justify-between mt-2">
          <span className="font-bold" style={{ fontSize: 14.5, color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
            ${campaign.raisedAmountUsd}{' '}
            <span className="font-medium" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>/ ${campaign.goalAmountUsd} · {pctLabel}%</span>
          </span>
          {campaign.status === 'completed' ? (
            <span className="text-[13px] font-semibold" style={{ color: '#1F8A5B' }}>{t('cardCompleted')}</span>
          ) : campaign.displayStatus === 'expired_no_donations' ? (
            <span className="text-[13px] font-semibold" style={{ color: '#8E8E93' }}>{t('cardNoFunds')}</span>
          ) : campaign.displayStatus === 'expired_partial' ? (
            <span className="text-[13px] font-semibold" style={{ color: '#FF9500' }}>{t('cardExpired')}</span>
          ) : days !== null ? (
            <span className="text-[13px] font-medium" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>{t('daysLeft', { count: days })}</span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
