import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWalletState } from '../hooks/useWalletState'

function shortenAddress(address: string): string {
  if (address.length <= 16) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function triggerHaptic(kind: 'success' | 'warning' | 'error'): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(kind)
  } catch {
  }
}

function WalletIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--tg-brand-color)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5.5" width="19" height="14" rx="3" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" />
    </svg>
  )
}

function StatusRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: color }} />
      <span className="text-[13.5px]" style={{ color: 'var(--tg-theme-hint-color, #3a3a3c)' }}>{label}</span>
    </div>
  )
}

export function WalletPage() {
  const { t } = useTranslation('wallet')
  const {
    liveAddress,
    serverAddress,
    isLiveConnected,
    isRestoringSession,
    tonConnectUI,
  } = useWalletState()

  const displayAddress = liveAddress || serverAddress
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copyAddress() {
    if (!displayAddress) return
    try {
      await navigator.clipboard.writeText(displayAddress)
      setCopyState('copied')
      triggerHaptic('success')
    } catch {
      setCopyState('error')
      triggerHaptic('error')
    }
    window.setTimeout(() => setCopyState('idle'), 2000)
  }

  if (!displayAddress) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-9 text-center" style={{ paddingBottom: 60 }}>
        <div
          className="flex items-center justify-center mb-6"
          style={{ width: 92, height: 92, borderRadius: 24, background: 'rgba(var(--tg-brand-color-rgb),.12)' }}
        >
          <WalletIcon size={44} />
        </div>
        <p className="font-bold text-[20px] mb-2.5" style={{ color: 'var(--tg-theme-text-color, #1C1C1E)' }}>{t('emptyTitle')}</p>
        <p className="text-[15px] leading-relaxed mb-6" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)', lineHeight: 1.55 }}>
          {t('emptyText')}
        </p>
        <button
          onClick={() => tonConnectUI.openModal()}
          className="w-full font-semibold text-white active:opacity-80 transition-opacity"
          style={{ height: 54, borderRadius: 14, background: 'var(--tg-brand-color)', border: 'none', cursor: 'pointer', fontSize: 17 }}
        >
          {t('connect')}
        </button>
        <p className="mt-3.5 text-[12.5px]" style={{ color: '#a0a0a4' }}>
          {t('supported')}
        </p>
      </div>
    )
  }

  const shortAddress = shortenAddress(displayAddress)
  const cardBg = 'var(--tg-theme-secondary-bg-color, #F7F7FA)'
  const primaryText = 'var(--tg-theme-text-color, #1C1C1E)'
  const hintText = 'var(--tg-theme-hint-color, #8E8E93)'

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 flex flex-col gap-3">
        <section className="rounded-[16px] p-4 flex flex-col gap-3" style={{ background: cardBg }}>
          <div className="flex items-center gap-3">
            <span
              className="shrink-0 flex items-center justify-center"
              style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(var(--tg-brand-color-rgb),.12)' }}
            >
              <WalletIcon />
            </span>
            <div className="font-semibold text-[15px]" style={{ color: primaryText }}>{t('myWallet')}</div>
          </div>

          <button
            type="button"
            onClick={copyAddress}
            className="w-full text-left rounded-[12px] px-3 py-2.5 flex items-center justify-between gap-3 active:opacity-70 transition-opacity"
            style={{
              background: 'var(--tg-theme-bg-color, #FFFFFF)',
              border: 'none',
              cursor: 'pointer',
              minHeight: 48,
            }}
            aria-label={t('copyAddress')}
          >
            <span className="font-mono text-[13.5px] break-all" style={{ color: primaryText }}>
              {shortAddress}
            </span>
            <span className="text-[12.5px] shrink-0 flex items-center gap-1" style={{ color: copyState === 'copied' ? '#1F8A5B' : hintText }}>
              {copyState === 'copied' ? t('copied') : copyState === 'error' ? t('copyError') : t('copy')}
            </span>
          </button>

          <div className="flex flex-col gap-1.5">
            <StatusRow color="#1F8A5B" label={t('bound')} />
            <StatusRow color="#1F8A5B" label={t('kyc1')} />
          </div>
        </section>

        <section className="rounded-[16px] p-4 flex flex-col gap-3" style={{ background: cardBg }}>
          <div className="font-semibold text-[15px]" style={{ color: primaryText }}>
            {t('donationsAndCampaigns')}
          </div>

          {isRestoringSession ? (
            <>
              <div className="text-[13.5px]" style={{ color: hintText }}>
                {t('checking')}
              </div>
              <button
                type="button"
                disabled
                className="w-full font-semibold text-white"
                style={{ height: 50, borderRadius: 14, background: '#B3D9EE', border: 'none', cursor: 'not-allowed', fontSize: 16, opacity: 0.7 }}
              >
                {t('connect')}
              </button>
            </>
          ) : isLiveConnected ? (
            <>
              <StatusRow color="#1F8A5B" label={t('connected')} />
              <button
                type="button"
                onClick={() => tonConnectUI.disconnect()}
                className="text-left text-[14px] font-medium min-h-11 active:opacity-70 transition-opacity"
                style={{ color: 'var(--tg-brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
              >
                {t('disconnect')}
              </button>
              <div className="text-[12.5px]" style={{ color: hintText }}>
                {t('bindingStays')}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13.5px] leading-relaxed" style={{ color: hintText, lineHeight: 1.5 }}>
                {t('connectToDonate')}
              </div>
              <button
                type="button"
                onClick={() => tonConnectUI.openModal()}
                className="w-full font-semibold text-white active:opacity-80 transition-opacity"
                style={{ height: 50, borderRadius: 14, background: 'var(--tg-brand-color)', border: 'none', cursor: 'pointer', fontSize: 16 }}
              >
                {t('connect')}
              </button>
              <div className="text-[12.5px]" style={{ color: hintText }}>
                {t('sameWallet')}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
