import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'ru', label: 'RU', title: 'Russia' },
  { code: 'en', label: 'EN', title: 'United Kingdom' },
  { code: 'hi', label: 'HI', title: 'India' },
] as const

type LanguageCode = (typeof LANGUAGES)[number]['code']

function LanguageFlag({ code, title }: { code: LanguageCode; title: string }) {
  const sharedProps = {
    width: 19,
    height: 19,
    viewBox: '0 0 19 19',
    className: 'shrink-0 overflow-hidden rounded-full shadow-[0_0_0_1px_rgba(0,0,0,.08)]',
    role: 'img',
    'aria-label': title,
  } as const

  if (code === 'ru') {
    return (
      <svg {...sharedProps}>
        <path fill="#fff" d="M0 0h19v6.33H0z" />
        <path fill="#2455A4" d="M0 6.33h19v6.34H0z" />
        <path fill="#D52B1E" d="M0 12.67h19V19H0z" />
      </svg>
    )
  }

  if (code === 'hi') {
    return (
      <svg {...sharedProps}>
        <path fill="#FF9933" d="M0 0h19v6.33H0z" />
        <path fill="#fff" d="M0 6.33h19v6.34H0z" />
        <path fill="#138808" d="M0 12.67h19V19H0z" />
        <circle cx="9.5" cy="9.5" r="2.1" fill="none" stroke="#000080" strokeWidth=".8" />
        <circle cx="9.5" cy="9.5" r=".45" fill="#000080" />
      </svg>
    )
  }

  return (
    <svg {...sharedProps}>
      <path fill="#012169" d="M0 0h19v19H0z" />
      <path stroke="#fff" strokeWidth="4.2" d="M-2 -1l23 21M21 -1L-2 20" />
      <path stroke="#C8102E" strokeWidth="2.4" d="M-2 -1l23 21M21 -1L-2 20" />
      <path stroke="#fff" strokeWidth="6" d="M9.5 0v19M0 9.5h19" />
      <path stroke="#C8102E" strokeWidth="3.5" d="M9.5 0v19M0 9.5h19" />
    </svg>
  )
}

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function select(code: string) {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="flex h-[38px] items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
        style={{
          background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
          color: 'var(--tg-theme-text-color, #1C1C1E)',
        }}
      >
        <LanguageFlag code={current.code} title={current.title} />
        <span>{current.label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 overflow-hidden rounded-lg shadow-lg"
          style={{
            background: 'var(--tg-theme-bg-color, #fff)',
            border: '1px solid color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 15%, transparent)',
          }}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="menuitem"
              onClick={() => select(lang.code)}
              className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:opacity-80 active:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-inset"
              style={{
                background: lang.code === current.code ? 'var(--tg-theme-secondary-bg-color, #F2F2F7)' : 'transparent',
                color: 'var(--tg-theme-text-color, #1C1C1E)',
              }}
            >
              <LanguageFlag code={lang.code} title={lang.title} />
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
