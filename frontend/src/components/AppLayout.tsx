import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBackButton } from '../hooks/useBackButton'

function IconFeed({ active }: { active: boolean }) {
  const c = active ? 'var(--tg-brand-color)' : '#8E8E93'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" />
    </svg>
  )
}

function IconCreate() {
  return (
    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--tg-brand-color)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </span>
  )
}

function IconProfile({ active }: { active: boolean }) {
  const c = active ? 'var(--tg-brand-color)' : '#8E8E93'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
    </svg>
  )
}

function IconWallet({ active }: { active: boolean }) {
  const c = active ? 'var(--tg-brand-color)' : '#8E8E93'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M16 12h2.5" /><path d="M2.5 9.5h19" />
    </svg>
  )
}

const tabs = [
  { to: '/', labelKey: 'nav.feed' },
  { to: '/create', labelKey: 'nav.create' },
  { to: '/profile', labelKey: 'nav.profile' },
  { to: '/wallet', labelKey: 'nav.wallet' },
]

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isRoot = location.pathname === '/'

  useBackButton(isRoot ? undefined : () => navigate(-1))

  return (
    <div className="tg-app-viewport flex flex-col text-[var(--tg-theme-text-color,var(--app-text-color))]">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <nav className="tg-safe-bottom flex shrink-0 border-t border-[rgba(60,60,67,0.1)] bg-[var(--app-bg-color)]">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className="flex-1 flex flex-col items-center gap-1 py-2 transition-colors"
          >
            {({ isActive }) => (
              <>
                {tab.to === '/' && <IconFeed active={isActive} />}
                {tab.to === '/create' && <IconCreate />}
                {tab.to === '/profile' && <IconProfile active={isActive} />}
                {tab.to === '/wallet' && <IconWallet active={isActive} />}
                <span
                  className={`text-[10.5px] leading-none ${
                    isActive ? 'font-semibold text-[var(--tg-brand-color)]' : 'font-medium text-[#8E8E93]'
                  }`}
                >
                  {t(tab.labelKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
