// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignDetail } from '../../api/campaigns'
import i18n from '../../i18n'
import { CampaignBottomBar } from './CampaignBottomBar'

const payoutAddress = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'
const otherWallet = 'EQBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBNTi'
const wallet = vi.hoisted(() => ({ address: '' }))

vi.mock('@tonconnect/ui-react', () => ({
  useTonAddress: () => wallet.address,
  useTonConnectUI: () => [{
    connected: true,
    wallet: { account: { address: wallet.address } },
    openModal: vi.fn(),
    disconnect: vi.fn(),
  }],
}))

const campaign: CampaignDetail = {
  id: 'campaign-1',
  title: 'Помощь семье',
  category: 'health',
  status: 'completed',
  displayStatus: 'completed',
  deployStatus: 'deployed',
  goalAmountUsd: 100,
  raisedAmountUsd: 100,
  trustScore: 60,
  donorCount: 2,
  deadline: '2026-08-01T00:00:00.000Z',
  photos: [],
  createdAt: '2026-07-16T00:00:00.000Z',
  organizerType: 'personal',
  isPublic: true,
  story: 'История кампании',
  raisedAmountToken: 100,
  goalToken: 100,
  viewCount: 10,
  payoutAddress,
  onchainAddress: payoutAddress,
  deployError: null,
  claimStatus: 'claimable',
  claimedAt: null,
  withdrawalTxHash: null,
  moderationNote: null,
  approvedAt: null,
  creator: {
    id: 'user-1',
    tgFirstName: 'Simple',
    tgUsername: 'simple',
    tgPhotoUrl: null,
  },
}

const refundEligibility = vi.fn()

vi.mock('../../api/donations', () => ({
  donationsApi: {
    refundEligibility: (...args: unknown[]) => refundEligibility(...args),
  },
}))

function renderBottomBar(
  overrides: Partial<CampaignDetail> = {},
  props: { isFrozen?: boolean; canClaim?: boolean; isCompleted?: boolean; isCreator?: boolean } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CampaignBottomBar
        campaign={{ ...campaign, ...overrides }}
        handleShare={vi.fn()}
        canDonate={false}
        setDonateOpen={vi.fn()}
        canClaim={props.canClaim ?? true}
        isCreator={props.isCreator ?? true}
        isDeployFailed={false}
        retryDeployPending={false}
        handleRetryDeploy={vi.fn()}
        retryError={null}
        isCompleted={props.isCompleted ?? true}
        bottomCompletedLabel="Завершена"
        bottomCompletedColor="#1F8A5B"
        isExpired={false}
        isFrozen={props.isFrozen ?? false}
        blockedDonationLabel="Недоступно"
      />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  wallet.address = payoutAddress
  await i18n.changeLanguage('ru')
})

afterEach(() => cleanup())

describe('CampaignBottomBar claim info', () => {
  it('shows share initially and hides it while claim info is open', () => {
    renderBottomBar()

    expect(screen.getByLabelText('Поделиться кампанией')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Забрать средства' }))

    expect(screen.queryByLabelText('Поделиться кампанией')).toBeNull()
    expect(screen.getByText(/Harmony не берёт плату за использование платформы/i)).toBeTruthy()
    expect(screen.getByText(/около 0\.05 GRAM/i)).toBeTruthy()
    expect(screen.queryByText(/удержит комиссию/i)).toBeNull()
    expect(screen.queryByText(/0\.15/)).toBeNull()
    expect(screen.getByText(/Отсутствие отчёта снизит Trust Score на 10/i)).toBeTruthy()
    expect(screen.getByText(/отклонение отчёта снизит Trust Score на 7/i)).toBeTruthy()
  })

  it('keeps channel campaigns penalty-free in the claim info', () => {
    renderBottomBar({ channelId: 'channel-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Забрать средства' }))

    expect(screen.getByText(/Штрафы за отсутствие или отклонение отчёта для кампаний, созданных от имени канала, не начисляются/i)).toBeTruthy()
  })
})

describe('CampaignBottomBar claim for the author and the payout wallet', () => {
  it('shows the button to a friend who holds the payout wallet but did not create the campaign', () => {
    renderBottomBar({}, { isCreator: false })

    expect(screen.getByRole('button', { name: 'Забрать средства' })).toBeTruthy()
  })

  it('keeps it for the author with another wallet connected and names the payout wallet', () => {
    wallet.address = otherWallet
    renderBottomBar({}, { isCreator: true })

    expect(screen.getByRole('button', { name: /Забрать|кошел/i })).toBeTruthy()
    expect(screen.getByText(/Нужен кошелёк выплат/)).toBeTruthy()
  })

  it('hides it from a visitor who is neither the author nor the payout wallet', () => {
    wallet.address = otherWallet
    renderBottomBar({}, { isCreator: false, isCompleted: true })

    expect(screen.queryByRole('button', { name: /Забрать|кошел/i })).toBeNull()
    expect(screen.getByText('Завершена')).toBeTruthy()
  })

  it('hides it from a visitor with no wallet connected', () => {
    wallet.address = ''
    renderBottomBar({}, { isCreator: false, isCompleted: true })

    expect(screen.queryByRole('button', { name: /Забрать|кошел/i })).toBeNull()
    expect(screen.getByText('Завершена')).toBeTruthy()
  })
})

describe('CampaignBottomBar refund on a frozen campaign', () => {
  const frozen = { status: 'frozen' as const, displayStatus: 'frozen' as const, claimStatus: 'unavailable' as const }
  const props = { isFrozen: true, canClaim: false, isCompleted: false }

  beforeEach(() => refundEligibility.mockReset())

  it('offers the donor his own money back, with the amount named on the button', async () => {
    refundEligibility.mockResolvedValue({
      eligible: true,
      reason: null,
      onchainAddress: payoutAddress,
      amountGram: 2.5,
      amountUsdt: 0,
      gasGram: '0.05',
    })

    renderBottomBar(frozen, props)

    const button = await screen.findByRole('button', { name: 'Вернуть мой донат (2.5 GRAM)' })
    fireEvent.click(button)

    expect(screen.getByText(/около 0\.05 GRAM/i)).toBeTruthy()
  })

  it('names the USDT leg and its larger gas when the donation had one', async () => {
    refundEligibility.mockResolvedValue({
      eligible: true,
      reason: null,
      onchainAddress: payoutAddress,
      amountGram: 1,
      amountUsdt: 10,
      gasGram: '0.1',
    })

    renderBottomBar(frozen, props)

    fireEvent.click(await screen.findByRole('button', { name: 'Вернуть мой донат (1 GRAM и 10 USDT)' }))
    expect(screen.getByText(/около 0\.1 GRAM/i)).toBeTruthy()
  })

  it('shows no refund button to a wallet that did not donate here', async () => {
    refundEligibility.mockResolvedValue({
      eligible: false,
      reason: 'no_donation',
      onchainAddress: payoutAddress,
      amountGram: 0,
      amountUsdt: 0,
      gasGram: null,
    })

    renderBottomBar(frozen, props)

    expect(await screen.findByText(/С этого кошелька донатов в эту кампанию не было/i)).toBeTruthy()
    expect(screen.getByText('Недоступно')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Вернуть мой донат/ })).toBeNull()
  })
})
