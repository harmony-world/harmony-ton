import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getTrustScoreTone } from './trustScore'

function ShieldIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 2.4v5C19 15 15.7 18 12 19.5 8.3 18 5 15 5 10.4v-5L12 3z" />
      <path d="M9 11l2 2 4-4" />
    </svg>
  )
}

export function TrustScoreModal({
  score,
  onClose,
}: {
  score: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const tone = getTrustScoreTone(score)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,0,0,.34)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-10 sm:items-center sm:pb-10"
      role="presentation"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trust-score-title"
        className="w-full max-w-[430px] rounded-[22px] bg-[var(--tg-theme-bg-color,#fff)] p-5 text-left text-[var(--tg-theme-text-color,#1C1C1E)] shadow-[0_18px_50px_rgba(0,0,0,.22)]"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className="mb-3 inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-bold leading-none"
              style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
            >
              <ShieldIcon />
              Trust Score {score}
            </div>
            <h2 id="trust-score-title" className="text-[21px] font-bold leading-tight tracking-normal">
              {t('trustScore.modalTitle', { level: t(tone.labelKey) })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] text-[var(--tg-theme-hint-color,#8E8E93)] transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
            aria-label={t('common.close')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[12px] bg-[rgba(217,48,37,.08)] px-2 py-2.5">
            <div className="text-[13px] font-bold text-[#D93025]">0-30</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--tg-theme-hint-color,#8E8E93)]">{t('trustScore.rangeLow')}</div>
          </div>
          <div className="rounded-[12px] bg-[rgba(95,99,104,.1)] px-2 py-2.5">
            <div className="text-[13px] font-bold text-[#5F6368]">31-69</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--tg-theme-hint-color,#8E8E93)]">{t('trustScore.rangeNormal')}</div>
          </div>
          <div className="rounded-[12px] bg-[rgba(31,138,91,.1)] px-2 py-2.5">
            <div className="text-[13px] font-bold text-[#1F8A5B]">70+</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--tg-theme-hint-color,#8E8E93)]">{t('trustScore.rangeHigh')}</div>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-[14px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
          <p>{t('trustScore.description1')}</p>
          <p>{t('trustScore.description2')}</p>
        </div>
      </section>
    </div>
  )
}
