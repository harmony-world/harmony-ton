import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TrustBadge } from '../common/TrustBadge'
import { formatDate } from '../../utils/format'

interface CreatorRowProps {
  userId: string
  name: string
  initials: string
  photoUrl: string | null
  username: string | null
  trustScore: number
  createdAt: string
}

export function CreatorRow({ userId, name, initials, photoUrl, username, trustScore, createdAt }: CreatorRowProps) {
  const { t, i18n } = useTranslation('campaign')
  const content = (
    <div className="flex items-center gap-3">
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="shrink-0 object-cover" style={{ width: 42, height: 42, borderRadius: '50%' }} />
      ) : (
        <span
          className="shrink-0 flex items-center justify-center text-white font-semibold text-base"
          style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--tg-brand-color)', fontSize: 16 }}
        >
          {initials}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[15px]" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{name}</span>
          <TrustBadge score={trustScore} compact />
        </div>
        <div className="text-[13px] mt-0.5" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
          {username ? `@${username} · ` : ''}{t('createdAt', { date: formatDate(createdAt, i18n.language) })}
        </div>
      </div>
    </div>
  )

  return (
    <Link
      to={`/profile/${userId}`}
      className="block transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      style={{ textDecoration: 'none' }}
      aria-label={t('openProfile', { name: `${name}${username ? `, @${username}` : ''}` })}
    >
      {content}
    </Link>
  )
}
