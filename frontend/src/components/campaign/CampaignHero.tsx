import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { CampaignDetail } from '../../api/campaigns'
import { getCampaignCategoryLabel } from '../../constants/campaignCategories'

interface CampaignHeroProps {
  campaign: CampaignDetail
  hasPhoto: boolean
  hasMultiplePhotos: boolean
  photoCount: number
  activePhotoIndex: number
  touchStartX: number | null
  setTouchStartX: Dispatch<SetStateAction<number | null>>
  handlePhotoSwipe: (delta: number) => void
  handlePhotoTap: (clientX: number, clientY: number) => void
  showDesktopPhotoControls: boolean
  showPreviousPhoto: () => void
  showNextPhoto: () => void
  isCompleted: boolean
  isFrozen: boolean
  isExpired: boolean
  isFundraising: boolean
  completionBadgeLabel: string
}

export function CampaignHero({
  campaign,
  hasPhoto,
  hasMultiplePhotos,
  photoCount,
  activePhotoIndex,
  touchStartX,
  setTouchStartX,
  handlePhotoSwipe,
  handlePhotoTap,
  showDesktopPhotoControls,
  showPreviousPhoto,
  showNextPhoto,
  isCompleted,
  isFrozen,
  isExpired,
  isFundraising,
  completionBadgeLabel,
}: CampaignHeroProps) {
  const { t } = useTranslation('campaign')
  return (
    <>
      <div
        className="relative"
        style={{
          height: 248,
          background: hasPhoto ? '#101820' : 'var(--tg-theme-secondary-bg-color, #E7ECF3)',
        }}
      >
        {hasPhoto ? (
          <div
            className="absolute inset-0 overflow-hidden"
            onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
            onTouchEnd={(event) => {
              if (touchStartX === null) return
              handlePhotoSwipe(touchStartX - (event.changedTouches[0]?.clientX ?? touchStartX))
              setTouchStartX(null)
            }}
            onClick={(event) => handlePhotoTap(event.clientX, event.clientY)}
            style={{ touchAction: 'pan-y' }}
          >
            <div
              className="flex h-full transition-transform duration-300 ease-out"
              style={{ width: `${photoCount * 100}%`, transform: `translateX(-${activePhotoIndex * (100 / photoCount)}%)` }}
            >
              {campaign.photos.map((photo, index) => (
                <div key={photo} className="relative h-full shrink-0" style={{ width: `${100 / photoCount}%` }}>
                  <img
                    src={photo}
                    alt={index === activePhotoIndex ? campaign.title : ''}
                    aria-hidden={index === activePhotoIndex ? undefined : true}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.25 }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="14" rx="2.5" />
              <circle cx="8.5" cy="11.5" r="2" />
              <path d="M22 17l-5.5-4.5-3 2.5-3-2L2 18" />
            </svg>
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{
            pointerEvents: 'none',
            background: hasPhoto
              ? 'linear-gradient(to bottom,rgba(20,24,32,.40) 0%,rgba(20,24,32,0) 28%,rgba(20,24,32,0) 42%,rgba(20,24,32,.55) 65%,rgba(20,24,32,.82) 100%)'
              : 'linear-gradient(to bottom,transparent 0%,transparent 50%,rgba(20,24,32,.55) 75%,rgba(20,24,32,.82) 100%)',
          }}
        />

        {hasMultiplePhotos && (
          <>
            {showDesktopPhotoControls && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    showPreviousPhoto()
                  }}
                  className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full text-white/85 outline-none transition-colors hover:bg-black/35 focus-visible:ring-2 focus-visible:ring-white/80 active:bg-black/45"
                  style={{
                    width: 44,
                    height: 44,
                    background: 'rgba(0,0,0,.22)',
                    border: '1px solid rgba(255,255,255,.16)',
                  }}
                  aria-label={t('hero.previousPhoto')}
                >
                  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    showNextPhoto()
                  }}
                  className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full text-white/85 outline-none transition-colors hover:bg-black/35 focus-visible:ring-2 focus-visible:ring-white/80 active:bg-black/45"
                  style={{
                    width: 44,
                    height: 44,
                    background: 'rgba(0,0,0,.22)',
                    border: '1px solid rgba(255,255,255,.16)',
                  }}
                  aria-label={t('hero.nextPhoto')}
                >
                  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </>
            )}

          <div
            className="absolute left-0 right-0 flex justify-center gap-1.5"
            style={{ bottom: 8, pointerEvents: 'none' }}
            aria-label={t('hero.photoOf', { current: activePhotoIndex + 1, total: photoCount })}
          >
            {campaign.photos.map((_photo, index) => (
              <span
                key={index}
                aria-hidden="true"
                style={{
                  width: index === activePhotoIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: index === activePhotoIndex ? '#fff' : 'rgba(255,255,255,.52)',
                  transition: 'width 0.2s ease',
                }}
              />
            ))}
          </div>
          </>
        )}

        <span className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--tg-theme-bg-color, #fff) 95%, transparent)' }}>
          <span className="text-[11.5px] font-bold" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
            {getCampaignCategoryLabel(campaign.category)}
          </span>
        </span>
        {!campaign.isPublic && (
          <span className="pointer-events-none absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--tg-theme-bg-color, #fff) 95%, transparent)' }}>
            <span aria-hidden="true" className="text-[12px] leading-none">🔒</span>
            <span className="text-[11.5px] font-bold" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>
              {t('hero.private')}
            </span>
          </span>
        )}
        <div className="pointer-events-none absolute px-4 pb-4" style={{ left: 0, right: 0, bottom: 0 }}>
          <div className="flex items-center gap-2 mb-2.5">
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: 'rgba(31,138,91,0.9)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span className="text-[11.5px] font-bold text-white">{completionBadgeLabel}</span>
              </span>
            )}
            {isFrozen && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,149,0,0.9)' }}>
                <span className="text-[11.5px] font-bold text-white">{t('hero.frozen')}</span>
              </span>
            )}
            {isExpired && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: campaign.displayStatus === 'expired_no_donations' ? 'rgba(142,142,147,0.9)' : 'rgba(255,149,0,0.9)' }}>
                <span className="text-[11.5px] font-bold text-white">{campaign.displayStatus === 'expired_no_donations' ? t('hero.expiredNoDonations') : t('hero.expired')}</span>
              </span>
            )}
            {isFundraising && !isExpired && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(31,138,91,0.9)' }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                <span className="text-[11.5px] font-bold text-white">{t('hero.fundraising')}</span>
              </span>
            )}
            {campaign.translation?.translated && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,122,255,0.86)' }}>
                <span className="text-[11.5px] font-bold text-white">{t('hero.translated')}</span>
              </span>
            )}
          </div>
          <h1 className="font-bold leading-snug text-white" style={{ fontSize: 22, letterSpacing: '-0.3px', textShadow: '0 1px 8px rgba(0,0,0,.3)' }}>
            {campaign.title}
          </h1>
        </div>
      </div>
    </>
  )
}
