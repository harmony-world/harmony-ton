// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ profileError: false, listError: false }))

vi.mock('../hooks/useApi', () => ({
  useProfile: () =>
    state.profileError
      ? { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
      : { data: { id: 'u1', kycLevel: 1, kycStatus: 'approved' }, isLoading: false, isError: false, refetch: vi.fn() },
  usePublicProfile: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetEmojiStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useSetProfilePrivacy: () => ({ mutate: vi.fn(), isPending: false }),
  useUserCampaigns: () => ({ data: undefined, isLoading: false, isError: state.listError, refetch: vi.fn() }),
  useUserDonations: () => ({ data: undefined, isLoading: false, isError: state.listError, refetch: vi.fn() }),
}))

vi.mock('../api/kyc', () => ({
  kycApi: { getStatus: () => Promise.reject(new Error('down')) },
}))

afterEach(() => {
  cleanup()
  state.profileError = false
  state.listError = false
})

function renderPage(page: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('profile pages when the API fails', () => {
  it('ProfilePage shows an error with retry instead of KYC 0', async () => {
    state.profileError = true
    const { ProfilePage } = await import('./ProfilePage')
    const { container } = renderPage(<ProfilePage />)

    expect(screen.getByText('Не удалось загрузить профиль')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
    expect(container.textContent ?? '').not.toContain('KYC 0')
  })

  it('ProfilePage shows an error when only the campaign list fails', async () => {
    state.listError = true
    const { ProfilePage } = await import('./ProfilePage')
    renderPage(<ProfilePage />)

    expect(screen.getByText('Не удалось загрузить профиль')).toBeTruthy()
  })

  it('ProfilePage renders normally when the API answers', async () => {
    const { ProfilePage } = await import('./ProfilePage')
    renderPage(<ProfilePage />)

    expect(screen.queryByText('Не удалось загрузить профиль')).toBeNull()
  })

  it('donations page does not claim "no donations" when the request failed', async () => {
    state.listError = true
    const { ProfileDonationsPage } = await import('./ProfileSubpages')
    renderPage(<ProfileDonationsPage />)

    expect(screen.getByText('Не удалось загрузить профиль')).toBeTruthy()
  })

  it('verification page shows an error when the KYC status request fails', async () => {
    const { ProfileVerificationPage } = await import('./ProfileSubpages')
    renderPage(<ProfileVerificationPage />)

    expect(await screen.findByText('Не удалось загрузить профиль')).toBeTruthy()
  })
})
