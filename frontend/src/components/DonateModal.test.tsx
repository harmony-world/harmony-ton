// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignDetail } from '../api/campaigns'
import i18n from '../i18n'
import { DonateModal } from './DonateModal'

vi.mock('@tonconnect/ui-react', () => ({
  useTonAddress: () => '',
  useTonConnectUI: () => [{ connected: false, wallet: null, openModal: vi.fn(), disconnect: vi.fn() }],
}))
vi.mock('../hooks/useApi', () => ({ useTonPrice: () => ({ data: undefined }) }))

const campaign = {
  id: 'camp-1',
  title: 'Подарок другу',
  onchainAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
  payoutAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
} as unknown as CampaignDetail

function renderModal(overrides: Partial<CampaignDetail> = {}) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <DonateModal campaign={{ ...campaign, ...overrides }} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ru')
})
afterEach(() => cleanup())

describe('DonateModal coins and the payout wallet', () => {
  it('offers USDT and Gram, USDT first, when the campaign accepts USDT', () => {
    renderModal({ acceptsUsdt: true })

    const coins = screen.getAllByRole('button').map((b) => b.textContent).filter((x) => x === '₮USDT' || x === 'GRAM')
    expect(coins).toEqual(['₮USDT', 'GRAM'])
    expect(screen.queryByText(/перевод USDT невозможен/)).toBeNull()
  })

  it('offers Gram only, and says why, when the payout wallet is Telegram’s built-in one', () => {
    renderModal({ acceptsUsdt: false })

    expect(screen.queryByRole('button', { name: /USDT/ })).toBeNull()
    expect(screen.getByRole('button', { name: /GRAM/ })).toBeTruthy()
    expect(screen.getByText(/перевод USDT невозможен/)).toBeTruthy()
  })

  it('keeps both coins when an older backend does not say', () => {
    renderModal()

    expect(screen.getByRole('button', { name: /USDT/ })).toBeTruthy()
  })
})
