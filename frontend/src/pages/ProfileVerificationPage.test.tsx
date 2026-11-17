// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KYC_LEVELS } from '../constants/kycLevels'

const kycStatusResponse = {
  status: 'approved',
  kycLevel: 2,
  provider: 'mock',
  verifiedAt: null,
  applicantId: null,
  currentLevel: KYC_LEVELS[2],
  nextLevel: KYC_LEVELS[3],
  levels: KYC_LEVELS,
  kyc4Eligibility: null,
  rejection: null,
}

vi.mock('../hooks/useApi', () => ({
  useProfile: () => ({ data: { id: 'u1', kycLevel: 2, kycStatus: 'approved' }, isLoading: false }),
  usePublicProfile: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetEmojiStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useSetProfilePrivacy: () => ({ mutate: vi.fn(), isPending: false }),
  useUserCampaigns: () => ({ data: [], isLoading: false }),
  useUserDonations: () => ({ data: [], isLoading: false }),
}))

vi.mock('../api/kyc', () => ({
  kycApi: { getStatus: () => Promise.resolve(kycStatusResponse) },
}))

afterEach(() => cleanup())

async function renderVerificationPage() {
  const { ProfileVerificationPage } = await import('./ProfileSubpages')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/profile/verification']}>
        <ProfileVerificationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(screen.getByText('Уровни KYC')).toBeTruthy())
  return container
}

describe('ProfileVerificationPage — hidden KYC levels', () => {
  it('renders only KYC 0-2 even when the API returns levels 3-5', async () => {
    const container = await renderVerificationPage()
    const text = container.textContent ?? ''

    expect(text).toContain('KYC 2')
    expect(text).not.toContain('KYC 3')
    expect(text).not.toContain('KYC 4')
    expect(text).not.toContain('KYC 5')
    expect(text).not.toContain('Recipient+')
    expect(text).not.toContain('Full KYC')
  })

  it('exposes no link to a hidden verification flow', async () => {
    await renderVerificationPage()

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs).not.toContain('/kyc/level/3')
    expect(hrefs).not.toContain('/kyc/level/4')
    expect(hrefs).not.toContain('/kyc/level/5')
  })

  it('hides the Trust Score section that describes KYC 3+', async () => {
    const container = await renderVerificationPage()

    expect(screen.queryByText('Trust Score')).toBeNull()
    expect(container.textContent ?? '').not.toContain('Trust Score')
  })

  it('offers no next-level action at the KYC 2 ceiling', async () => {
    await renderVerificationPage()

    expect(screen.getByText('Максимальная личная верификация')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Создать кампанию' })).toBeTruthy()
  })
})
