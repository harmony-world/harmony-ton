import { useTranslation } from 'react-i18next'

export function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('kyc')
  return (
    <button
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      aria-label={t('common.back')}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )
}

export function RequirementRow({
  icon,
  children,
  withDivider,
}: {
  icon: 'document' | 'camera'
  children: string
  withDivider?: boolean
}) {
  return (
    <div
      className="flex items-center gap-3.5 py-3.5"
      style={{
        borderBottom: withDivider
          ? '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 16%, transparent)'
          : 'none',
      }}
    >
      {icon === 'document' ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-text-color,#1C1C1E)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <rect x="3" y="5" width="18" height="14" rx="2.4" />
          <circle cx="8" cy="11" r="2" />
          <path d="M13 10h5M13 14H6.5M14 14h4" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-text-color,#1C1C1E)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M21 18.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h2.5l1.6-2.4h5.8L17 6.5H19a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="3.6" />
        </svg>
      )}
      <span className="text-[15px] font-medium leading-snug text-[var(--tg-theme-text-color,#1C1C1E)]">{children}</span>
    </div>
  )
}
