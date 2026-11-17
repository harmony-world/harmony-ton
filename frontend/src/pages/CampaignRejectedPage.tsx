import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function CampaignRejectedPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation(['create', 'common'])
  const state = location.state as { message?: string } | null
  const message = state?.message ?? t('create:rejectedDefault')

  return (
    <div className="tg-app-viewport flex flex-col items-center justify-center px-6 text-center bg-[var(--tg-theme-bg-color,#fff)]">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full mb-5"
        style={{ background: 'color-mix(in srgb, #FF3B30 14%, transparent)' }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#FF3B30" strokeWidth="2" />
          <path d="M8 8l8 8M16 8l-8 8" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <h1 className="text-xl font-semibold text-[var(--tg-theme-text-color,#1C1C1E)] mb-3">
        {t('create:rejectedTitle')}
      </h1>

      <p className="text-sm leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)] max-w-xs whitespace-pre-line">
        {message}
      </p>

      <p className="mt-4 mb-8 max-w-xs rounded-[14px] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] px-4 py-3 text-sm leading-relaxed text-[var(--tg-theme-text-color,#1C1C1E)]">
        {t('create:rejectedSupportText')}{' '}
        <Link
          to="/profile/support"
          className="inline font-semibold text-[var(--tg-theme-link-color,var(--tg-brand-color))] underline decoration-current underline-offset-4 transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        >
          {t('create:rejectedSupportLink')}
        </Link>
      </p>

      <button
        type="button"
        onClick={() => navigate('/profile', { replace: true })}
        className="w-full max-w-xs rounded-[14px] py-3.5 text-[16px] font-semibold text-white"
        style={{ background: 'var(--tg-brand-color)' }}
      >
        {t('common:common.close')}
      </button>
    </div>
  )
}
