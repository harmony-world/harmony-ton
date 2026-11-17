import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useProfile } from '../../hooks/useApi'
import { usersApi, type UserProfile } from '../../api/users'
import { legalDocText, type LegalDocKind } from '../../legal'
import { useBackButton } from '../../hooks/useBackButton'
import { HarmonyBadge } from '../common/HarmonyBadge'
import { LegalDocument } from './LegalDocument'

export function TermsGate({ children }: { children: ReactNode }) {
  const { data: profile, isLoading } = useProfile()

  if (isLoading) return null
  const terms = profile?.terms
  if (!terms || terms.acceptedVersion === terms.currentVersion) return <>{children}</>
  return <TermsScreen version={terms.currentVersion} />
}

function TermsScreen({ version }: { version: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<LegalDocKind | null>(null)

  if (open) {
    return <LegalDocumentScreen kind={open} language={i18n.language} onBack={() => setOpen(null)} />
  }

  const accept = async () => {
    setBusy(true)
    setError(false)
    try {
      const terms = await usersApi.acceptTerms(version)
      queryClient.setQueryData<UserProfile>(['profile'], (p) => (p ? { ...p, terms } : p))
    } catch {
      setError(true)
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
    } finally {
      setBusy(false)
    }
  }

  const docLink = (kind: LegalDocKind) => (
    <button
      type="button"
      onClick={() => setOpen(kind)}
      className="font-medium text-[var(--tg-theme-link-color,#007AFF)] underline-offset-2 active:opacity-70"
    >
      {t(`terms.${kind}`)}
    </button>
  )

  return (
    <div className="tg-app-viewport flex flex-col px-6 pb-6 pt-10 text-[color:var(--app-text-color)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="my-auto flex flex-col items-center gap-5 py-2 text-center">
          <div className="[--hb-text:var(--app-text-color)]">
            <HarmonyBadge />
          </div>
          <h1 className="text-[22px] font-bold leading-tight">{t('terms.title')}</h1>
          <p className="text-[15px] leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">{t('terms.intro')}</p>
          <div className="flex flex-col items-center gap-2 text-[15px]">
            {docLink('terms')}
            {docLink('privacy')}
          </div>
        </div>
      </div>
      <label className="flex items-start gap-3 py-4 text-left text-[14px] leading-snug">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--tg-theme-button-color,#2AABEE)]"
        />
        <span>{t('terms.checkbox')}</span>
      </label>
      {error && (
        <p role="alert" className="pb-2 text-center text-[13px] text-[var(--tg-theme-destructive-text-color,#D0021B)]">
          {t('terms.error')}
        </p>
      )}
      <button
        type="button"
        onClick={() => void accept()}
        disabled={!checked || busy}
        className="h-[50px] w-full rounded-xl bg-[var(--tg-theme-button-color,#2AABEE)] text-[16px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition-opacity active:opacity-80 disabled:opacity-40"
      >
        {busy ? t('terms.accepting') : t('terms.accept')}
      </button>
    </div>
  )
}

export function LegalDocumentScreen({ kind, language, onBack }: { kind: LegalDocKind; language: string; onBack: () => void }) {
  const { t } = useTranslation()
  useBackButton(onBack)
  return (
    <div className="tg-app-viewport flex flex-col text-[color:var(--app-text-color)]">
      <div className="relative flex h-[50px] shrink-0 items-center border-b border-[color-mix(in_srgb,var(--tg-theme-hint-color,#8E8E93)_14%,transparent)] px-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('terms.back')}
          className="flex h-9 w-9 items-center justify-center rounded-full active:opacity-70"
        >
          <svg width="10" height="17" viewBox="0 0 10 17" fill="none" aria-hidden="true">
            <path d="M8.5 1.5L1.5 8.5l7 7" stroke="var(--tg-theme-link-color,#007AFF)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">
        <LegalDocument text={legalDocText(kind, language)} />
      </main>
    </div>
  )
}
