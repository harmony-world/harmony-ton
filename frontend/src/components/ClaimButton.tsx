import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { beginCell } from '@ton/core'
import { donationsApi } from '../api/donations'
import { isTerminalClaimRefusal } from '../pages/campaignDisplayState'
import { expenseReportPenaltyApplies } from '../utils/expenseReportPenalty'
import { shortTonAddress, tonAddressesMatch } from '../utils/tonAddress'
import { TON_CONNECT_NETWORK } from '../utils/env'
import { normalizeTonConnectMessageAddress } from '../utils/donationTransaction'
import { resetUserScopedTonConnectStorage } from '../utils/tonConnectStorage'
import {
  sendTonConnectTransaction,
  tonConnectDiagnostics,
} from '../utils/tonConnectActions'

const OP_CLAIM = 0x10000002

const CLAIM_GAS_NANO = '50000000'
const CLAIM_GAS_GRAM = '0.05'

interface ClaimButtonProps {
  campaignId: string
  onchainAddress: string
  payoutAddress: string
  isPublic?: boolean
  channelId?: string | null
  raisedAmountUsd: number
  onConfirmStateChange?: (open: boolean) => void
  completedLabel: string
  completedColor: string
}

export function ClaimButton({ campaignId, onchainAddress, payoutAddress, isPublic = true, channelId, raisedAmountUsd, onConfirmStateChange, completedLabel, completedColor }: ClaimButtonProps) {
  const { t } = useTranslation('campaign')
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()
  const queryClient = useQueryClient()
  const [state, setState] = useState<'idle' | 'confirm' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [reconnectHint, setReconnectHint] = useState(false)
  const connectedAddress = walletAddress || tonConnectUI.wallet?.account.address || ''
  const isClaimWallet = tonAddressesMatch(connectedAddress, payoutAddress)

  const { data: eligibility } = useQuery({
    queryKey: ['campaign', campaignId, 'claim-eligibility'],
    queryFn: () => donationsApi.claimEligibility(campaignId),
    staleTime: 30_000,
  })
  const refusal =
    eligibility && eligibility.checked && !eligibility.eligible ? eligibility.reason : null

  useEffect(() => {
    onConfirmStateChange?.(state === 'confirm')
    return () => onConfirmStateChange?.(false)
  }, [onConfirmStateChange, state])

  const handleClaimClick = useCallback(async () => {
    if (!tonConnectUI.connected) {
      await tonConnectUI.openModal()
      return
    }
    if (!isClaimWallet) {
      await tonConnectUI.disconnect()
      await tonConnectUI.openModal()
      return
    }
    setState('confirm')
  }, [tonConnectUI, isClaimWallet])

  const handleConfirm = useCallback(async () => {
    setState('loading')
    setErrorMsg('')
    setReconnectHint(false)
    try {
      const payload = beginCell()
        .storeUint(OP_CLAIM, 32)
        .endCell()
        .toBoc()
        .toString('base64')

      await sendTonConnectTransaction(tonConnectUI, {
        validUntil: Math.floor(Date.now() / 1000) + 300,
        network: TON_CONNECT_NETWORK,
        messages: [{
          address: normalizeTonConnectMessageAddress(onchainAddress),
          amount: CLAIM_GAS_NANO,
          payload,
        }],
      })

      setState('success')
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      }, 5000)
    } catch (err: unknown) {
      console.warn('[ton-connect:claim-failed]', {
        diagnostics: tonConnectDiagnostics(tonConnectUI),
        error: err,
      })
      const msg = err instanceof Error ? err.message : t('claim.transactionError')
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('cancel')) {
        setState('idle')
        return
      }
      setErrorMsg(msg)
      setReconnectHint(true)
      setState('error')
    }
  }, [tonConnectUI, onchainAddress, campaignId, queryClient])

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
      const msg = err instanceof Error ? err.message : t('claim.walletOpenError')
      setErrorMsg(msg)
      setState('error')
    }
  }, [tonConnectUI])

  if (state === 'success') {
    return (
      <div
        className="flex-1 flex items-center justify-center font-semibold"
        style={{ height: 52, borderRadius: 14, background: '#1F8A5B', fontSize: 17, color: '#fff' }}
      >
        {t('claim.fundsSent')}
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
          {t('claim.feeNote', { fee: CLAIM_GAS_GRAM })}
        </div>
        {channelId != null ? (
          <div
            className="w-full max-w-[430px] rounded-[18px] border px-4 py-3.5 text-left text-[14px] leading-[1.45]"
            style={{
              background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
              borderColor: 'color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 14%, transparent)',
              color: 'var(--tg-theme-text-color, #1C1C1E)',
            }}
          >
            {t('claim.channelReportNote')}
          </div>
        ) : isPublic && expenseReportPenaltyApplies(raisedAmountUsd) ? (
          <div
            className="w-full max-w-[430px] rounded-[18px] border px-4 py-3.5 text-left text-[14px] leading-[1.45]"
            style={{
              background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
              borderColor: 'color-mix(in srgb, var(--tg-theme-hint-color, #8E8E93) 14%, transparent)',
              color: 'var(--tg-theme-text-color, #1C1C1E)',
            }}
          >
            {t('claim.publicReportNote')}
          </div>
        ) : null}
        <button
          onClick={handleConfirm}
          className="w-full max-w-[430px] text-center text-white font-semibold active:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
          style={{
            height: 52,
            borderRadius: 14,
            background: '#1F8A5B',
            fontSize: 17,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {t('claim.confirm')}
        </button>
      </div>
    )
  }

  if (isTerminalClaimRefusal(refusal)) {
    return (
      <div
        className="flex-1 flex items-center justify-center font-semibold"
        style={{
          height: 52,
          borderRadius: 14,
          background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
          fontSize: 17,
          color: completedColor,
        }}
      >
        {completedLabel}
      </div>
    )
  }

  if (refusal) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-center font-medium px-3"
        style={{
          minHeight: 52,
          borderRadius: 14,
          background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)',
          fontSize: 15,
          color: 'var(--tg-theme-hint-color, #8E8E93)',
        }}
      >
        {t(`claim.refusal.${refusal}`)}
      </div>
    )
  }

  const buttonLabel = !tonConnectUI.connected
    ? t('claim.connectPayout')
    : !isClaimWallet
      ? t('claim.switchWallet')
      : state === 'loading'
        ? t('claim.sending')
        : t('claim.claimFunds')

  return (
    <div className="flex-1 flex flex-col">
      <button
        onClick={handleClaimClick}
        disabled={state === 'loading'}
        className="w-full text-white font-semibold active:opacity-80 transition-opacity"
        style={{
          height: 52,
          borderRadius: 14,
          background: '#1F8A5B',
          fontSize: 17,
          border: 'none',
          cursor: state === 'loading' ? 'wait' : 'pointer',
          opacity: state === 'loading' ? 0.7 : 1,
        }}
      >
        {buttonLabel}
      </button>
      {tonConnectUI.connected && !isClaimWallet && (
        <div className="text-center mt-1.5 text-[12px]" style={{ color: '#FF9500' }}>
          {t('claim.needPayoutWallet', { address: shortTonAddress(payoutAddress) })}
        </div>
      )}
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
          {t('claim.resetConnection')}
        </button>
      )}
    </div>
  )
}
