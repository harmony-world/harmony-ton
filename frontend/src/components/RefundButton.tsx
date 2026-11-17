import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { beginCell } from '@ton/core'
import { donationsApi } from '../api/donations'
import { TON_CONNECT_NETWORK } from '../utils/env'
import { normalizeTonConnectMessageAddress } from '../utils/donationTransaction'
import { resetUserScopedTonConnectStorage } from '../utils/tonConnectStorage'
import { sendTonConnectTransaction, tonConnectDiagnostics } from '../utils/tonConnectActions'

const OP_REFUND = 0x10000003

interface RefundButtonProps {
  campaignId: string
  onchainAddress: string
  blockedLabel: string
}

export function RefundButton({ campaignId, onchainAddress, blockedLabel }: RefundButtonProps) {
  const { t } = useTranslation('campaign')
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()
  const queryClient = useQueryClient()
  const [state, setState] = useState<'idle' | 'confirm' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [reconnectHint, setReconnectHint] = useState(false)

  const connectedAddress = walletAddress || tonConnectUI.wallet?.account.address || ''

  const { data: eligibility } = useQuery({
    queryKey: ['campaign', campaignId, 'refund-eligibility', connectedAddress],
    queryFn: () => donationsApi.refundEligibility(campaignId, connectedAddress),
    enabled: connectedAddress.length > 0,
    staleTime: 30_000,
  })

  const handleConfirm = useCallback(async () => {
    if (!eligibility?.gasGram) return
    setState('loading')
    setErrorMsg('')
    setReconnectHint(false)
    try {
      const payload = beginCell().storeUint(OP_REFUND, 32).endCell().toBoc().toString('base64')

      await sendTonConnectTransaction(tonConnectUI, {
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: TON_CONNECT_NETWORK,
        messages: [{
          address: normalizeTonConnectMessageAddress(onchainAddress),
          amount: BigInt(Math.round(Number(eligibility.gasGram) * 1e9)).toString(),
          payload,
        }],
      })

      setState('success')
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      }, 5000)
    } catch (err: unknown) {
      console.warn('[ton-connect:refund-failed]', {
        diagnostics: tonConnectDiagnostics(tonConnectUI),
        error: err,
      })
      const msg = err instanceof Error ? err.message : t('refund.transactionError')
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('cancel')) {
        setState('idle')
        return
      }
      setErrorMsg(msg)
      setReconnectHint(true)
      setState('error')
    }
  }, [eligibility, tonConnectUI, onchainAddress, campaignId, queryClient, t])

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
      setErrorMsg(err instanceof Error ? err.message : t('refund.walletOpenError'))
      setState('error')
    }
  }, [tonConnectUI, t])

  const pill = (text: string, color = 'var(--tg-theme-hint-color, #8E8E93)') => (
    <div
      className="flex-1 flex items-center justify-center font-semibold"
      style={{ height: 52, borderRadius: 14, background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)', fontSize: 17, color }}
    >
      {text}
    </div>
  )

  if (state === 'success') return pill(t('refund.sent'), '#1F8A5B')

  if (!connectedAddress) {
    return (
      <div className="flex-1 flex flex-col">
        <button
          onClick={() => void tonConnectUI.openModal()}
          className="w-full text-white font-semibold active:opacity-80 transition-opacity"
          style={{ height: 52, borderRadius: 14, background: 'var(--tg-brand-color)', fontSize: 17, border: 'none', cursor: 'pointer' }}
        >
          {t('refund.connectWallet')}
        </button>
      </div>
    )
  }

  if (!eligibility?.eligible) {
    return (
      <div className="flex-1 flex flex-col">
        {pill(blockedLabel)}
        {eligibility?.reason === 'no_donation' && (
          <div className="text-center mt-1.5 text-[12px]" style={{ color: 'var(--tg-theme-hint-color, #8E8E93)' }}>
            {t('refund.otherWallet')}
          </div>
        )}
      </div>
    )
  }

  if (state === 'confirm') {
    return (
      <div className="flex-1 flex flex-col items-center gap-3">
        <div
          className="w-full max-w-[430px] rounded-[18px] border px-4 py-3.5 text-left text-[14px] leading-[1.45]"
          style={{
            background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
            borderColor: 'color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 14%, transparent)',
            color: 'var(--tg-theme-text-color, #1C1C1E)',
          }}
        >
          {t('refund.feeNote', { fee: eligibility.gasGram })}
        </div>
        <button
          onClick={handleConfirm}
          className="w-full max-w-[430px] text-center text-white font-semibold active:opacity-80 transition-opacity"
          style={{ height: 52, borderRadius: 14, background: 'var(--tg-brand-color)', fontSize: 17, border: 'none', cursor: 'pointer' }}
        >
          {t('refund.confirm')}
        </button>
      </div>
    )
  }

  const amountLabel = eligibility.amountUsdt > 0
    ? t('refund.amountBoth', { gram: eligibility.amountGram, usdt: eligibility.amountUsdt })
    : t('refund.amountGram', { gram: eligibility.amountGram })

  return (
    <div className="flex-1 flex flex-col">
      <button
        onClick={() => setState('confirm')}
        disabled={state === 'loading'}
        className="w-full text-white font-semibold active:opacity-80 transition-opacity"
        style={{
          height: 52,
          borderRadius: 14,
          background: 'var(--tg-brand-color)',
          fontSize: 17,
          border: 'none',
          cursor: state === 'loading' ? 'wait' : 'pointer',
          opacity: state === 'loading' ? 0.7 : 1,
        }}
      >
        {state === 'loading' ? t('refund.sending') : t('refund.refundMine', { amount: amountLabel })}
      </button>
      {state === 'error' && errorMsg && (
        <div className="text-center mt-1.5 text-[12px]" style={{ color: '#FF3B30' }}>
          {errorMsg}
        </div>
      )}
      {state === 'error' && reconnectHint && (
        <button
          onClick={handleReconnect}
          className="mt-2 w-full font-semibold active:opacity-80 transition-opacity"
          style={{
            height: 42,
            borderRadius: 12,
            background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
            color: 'var(--tg-theme-text-color, #1C1C1E)',
            fontSize: 15,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {t('refund.resetConnection')}
        </button>
      )}
    </div>
  )
}
