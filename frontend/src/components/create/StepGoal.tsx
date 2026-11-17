import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { shortTonAddress, tonAddressesMatch } from '../../utils/tonAddress'
import { CAMPAIGN_GOAL_MAX_USD_FALLBACK } from '../../utils/createCampaignWizard'
import { sanitizeIntegerInput } from '../../utils/numericInput'
import { PayoutWalletKindNote } from './PayoutWalletKindNote'

interface GoalState {
  goalAmount: string
  deadline: string
  payoutAddress: string
}

interface Props {
  state: GoalState
  onChange: (patch: Partial<GoalState>) => void
  errors: Partial<Record<keyof GoalState, string>>
  liveWalletAddress?: string
  serverWalletAddress?: string
  isLiveConnected?: boolean
  goalMaxUsd?: number
}

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]!
}

export function StepGoal({
  state,
  onChange,
  errors,
  liveWalletAddress,
  serverWalletAddress,
  isLiveConnected,
  goalMaxUsd,
}: Props) {
  const { t } = useTranslation('create')
  const goalMax = goalMaxUsd ?? CAMPAIGN_GOAL_MAX_USD_FALLBACK
  const isFromLiveWallet = tonAddressesMatch(liveWalletAddress, state.payoutAddress)
  const isFromServerWallet = !liveWalletAddress && tonAddressesMatch(serverWalletAddress, state.payoutAddress)
  const hasWalletMismatch = Boolean(liveWalletAddress && state.payoutAddress && !isFromLiveWallet)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">
          {t('goal.amountLabel')} <span className="text-[var(--tg-theme-hint-color,#8E8E93)] font-normal">({t('goal.amountCurrency')})</span>
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">$</span>
          <input
            type="text"
            value={state.goalAmount}
            onChange={(e) => onChange({ goalAmount: sanitizeIntegerInput(e.target.value) })}
            placeholder={t('goal.amountPlaceholder')}
            inputMode="numeric"
            pattern="[0-9]*"
            className="input-base"
            style={{ paddingLeft: '2rem' }}
          />
        </div>
        {errors.goalAmount ? (
          <p className="text-xs text-red-500">{errors.goalAmount}</p>
        ) : (
          <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">{Number.isFinite(goalMax)
              ? t('goal.amountHint', { max: goalMax.toLocaleString() })
              : t('goal.amountHintNoMax')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('goal.deadlineLabel')}</label>
        <input
          type="date"
          lang={i18n.language}
          value={state.deadline}
          onChange={(e) => onChange({ deadline: e.target.value })}
          min={addDays(3)}
          max={addDays(90)}
          className="input-base"
        />
        {errors.deadline ? (
          <p className="text-xs text-red-500">{errors.deadline}</p>
        ) : (
          <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">{t('goal.deadlineHint')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--tg-theme-text-color,#1C1C1E)]">{t('goal.payoutLabel')}</label>
        <input
          type="text"
          value={state.payoutAddress}
          onChange={(e) => onChange({ payoutAddress: e.target.value })}
          placeholder={t('goal.payoutPlaceholder')}
          className="input-base font-mono text-sm"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {errors.payoutAddress ? (
          <p className="text-xs text-red-500">{errors.payoutAddress}</p>
        ) : isFromLiveWallet ? (
          <p className="text-xs flex items-center gap-1" style={{ color: '#1F8A5B' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {t('goal.filledFromConnected')}
          </p>
        ) : isFromServerWallet ? (
          <p className="text-xs flex items-center gap-1" style={{ color: '#1F8A5B' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {t('goal.filledFromLinked')}
          </p>
        ) : hasWalletMismatch ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs leading-snug" style={{ color: '#FF9500' }}>
              {t('goal.mismatchWarning', { payout: shortTonAddress(state.payoutAddress), connected: shortTonAddress(liveWalletAddress!) })}
            </p>
            <button
              type="button"
              onClick={() => onChange({ payoutAddress: liveWalletAddress })}
              className="self-start text-xs font-semibold px-2.5 py-1.5 rounded-lg"
              style={{ color: 'var(--tg-brand-color)', background: 'rgba(var(--tg-brand-color-rgb),.08)' }}
            >
              {t('goal.useConnectedWallet')}
            </button>
          </div>
        ) : state.payoutAddress && serverWalletAddress && !isLiveConnected ? (
          <p className="text-xs leading-snug" style={{ color: '#D97706' }}>
            {t('goal.futureWithdrawalNote', { address: shortTonAddress(state.payoutAddress) })}
          </p>
        ) : null}
        {!errors.payoutAddress && <PayoutWalletKindNote address={state.payoutAddress} />}
      </div>

      <div className="bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] rounded-[14px] p-3.5 flex items-start gap-2.5">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 mt-0.5">
          <circle cx="9" cy="9" r="8" stroke="#8E8E93" strokeWidth="1.2" />
          <path d="M9 8v5M9 6v.5" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-[var(--tg-theme-hint-color,#8E8E93)] leading-relaxed">
          {t('goal.payoutInfo')}
        </p>
      </div>
    </div>
  )
}
