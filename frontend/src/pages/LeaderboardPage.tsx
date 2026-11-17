import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLeaderboard } from '../hooks/useApi'
import { PageSkeleton } from '../components/PageSkeleton'
import { formatUsd } from '../utils/format'
import { getDonorLevel } from '../constants/donorLevels'
import type { LeaderEntry } from '../api/leaderboard'

const PODIUM_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'] as const

function LeaderAvatar({ leader, size }: { leader: LeaderEntry; size: number }) {
  const initials = (leader.firstName?.[0] ?? leader.username?.[0] ?? '?').toUpperCase()
  const level = getDonorLevel(leader.totalDonatedUsd)

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: level.bg.includes('var') ? 'linear-gradient(135deg,var(--tg-brand-color),#1E7FC0)' : level.bg,
        fontSize: size * 0.38,
      }}
    >
      {leader.photoUrl ? (
        <img
          src={leader.photoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            e.currentTarget.parentElement!.textContent = initials
          }}
        />
      ) : (
        initials
      )}
    </div>
  )
}

function PodiumCard({ leader, medalColor }: { leader: LeaderEntry; medalColor: string }) {
  const isFirst = leader.rank === 1
  const size = isFirst ? 72 : 56

  return (
    <Link
      to={`/profile/${leader.userId}`}
      className="flex flex-col items-center gap-1.5 text-center no-underline"
      style={{ order: leader.rank === 1 ? 0 : leader.rank === 2 ? -1 : 1 }}
    >
      <div className="relative">
        <LeaderAvatar leader={leader} size={size} />
        <span
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold"
          style={{ background: medalColor, color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}
        >
          {leader.rank}
        </span>
      </div>
      <span className="max-w-[90px] truncate text-[13px] font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">
        {leader.firstName ?? (leader.username ? `@${leader.username}` : '—')}
      </span>
      <span className="text-[12px] font-bold text-[var(--tg-brand-color)]">
        {formatUsd(leader.totalDonatedUsd)}
      </span>
    </Link>
  )
}

function LeaderRow({ leader }: { leader: LeaderEntry }) {
  const level = getDonorLevel(leader.totalDonatedUsd)

  return (
    <Link
      to={`/profile/${leader.userId}`}
      className="flex items-center gap-3 px-4 py-3 no-underline transition-colors active:bg-[rgba(0,0,0,.03)]"
    >
      <span className="w-7 text-center text-[14px] font-semibold text-[var(--tg-theme-hint-color,#8E8E93)]">
        {leader.rank}
      </span>
      <LeaderAvatar leader={leader} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">
          {leader.firstName ?? (leader.username ? `@${leader.username}` : '—')}
        </div>
        <div className="text-[12px] text-[var(--tg-theme-hint-color,#8E8E93)]">
          {level.emoji} {level.name}
        </div>
      </div>
      <span className="text-[14px] font-bold text-[var(--tg-brand-color)]">
        {formatUsd(leader.totalDonatedUsd)}
      </span>
    </Link>
  )
}

export function LeaderboardPage() {
  const { t } = useTranslation('leaderboard')
  const { data, isLoading } = useLeaderboard()

  if (isLoading) return <PageSkeleton />

  const leaders = data?.leaders ?? []
  const myEntry = data?.myEntry ?? null
  const podium = leaders.slice(0, 3)
  const rest = leaders.slice(3)
  const myInTop = myEntry ? leaders.some((l) => l.userId === myEntry.userId) : false

  return (
    <div className="px-4 pb-8 pt-3 text-[var(--tg-theme-text-color,#1C1C1E)]">
      <div className="mb-5 text-center">
        <h1 className="text-[22px] font-bold">🏆 {t('title')}</h1>
        <p className="mt-1 text-[13px] text-[var(--tg-theme-hint-color,#8E8E93)]">{t('subtitle')}</p>
      </div>

      {leaders.length === 0 ? (
        <div className="mt-12 text-center text-[15px] text-[var(--tg-theme-hint-color,#8E8E93)]">
          {t('empty')}
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <div className="mb-5 flex items-end justify-center gap-6 pt-2 pb-3">
              {podium.map((leader, i) => (
                <PodiumCard key={leader.userId} leader={leader} medalColor={PODIUM_COLORS[i]!} />
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl bg-[var(--tg-theme-bg-color,#fff)]" style={{ boxShadow: '0 2px 14px rgba(20,20,30,.05)' }}>
            {rest.map((leader, i) => (
              <div key={leader.userId}>
                {i > 0 && (
                  <div className="ml-[76px] h-px bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]" />
                )}
                <LeaderRow leader={leader} />
              </div>
            ))}

            {myEntry && !myInTop && (
              <>
                <div className="flex items-center justify-center py-2">
                  <span className="text-[18px] tracking-[4px] text-[var(--tg-theme-hint-color,#8E8E93)]">···</span>
                </div>
                <div className="ml-[76px] h-px bg-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)]" />
                <div className="bg-[color-mix(in_srgb,var(--tg-brand-color)_6%,transparent)]">
                  <LeaderRow leader={myEntry} />
                </div>
              </>
            )}
          </div>

          {!myEntry && (
            <div className="mt-5 text-center text-[13px] text-[var(--tg-theme-hint-color,#8E8E93)]">
              {t('notRanked')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
