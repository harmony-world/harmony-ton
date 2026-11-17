import { useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'
import type { CampaignDetail } from '../../api/campaigns'
import { ClaimButton } from '../ClaimButton'
import { RefundButton } from '../RefundButton'
import { tonAddressesMatch } from '../../utils/tonAddress'

interface CampaignBottomBarProps {
  campaign: CampaignDetail
  handleShare: () => void
  canDonate: boolean
  setDonateOpen: Dispatch<SetStateAction<boolean>>
  canClaim: boolean
  isCreator: boolean
  isDeployFailed: boolean
  retryDeployPending: boolean
  handleRetryDeploy: () => void
  retryError: string | null
  isCompleted: boolean
  bottomCompletedLabel: string
  bottomCompletedColor: string
  isExpired: boolean
  isFrozen: boolean
  blockedDonationLabel: string
}

export function CampaignBottomBar({
  campaign,
  handleShare,
  canDonate,
  setDonateOpen,
  canClaim,
  isCreator,
  isDeployFailed,
  retryDeployPending,
  handleRetryDeploy,
  retryError,
  isCompleted,
  bottomCompletedLabel,
  bottomCompletedColor,
  isExpired,
  isFrozen,
  blockedDonationLabel,
}: CampaignBottomBarProps) {
  const { t } = useTranslation('campaign')
  const [claimInfoOpen, setClaimInfoOpen] = useState(false)
  const [tonConnectUI] = useTonConnectUI()
  const connectedAddress = useTonAddress() || tonConnectUI.wallet?.account.address || ''
  const isPayoutWallet = tonAddressesMatch(connectedAddress, campaign.payoutAddress)

  return (
    <>
      <div
        className="flex items-center gap-2.5 px-4 flex-shrink-0"
        style={{
          paddingTop: 12,
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px), 16px)',
          borderTop: '1px solid var(--tg-theme-secondary-bg-color, rgba(60,60,67,.08))',
          background: 'var(--tg-theme-bg-color, #fff)',
        }}
      >
        {!claimInfoOpen && (
          <button
            type="button"
            onClick={handleShare}
            aria-label={t('shareBtn')}
            className="shrink-0 flex items-center justify-center active:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-link-color,#007AFF)] focus:ring-offset-2"
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: '1.5px solid var(--tg-theme-secondary-bg-color, #E5E5EA)',
              background: 'var(--tg-theme-bg-color, #fff)',
            }}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--tg-theme-text-color, #1C1C1E)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15V4M8.5 7.5L12 4l3.5 3.5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
            </svg>
          </button>
        )}
        {canDonate ? (
          <button
            onClick={() => setDonateOpen(true)}
            className="flex-1 text-white font-semibold active:opacity-80 transition-opacity"
            style={{ height: 52, borderRadius: 14, background: 'var(--tg-brand-color)', fontSize: 17, border: 'none', cursor: 'pointer' }}
          >
            {t('donateBtn')}
          </button>
        ) : canClaim && (isCreator || isPayoutWallet) && campaign.onchainAddress ? (
          <ClaimButton
            campaignId={campaign.id}
            onchainAddress={campaign.onchainAddress}
            payoutAddress={campaign.payoutAddress}
            isPublic={campaign.isPublic}
            channelId={campaign.channelId}
            raisedAmountUsd={campaign.raisedAmountUsd}
            onConfirmStateChange={setClaimInfoOpen}
            completedLabel={bottomCompletedLabel}
            completedColor={bottomCompletedColor}
          />
        ) : isDeployFailed && isCreator ? (
          <div className="flex-1 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleRetryDeploy}
              disabled={retryDeployPending}
              className="w-full text-white font-semibold active:opacity-80 transition-opacity disabled:opacity-60"
              style={{ height: 52, borderRadius: 14, background: 'var(--tg-brand-color)', fontSize: 17, border: 'none', cursor: retryDeployPending ? 'default' : 'pointer' }}
            >
              {retryDeployPending ? t('retryingDeploy') : t('retryDeploy')}
            </button>
            {retryError && (
              <div className="text-[12px] font-medium px-1" style={{ color: '#D64545' }}>
                {retryError}
              </div>
            )}
          </div>
        ) : isCompleted ? (
          <div
            className="flex-1 flex items-center justify-center font-semibold"
            style={{ height: 52, borderRadius: 14, background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)', fontSize: 17, color: bottomCompletedColor }}
          >
            {bottomCompletedLabel}
          </div>
        ) : isExpired ? (
          <div
            className="flex-1 flex items-center justify-center font-semibold"
            style={{ height: 52, borderRadius: 14, background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)', fontSize: 17, color: campaign.displayStatus === 'expired_no_donations' ? '#8E8E93' : '#FF9500' }}
          >
            {campaign.displayStatus === 'expired_no_donations' ? t('expiredNoDonations') : t('expiredPartial')}
          </div>
        ) : isFrozen && campaign.onchainAddress ? (
          <RefundButton
            campaignId={campaign.id}
            onchainAddress={campaign.onchainAddress}
            blockedLabel={blockedDonationLabel}
          />
        ) : (
          <div
            className="flex-1 flex items-center justify-center font-semibold"
            style={{ height: 52, borderRadius: 14, background: 'var(--tg-theme-secondary-bg-color, #F2F2F7)', fontSize: 17, color: 'var(--tg-theme-hint-color, #8E8E93)' }}
          >
            {blockedDonationLabel}
          </div>
        )}
      </div>
    </>
  )
}
