// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { PayoutWalletKindNote } from './PayoutWalletKindNote'

const kind = vi.hoisted(() => vi.fn())
vi.mock('../../api/wallets', () => ({ walletsApi: { kind } }))

const ADDRESS = 'EQDHo6P-imEpPwW_QhEdWZBXgz634bAXaat4kkLuTW7EZncr'

function renderNote(address: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PayoutWalletKindNote address={address} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  kind.mockReset()
  await i18n.changeLanguage('ru')
})
afterEach(() => cleanup())

describe('PayoutWalletKindNote', () => {
  it('warns that Telegram’s built-in wallet means Gram only', async () => {
    kind.mockResolvedValue({ kind: 'wallet_tg', acceptsUsdt: false })
    renderNote(ADDRESS)

    expect(await screen.findByText(/кошелёк «Деньги» в Telegram\. Он не показывает USDT/)).toBeTruthy()
    expect(kind).toHaveBeenCalledWith(ADDRESS)
  })

  it('gives the conditional note when the kind is not known yet', async () => {
    kind.mockResolvedValue({ kind: null, acceptsUsdt: true })
    renderNote(ADDRESS)

    expect(await screen.findByText(/Если это кошелёк «Деньги» в Telegram/)).toBeTruthy()
  })

  it('says nothing for any other wallet', async () => {
    kind.mockResolvedValue({ kind: 'other', acceptsUsdt: true })
    const { container } = renderNote(ADDRESS)

    await vi.waitFor(() => expect(kind).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('does not ask about something that is not an address', () => {
    renderNote('UQ-half-typed')

    expect(kind).not.toHaveBeenCalled()
  })
})
