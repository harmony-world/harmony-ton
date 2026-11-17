import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrustScoreModal } from './TrustScoreModal'
import { getTrustScoreTone } from './trustScore'

export function TrustBadge({
  score,
  compact = false,
  className = '',
}: {
  score: number
  compact?: boolean
  className?: string
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const { t } = useTranslation()
  const tone = getTrustScoreTone(score)
  const sizeClass = compact ? 'min-h-7 px-2 py-1 text-[11.5px]' : 'min-h-8 px-3 py-1.5 text-[13px]'

  return (
    <>
      <button
        type="button"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-bold leading-none transition-opacity active:opacity-75 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2 ${sizeClass} ${className}`}
        style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
        aria-label={t('trustScore.ariaLabel', { score, level: t(tone.labelKey) })}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setModalOpen(true)
        }}
      >
        <svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l7 2.4v5C19 15 15.7 18 12 19.5 8.3 18 5 15 5 10.4v-5L12 3z" />
          <path d="M9 11l2 2 4-4" />
        </svg>
        <span>{score}</span>
      </button>
      {modalOpen && <TrustScoreModal score={score} onClose={() => setModalOpen(false)} />}
    </>
  )
}
