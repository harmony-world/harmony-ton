import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { DONOR_LEVELS, getDonorLevel, type DonorLevelConfig } from '../../constants/donorLevels'
import { formatUsd } from '../../utils/format'
import { cardStyle } from './sharedUtils'

export function DonorLevelCard({ totalUsd }: { totalUsd: number }) {
  const { t } = useTranslation(['profile', 'common'])
  const donorLevel = getDonorLevel(totalUsd)
  const [selectedLevel, setSelectedLevel] = useState<DonorLevelConfig | null>(null)
  const closePopup = useCallback(() => setSelectedLevel(null), [])
  const nextLevel = DONOR_LEVELS.find((level) => level.level === donorLevel.level + 1) ?? null
  const progressPct = nextLevel
    ? Math.min(
        100,
        Math.round(
          ((totalUsd - donorLevel.threshold) / (nextLevel.threshold - donorLevel.threshold)) * 100,
        ),
      )
    : 100

  return (
    <div
      className="mt-5 rounded-2xl p-4"
      style={cardStyle({ boxShadow: '0 2px 14px rgba(20,20,30,.05)' })}
    >
      <div className="mb-4 flex items-center gap-4">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
          style={{ background: donorLevel.bg }}
        >
          <img src={donorLevel.icon} alt={t(`common:donorLevels.levelNames.${donorLevel.level}`)} className="h-12 w-12" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold leading-tight text-[var(--tg-theme-text-color,#1C1C1E)]">
              {t(`common:donorLevels.levelNames.${donorLevel.level}`)}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold leading-none"
              style={{ color: donorLevel.color, background: donorLevel.bg }}
            >
              {t('donorLevel.level', { level: donorLevel.level })}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--tg-theme-hint-color,#8E8E93)]">
            {t(`common:donorLevels.levelDescriptions.${donorLevel.level}`)}
          </p>
        </div>
      </div>
      {nextLevel && (
        <>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('donorLevel.toNext', { name: t(`common:donorLevels.levelNames.${nextLevel.level}`) })} <img src={nextLevel.icon} alt="" className="inline-block h-4 w-4" />
            </span>
            <span
              className="text-[12px] font-semibold leading-none"
              style={{ color: donorLevel.color }}
            >
              {formatUsd(totalUsd)} / {formatUsd(nextLevel.threshold)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#EBEBEF]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: donorLevel.color }}
            />
          </div>
        </>
      )}
      {!nextLevel && (
        <div
          className="rounded-[10px] py-2 text-center text-[13px] font-semibold"
          style={{ background: donorLevel.bg, color: donorLevel.color }}
        >
          {t('donorLevel.maxLevel')}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        {DONOR_LEVELS.map((level) => {
          const passed = level.level < donorLevel.level
          const locked = level.level > donorLevel.level
          const current = level.level === donorLevel.level
          return (
            <button
              key={level.level}
              type="button"
              onClick={() => setSelectedLevel(level)}
              className="flex flex-col items-center gap-1.5 focus:outline-none"
            >
              <span
                className="relative flex h-11 w-11 items-center justify-center rounded-full"
                style={{
                  background: locked ? '#F2F2F7' : level.bg,
                  border: current ? `2.5px solid ${level.color}` : '2.5px solid transparent',
                  filter: locked ? 'grayscale(1) opacity(.4)' : 'none',
                }}
              >
                <img src={level.icon} alt={t(`common:donorLevels.levelNames.${level.level}`)} className="h-9 w-9" />
                {passed && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full"
                    style={{ background: level.color }}
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="#fff"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </span>
              <span
                className="text-[10px] font-medium leading-none"
                style={{ color: locked ? '#C7C7CC' : level.color }}
              >
                {t(`common:donorLevels.levelNames.${level.level}`)}
              </span>
            </button>
          )
        })}
      </div>
      {selectedLevel && (
        <DonorLevelPopup level={selectedLevel} currentLevel={donorLevel} totalUsd={totalUsd} onClose={closePopup} />
      )}
    </div>
  )
}

function DonorLevelPopup({
  level,
  currentLevel,
  totalUsd,
  onClose,
}: {
  level: DonorLevelConfig
  currentLevel: DonorLevelConfig
  totalUsd: number
  onClose: () => void
}) {
  const { t } = useTranslation(['profile', 'common'])
  const isPassed = level.level < currentLevel.level
  const isCurrent = level.level === currentLevel.level
  const isLocked = level.level > currentLevel.level
  const nextLevelInList = DONOR_LEVELS.find((l) => l.level === level.level + 1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[430px] rounded-t-2xl p-5 pb-8 animate-[slide-up_0.25s_ease-out]"
        style={{ background: 'var(--tg-theme-bg-color, #fff)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--tg-theme-hint-color,#8E8E93)] opacity-30" />
        <div className="flex items-center gap-4 mb-3">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
            style={{
              background: level.bg,
              filter: isLocked ? 'grayscale(1) opacity(.5)' : 'none',
            }}
          >
            <img src={level.icon} alt={t(`common:donorLevels.levelNames.${level.level}`)} className="h-12 w-12" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold text-[var(--tg-theme-text-color,#1C1C1E)]">
                {t(`common:donorLevels.levelNames.${level.level}`)}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold leading-none"
                style={{ color: level.color, background: level.bg }}
              >
                {t('donorLevel.level', { level: level.level })}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t(`common:donorLevels.levelDescriptions.${level.level}`)}
            </p>
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-3 text-[14px]"
          style={{ background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)' }}
        >
          {isPassed && (
            <span style={{ color: level.color }} className="font-semibold">{t('donorLevel.passed')}</span>
          )}
          {isCurrent && (
            <span style={{ color: level.color }} className="font-semibold">
              {nextLevelInList
                ? t('donorLevel.currentWithNext', { amount: formatUsd(totalUsd), nextAmount: formatUsd(nextLevelInList.threshold) })
                : t('donorLevel.current', { amount: formatUsd(totalUsd) })}
            </span>
          )}
          {isLocked && (
            <span className="text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('donorLevel.locked', { amount: formatUsd(level.threshold) })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl py-3 text-[15px] font-semibold transition-opacity active:opacity-80"
          style={{
            background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
            color: 'var(--tg-theme-text-color, #1C1C1E)',
          }}
        >
          {t('donorLevel.close')}
        </button>
      </div>
    </div>
  )
}
