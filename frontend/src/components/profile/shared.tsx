import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toneColors, type Tone } from './sharedUtils'

export function ShieldIcon({ tone = 'neutral' }: { tone?: Tone }) {
  const { color } = toneColors[tone]
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5l7.5 2.8v5.7c0 4.7-3.2 8-7.5 10.2-4.3-2.2-7.5-5.5-7.5-10.2V5.3L12 2.5z" />
      {tone === 'ok' && <path d="M8.7 12.1l2.2 2.2 4.4-4.6" />}
      {tone === 'bad' && <path d="M12 8.5v4.5M12 16.2v.1" />}
    </svg>
  )
}

export function SpinnerIcon() {
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border-2 border-[#C77700] border-t-transparent motion-safe:animate-spin"
      aria-hidden="true"
    />
  )
}

export function BackLink() {
  const { t } = useTranslation('profile')
  return (
    <Link
      to="/profile"
      className="flex h-10 w-10 items-center justify-center text-[var(--tg-theme-link-color,#007AFF)] transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      aria-label={t('common.back')}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  )
}

export function PageHeader({ title }: { title: string }) {
  return (
    <div className="relative flex h-[50px] shrink-0 items-center border-b border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)] px-3">
      <BackLink />
      <h1 className="pointer-events-none absolute left-14 right-14 text-center text-[16px] font-semibold leading-none text-[var(--tg-theme-text-color,#1C1C1E)]">
        {title}
      </h1>
    </div>
  )
}
