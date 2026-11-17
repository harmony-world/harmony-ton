import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTonPrice } from '../hooks/useApi'
import { donationsApi } from '../api/donations'
import { walletsApi } from '../api/wallets'
import {
  buildGramDonationTransaction,
  buildJettonTransferBody,
  buildUsdtDonationTransaction,
} from '../utils/donationTransaction'
import { resetUserScopedTonConnectStorage } from '../utils/tonConnectStorage'
import { sanitizeDecimalInput } from '../utils/numericInput'
import {
  sendTonConnectTransaction,
  tonConnectDiagnostics,
} from '../utils/tonConnectActions'
import { DonateModalStatus } from './DonateModalStatus'
import { BG, HINT, PRESETS, SEC_BG, TEXT, USDT_MASTER, type DonateModalProps, type DonationCoin, type ModalState } from './donateModalTypes'
export function DonateModal({ campaign, onClose, onDonationSubmitted, donationConfirmed = false }: DonateModalProps) {
  const { t } = useTranslation('campaign')
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()
  const queryClient = useQueryClient()
  const { data: priceData } = useTonPrice()
  const usdtAccepted = campaign.acceptsUsdt !== false
  const coins: DonationCoin[] = usdtAccepted ? ['USDT', 'GRAM'] : ['GRAM']
  const [coin, setCoin] = useState<DonationCoin>(usdtAccepted ? 'USDT' : 'GRAM')
  const [amount, setAmount] = useState('')
  const [isAnon, setIsAnon] = useState(false)
  const [donorName, setDonorName] = useState('')
  const [tipPct, setTipPct] = useState(1)
  const [state, setState] = useState<ModalState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [reconnectHint, setReconnectHint] = useState(false)

  const amountFloat = parseFloat(amount) || 0
  const tipFraction = tipPct / 100
  const totalAmount = amountFloat > 0 ? amountFloat * (1 + tipFraction) : 0
  const usdAmount = coin === 'GRAM' && amountFloat > 0 && priceData
    ? (amountFloat * priceData.usd).toFixed(2)
    : null
  const tipAmount = amountFloat > 0 && tipPct > 0 ? (amountFloat * tipFraction).toFixed(4) : null

  const canSend = walletAddress && amountFloat > 0 && state === 'idle'

  const handleCoinChange = (c: DonationCoin) => {
    setCoin(c)
    setAmount('')
  }

  const handleSend = useCallback(async () => {
    if (!canSend || !walletAddress) return
    setState('loading')
    setErrorMsg('')
    setReconnectHint(false)
    try {
      const contractAddr = campaign.onchainAddress
      if (!contractAddr) throw new Error(t('donate.notDeployed'))

      await donationsApi.createIntent(campaign.id, {
        walletAddress,
        amount: totalAmount,
        currency: coin,
        donorName: isAnon ? null : donorName.trim() || null,
        isAnonymous: isAnon,
      })

      const effectiveTipBps = tipPct > 0 ? Math.round(tipPct * 10000 / (100 + tipPct)) : 0
      if (coin === 'GRAM') {
        const nanoton = BigInt(Math.round(totalAmount * 1e9)).toString()
        await sendTonConnectTransaction(
          tonConnectUI,
          buildGramDonationTransaction(contractAddr, nanoton, effectiveTipBps),
        )
      } else {
        if (!USDT_MASTER) throw new Error(t('donate.usdtUnavailable'))
        const nUSDT = BigInt(Math.round(totalAmount * 1e6))
        let senderJettonWallet: string
        try {
          senderJettonWallet = (await walletsApi.getJettonWalletAddress(walletAddress, USDT_MASTER)).address
        } catch {
          throw new Error(t('donate.noUsdt'))
        }
        const payload = buildJettonTransferBody(nUSDT, contractAddr, walletAddress, campaign.id, effectiveTipBps)
        await sendTonConnectTransaction(
          tonConnectUI,
          buildUsdtDonationTransaction(senderJettonWallet, payload),
        )
      }

      if (onDonationSubmitted) {
        onDonationSubmitted()
      } else {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ['campaign', campaign.id] }),
          queryClient.invalidateQueries({ queryKey: ['donations', campaign.id] }),
        ])
      }

      setState('pending')
    } catch (err: unknown) {
      console.warn('[ton-connect:donate-failed]', {
        diagnostics: tonConnectDiagnostics(tonConnectUI),
        error: err,
      })
      const msg = err instanceof Error ? err.message : t('donate.transactionError')
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('cancel')) {
        setState('idle')
        return
      }
      setErrorMsg(msg)
      setReconnectHint(true)
      setState('error')
    }
  }, [canSend, walletAddress, coin, totalAmount, tipPct, isAnon, donorName, campaign, tonConnectUI, queryClient, onDonationSubmitted])

  const handleReconnect = useCallback(async () => {
    setErrorMsg('')
    setState('loading')
    try {
      try {
        await tonConnectUI.disconnect()
      } catch {
      }
      resetUserScopedTonConnectStorage()
      setReconnectHint(false)
      setState('idle')
      await tonConnectUI.openModal()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('donate.walletOpenError')
      setErrorMsg(msg)
      setState('error')
    }
  }, [tonConnectUI])

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    if (state !== 'pending' || donationConfirmed) return
    const timeout = window.setTimeout(() => {
      setErrorMsg(t('donate.timeoutError'))
      setReconnectHint(false)
      setState('error')
    }, 5 * 60_000)
    return () => window.clearTimeout(timeout)
  }, [donationConfirmed, state])

  const tipFillPct = `${(tipPct / 15) * 100}%`
  const presets = PRESETS[coin]
  const displayState: ModalState = state === 'pending' && donationConfirmed ? 'success' : state

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(20,24,32,.5)' }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-lg flex flex-col"
        style={{ background: BG, color: TEXT, borderRadius: '24px 24px 0 0', padding: '10px 22px 0', boxShadow: '0 -10px 40px rgba(0,0,0,.22)', maxHeight: '93dvh' }}
      >
        <div style={{ width: 38, height: 5, borderRadius: 3, background: HINT, opacity: 0.5, margin: '0 auto 14px' }} />

        <div className="flex-1 overflow-y-auto">
          {displayState === 'success' || displayState === 'pending' || displayState === 'error' ? (
            <DonateModalStatus
              displayState={displayState}
              usdAmount={usdAmount}
              errorMsg={errorMsg}
              reconnectHint={reconnectHint}
              onClose={onClose}
              onRetry={() => setState('idle')}
              onReconnect={handleReconnect}
            />
          ) : (
            <>
              <div className="text-[13px] mb-0.5" style={{ color: HINT }}>{t('donate.title')}</div>
              <div className="font-bold leading-snug mb-4" style={{ fontSize: 18, color: TEXT }}>{campaign.title}</div>

              <div className={`flex gap-2 ${usdtAccepted ? 'mb-4' : 'mb-2'}`} style={{ background: SEC_BG, borderRadius: 12, padding: 4 }}>
                {coins.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleCoinChange(c)}
                    className="flex-1 flex items-center justify-center gap-1.5 font-semibold transition-all"
                    style={{
                      height: 36,
                      borderRadius: 9,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 15,
                      background: coin === c ? 'var(--tg-brand-color)' : 'transparent',
                      color: coin === c ? '#fff' : HINT,
                    }}
                  >
                    {c === 'GRAM' ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L3 8.5V15.5L12 22L21 15.5V8.5L12 2Z" fill={coin === 'GRAM' ? '#fff' : '#0088CC'} />
                        <path d="M12 7L9 12L12 17L15 12L12 7Z" fill="white" opacity="0.9"/>
                        <circle cx="12" cy="12" r="1.5" fill="white"/>
                      </svg>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 700, color: coin === 'USDT' ? '#fff' : '#26A17B' }}>₮</span>
                    )}
                    {c}
                  </button>
                ))}
              </div>

              {!usdtAccepted && (
                <div className="text-[12px] leading-snug mb-4 px-1" style={{ color: HINT }}>
                  {t('donate.gramOnlyNote')}
                </div>
              )}

              <div className="font-semibold text-[14px] mb-2.5" style={{ color: TEXT }}>{t('donate.amount')}</div>

              <div className="flex gap-2.5 mb-3">
                {presets.map((p) => {
                  const selected = amount === String(p)
                  return (
                    <button
                      key={p}
                      onClick={() => setAmount(String(p))}
                      className="relative flex-1 font-semibold transition-colors"
                      style={{
                        height: 48,
                        borderRadius: 12,
                        border: selected ? '2px solid var(--tg-brand-color)' : `1.5px solid ${SEC_BG}`,
                        background: selected ? 'rgba(var(--tg-brand-color-rgb),.07)' : BG,
                        color: TEXT,
                        fontSize: 15,
                        cursor: 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>

              <div
                className="flex items-center mb-2"
                style={{ height: 56, border: `1.5px solid ${SEC_BG}`, borderRadius: 13, padding: '0 16px', background: BG }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
                  className="flex-1 outline-none bg-transparent font-bold"
                  style={{ fontSize: 22, color: TEXT, minWidth: 0 }}
                />
                <span className="font-bold text-[16px]" style={{ color: HINT }}>{coin}</span>
              </div>

              {usdAmount && (
                <div className="font-medium text-[14px] mb-5" style={{ color: HINT }}>≈ {usdAmount} USD</div>
              )}

              <div className="flex items-center justify-between mb-3" style={{ paddingTop: 2 }}>
                <div>
                  <div className="font-semibold text-[15px]" style={{ color: TEXT }}>{t('donate.anonymous')}</div>
                  <div className="text-[12.5px] mt-0.5" style={{ color: HINT }}>{t('donate.anonymousHint')}</div>
                </div>
                <button
                  onClick={() => setIsAnon((v) => !v)}
                  className="shrink-0 relative"
                  style={{ width: 50, height: 30, borderRadius: 15, background: isAnon ? 'var(--tg-brand-color)' : SEC_BG, border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <span
                    className="absolute transition-transform"
                    style={{
                      top: 3,
                      left: isAnon ? 23 : 3,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: BG,
                      boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                    }}
                  />
                </button>
              </div>

              {!isAnon && (
                <input
                  type="text"
                  placeholder={t('donate.namePlaceholder')}
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  maxLength={64}
                  className="w-full outline-none mb-4"
                  style={{ height: 48, border: `1.5px solid ${SEC_BG}`, borderRadius: 12, padding: '0 14px', fontSize: 15, color: TEXT, background: BG }}
                />
              )}

              <div className="flex items-center justify-between mb-3.5">
                <span className="font-semibold text-[14px]" style={{ color: TEXT }}>
                  {t('donate.tip')} · <span style={{ color: 'var(--tg-brand-color)' }}>{tipPct}%</span>
                </span>
                {tipAmount && (
                  <span className="text-[13px]" style={{ color: HINT }}>≈ {tipAmount} {coin}</span>
                )}
              </div>
              <div className="relative flex items-center mb-2" style={{ height: 24 }}>
                <div className="absolute left-0 right-0 rounded-full" style={{ height: 6, background: SEC_BG }} />
                <div className="absolute left-0 rounded-full" style={{ width: tipFillPct, height: 6, background: 'var(--tg-brand-color)' }} />
                <div
                  className="absolute"
                  style={{
                    left: `calc(${tipFillPct} - 11px)`,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: BG,
                    boxShadow: '0 1px 5px rgba(0,0,0,.28)',
                    border: '1px solid rgba(0,0,0,.04)',
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={tipPct}
                  onChange={(e) => setTipPct(Number(e.target.value))}
                  className="absolute left-0 right-0 w-full opacity-0 cursor-pointer"
                  style={{ height: 24, margin: 0 }}
                />
              </div>
              <div className="text-[13px] mb-2" style={{ color: HINT }}>{t('donate.tipRange')}</div>
              <div style={{ height: 8 }} />
            </>
          )}
        </div>

        {state !== 'success' && state !== 'error' && (
          <div style={{ paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', background: BG }}>
            {walletAddress && (
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M16 12h2.5" />
                </svg>
                <span className="text-[12.5px]" style={{ color: HINT }}>
                  {t('donate.walletConnected')} · {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                </span>
              </div>
            )}
            {walletAddress ? (
              <button
                disabled={!canSend}
                onClick={() => void handleSend()}
                className="w-full font-semibold transition-opacity"
                style={{
                  height: 54,
                  borderRadius: 14,
                  background: canSend ? 'var(--tg-brand-color)' : SEC_BG,
                  color: canSend ? '#fff' : HINT,
                  border: 'none',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                  fontSize: 17,
                }}
              >
                {state === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {t('donate.sending')}
                  </span>
                ) : totalAmount > 0 ? (
                  t('donate.sendWithAmount', { amount: totalAmount % 1 === 0 ? totalAmount : totalAmount.toFixed(4), coin })
                ) : (
                  t('donate.send')
                )}
              </button>
            ) : (
              <button
                onClick={() => tonConnectUI.openModal()}
                className="w-full font-semibold text-white active:opacity-80 transition-opacity"
                style={{ height: 54, borderRadius: 14, background: 'var(--tg-brand-color)', border: 'none', cursor: 'pointer', fontSize: 17 }}
              >
                {t('donate.connectWallet')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
