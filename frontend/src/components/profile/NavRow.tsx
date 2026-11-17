import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldIcon } from './shared'

export function NavRow({
  to,
  icon,
  label,
  meta,
  state,
}: {
  to: string
  icon: ReactNode
  label: string
  meta?: string
  state?: unknown
}) {
  return (
    <Link
      to={to}
      state={state}
      className="flex min-h-[54px] items-center gap-3.5 px-3.5 py-3 text-[var(--tg-theme-text-color,#1C1C1E)] transition-opacity active:opacity-75 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
      style={{ textDecoration: 'none' }}
    >
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[var(--tg-theme-bg-color,#fff)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-[16px] font-medium leading-tight">{label}</span>
      {meta && (
        <span className="shrink-0 rounded-md bg-[var(--tg-theme-bg-color,#fff)] px-2.5 py-1 text-[12px] font-semibold leading-none text-[var(--tg-theme-hint-color,#8E8E93)]">
          {meta}
        </span>
      )}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--tg-theme-hint-color,#8E8E93)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 opacity-60"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}

export function NavIcon({
  type,
}: {
  type: 'shield' | 'campaign' | 'heart' | 'settings' | 'wallet' | 'support' | 'privacy' | 'share'
}) {
  const common = {
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'var(--tg-theme-text-color,#1C1C1E)',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (type === 'shield') return <ShieldIcon tone="neutral" />
  if (type === 'campaign')
    return (
      <svg {...common}>
        <path d="M3 11l17-7v16l-17-7z" />
        <path d="M7 9.5V16" />
      </svg>
    )
  if (type === 'heart')
    return (
      <svg {...common}>
        <path d="M20.8 5.6a5 5 0 0 0-7.1 0l-1.7 1.7-1.7-1.7a5 5 0 1 0-7.1 7.1l1.7 1.7 7.1 7.1 7.1-7.1 1.7-1.7a5 5 0 0 0 0-7.1z" />
      </svg>
    )
  if (type === 'settings')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.2-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
      </svg>
    )
  if (type === 'wallet')
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <path d="M3 10h18" />
        <circle cx="16.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    )
  if (type === 'support')
    return (
      <svg {...common}>
        <path d="M3 15v-3a9 9 0 0 1 18 0v3" />
        <rect x="2.5" y="14" width="4" height="6" rx="1.5" />
        <rect x="17.5" y="14" width="4" height="6" rx="1.5" />
        <path d="M21 18v1a3 3 0 0 1-3 3h-4" />
      </svg>
    )
  if (type === 'share')
    return (
      <svg {...common}>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.7 10.7l6.6-4.4M8.7 13.3l6.6 4.4" />
      </svg>
    )
  return (
    <svg {...common}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
