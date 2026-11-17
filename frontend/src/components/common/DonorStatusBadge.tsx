import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DONOR_LEVELS, getDonorLevel } from '../../constants/donorLevels'

function formatThreshold(amount: number) {
  return `$${amount.toLocaleString('en-US')}`
}

function DonorStatusModal({
  currentTotalUsd,
  onClose,
}: {
  currentTotalUsd: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const currentLevel = getDonorLevel(currentTotalUsd)

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
        aria-labelledby="donor-status-title"
        className="max-h-[calc(100vh-56px)] w-full max-w-[430px] overflow-y-auto rounded-[22px] bg-[var(--tg-theme-bg-color,#fff)] p-5 text-left text-[var(--tg-theme-text-color,#1C1C1E)] shadow-[0_18px_50px_rgba(0,0,0,.22)]"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className="mb-3 inline-flex min-h-8 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold leading-none"
              style={{ background: currentLevel.bg, color: currentLevel.color }}
            >
              <img src={currentLevel.icon} alt="" aria-hidden="true" className="h-5 w-5" />
              {t(`donorLevels.levelNames.${currentLevel.level}`)} · {t('donorLevels.level', { level: currentLevel.level })}
            </div>
            <h2 id="donor-status-title" className="text-[21px] font-bold leading-tight tracking-normal">
              {t('donorLevels.title')}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('donorLevels.description')}
            </p>
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

        <div className="mt-5 space-y-2.5">
          {DONOR_LEVELS.map((level) => {
            const current = level.level === currentLevel.level
            return (
              <div
                key={level.level}
                className="flex items-center gap-3 rounded-[14px] border p-3 text-left"
                style={{
                  background: current ? level.bg : 'var(--tg-theme-secondary-bg-color,#F7F7FA)',
                  borderColor: current ? level.color : 'color-mix(in srgb, var(--tg-theme-hint-color,#8E8E93) 14%, transparent)',
                }}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                  style={{ background: level.bg }}
                >
                  <img src={level.icon} alt="" aria-hidden="true" className="h-9 w-9" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[15px] font-bold leading-tight" style={{ color: level.color }}>
                      {t(`donorLevels.levelNames.${level.level}`)}
                    </span>
                    <span className="rounded-full bg-[rgba(0,0,0,.06)] px-2 py-0.5 text-[11px] font-bold leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
                      {t('donorLevels.level', { level: level.level })}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">
                    {level.threshold === 0 ? t('donorLevels.availableFromStart') : t('donorLevels.fromThreshold', { amount: formatThreshold(level.threshold) })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export function DonorStatusBadge({
  totalUsd,
  className = '',
}: {
  totalUsd: number
  className?: string
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const { t } = useTranslation()
  const donorLevel = getDonorLevel(totalUsd)

  return (
    <>
      <button
        type="button"
        className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold leading-none transition-opacity active:opacity-75 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2 ${className}`}
        style={{ background: donorLevel.bg, color: donorLevel.color }}
        aria-label={t('donorLevels.ariaLabel', { name: t(`donorLevels.levelNames.${donorLevel.level}`), level: donorLevel.level })}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setModalOpen(true)
        }}
      >
        <img src={donorLevel.icon} alt="" aria-hidden="true" className="inline-block h-5 w-5" />
        {t(`donorLevels.levelNames.${donorLevel.level}`)}
      </button>
      {modalOpen && <DonorStatusModal currentTotalUsd={totalUsd} onClose={() => setModalOpen(false)} />}
    </>
  )
}
