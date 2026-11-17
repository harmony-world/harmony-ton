import { useTranslation } from 'react-i18next'
import type { ModalState } from './donateModalTypes'

const TEXT = 'var(--tg-theme-text-color, #1C1C1E)'
const HINT = 'var(--tg-theme-hint-color, #8E8E93)'
const SEC_BG = 'var(--tg-theme-secondary-bg-color, #F2F2F7)'

interface DonateModalStatusProps {
  displayState: ModalState
  usdAmount: string | null
  errorMsg: string
  reconnectHint: boolean
  onClose: () => void
  onRetry: () => void
  onReconnect: () => void
}

export function DonateModalStatus({
  displayState,
  usdAmount,
  errorMsg,
  reconnectHint,
  onClose,
  onRetry,
  onReconnect,
}: DonateModalStatusProps) {
  const { t } = useTranslation('campaign')
  if (displayState === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center pb-8">
        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
          <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(31,138,91,.18)', animationDuration: '1.8s' }} />
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: '#1F8A5B' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>
        <p className="font-bold text-[20px]" style={{ color: TEXT }}>{t('donate.successThanks')}</p>
        <p className="text-[15px]" style={{ color: HINT }}>
          {usdAmount ? t('donate.successConfirmedUsd', { amount: usdAmount }) : t('donate.successConfirmed')}
        </p>
        <button
          onClick={onClose}
          className="font-semibold text-white active:opacity-80 transition-opacity"
          style={{ height: 54, padding: '0 32px', borderRadius: 14, background: 'var(--tg-brand-color)', border: 'none', cursor: 'pointer', fontSize: 17 }}
        >
          {t('donate.successClose')}
        </button>
        <div style={{ height: 16 }} />
      </div>
    )
  }

  if (displayState === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center pb-8">
        <div
          className="h-14 w-14 animate-spin rounded-full"
          style={{ border: `4px solid ${SEC_BG}`, borderTopColor: 'var(--tg-brand-color)' }}
          aria-hidden="true"
        />
        <p className="font-bold text-[20px]" style={{ color: TEXT }}>{t('donate.pendingTitle')}</p>
        <p className="text-[15px] leading-relaxed" style={{ color: HINT }}>
          {t('donate.pendingDescription')}
        </p>
        <button
          onClick={onClose}
          className="font-semibold active:opacity-80 transition-opacity"
          style={{ height: 46, padding: '0 24px', borderRadius: 12, background: SEC_BG, color: TEXT, border: 'none', cursor: 'pointer', fontSize: 15 }}
        >
          {t('donate.pendingHide')}
        </button>
        <div style={{ height: 16 }} />
      </div>
    )
  }

  if (displayState === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center pb-6">
        <span className="text-5xl">⚠️</span>
        <p className="font-medium text-base" style={{ color: TEXT }}>{t('donate.errorTitle')}</p>
        <p className="text-sm" style={{ color: HINT }}>{errorMsg}</p>
        <button
          onClick={onRetry}
          className="font-semibold text-white active:opacity-80 transition-opacity"
          style={{ height: 54, padding: '0 32px', borderRadius: 14, background: 'var(--tg-brand-color)', border: 'none', cursor: 'pointer', fontSize: 17 }}
        >
          {t('donate.errorRetry')}
        </button>
        {reconnectHint && (
          <button
            onClick={onReconnect}
            className="font-semibold active:opacity-80 transition-opacity"
            style={{ height: 46, padding: '0 22px', borderRadius: 12, background: SEC_BG, color: TEXT, border: 'none', cursor: 'pointer', fontSize: 15 }}
          >
            {t('donate.resetConnection')}
          </button>
        )}
      </div>
    )
  }

  return null
}
