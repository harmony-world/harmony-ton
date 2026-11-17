import type { CampaignDetail } from '../api/campaigns'

export type ModalState = 'idle' | 'loading' | 'pending' | 'success' | 'error'
export type DonationCoin = 'GRAM' | 'USDT'

export interface DonateModalProps {
  campaign: CampaignDetail
  onClose: () => void
  onDonationSubmitted?: () => void
  donationConfirmed?: boolean
}

export const PRESETS: Record<DonationCoin, number[]> = {
  GRAM: [1, 5, 10, 50],
  USDT: [5, 10, 25, 100],
}

export const USDT_MASTER = import.meta.env.VITE_USDT_MASTER_ADDRESS as string | undefined
export const BG = 'var(--tg-theme-bg-color, #fff)'
export const TEXT = 'var(--tg-theme-text-color, #1C1C1E)'
export const HINT = 'var(--tg-theme-hint-color, #8E8E93)'
export const SEC_BG = 'var(--tg-theme-secondary-bg-color, #F2F2F7)'
