// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { TermsGate } from './TermsGate'

const useProfile = vi.hoisted(() => vi.fn())
const acceptTerms = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useApi', () => ({ useProfile }))
vi.mock('../../api/users', () => ({ usersApi: { acceptTerms } }))

const CURRENT = '2026-11-12'

function profileWith(acceptedVersion: string | null) {
  return { id: 'u1', terms: { currentVersion: CURRENT, acceptedVersion, acceptedAt: null } }
}

function renderGate() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <TermsGate><p>app content</p></TermsGate>
    </QueryClientProvider>,
  )
}

describe('TermsGate', () => {
  beforeEach(() => {
    void i18n.changeLanguage('ru')
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('holds the app back until the current version is accepted', () => {
    useProfile.mockReturnValue({ data: profileWith(null), isLoading: false })
    renderGate()
    expect(screen.queryByText('app content')).toBeNull()
    expect(screen.getByRole('button', { name: 'Принимаю' })).toHaveProperty('disabled', true)
  })

  it('asks again when an older version was accepted', () => {
    useProfile.mockReturnValue({ data: profileWith('2026-01-01'), isLoading: false })
    renderGate()
    expect(screen.queryByText('app content')).toBeNull()
  })

  it('lets the app through once the current version is accepted', () => {
    useProfile.mockReturnValue({ data: profileWith(CURRENT), isLoading: false })
    renderGate()
    expect(screen.getByText('app content')).toBeTruthy()
  })

  it('does not lock people out when the profile cannot be loaded', () => {
    useProfile.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderGate()
    expect(screen.getByText('app content')).toBeTruthy()
  })

  it('sends the version it showed, and only after the box is ticked', async () => {
    useProfile.mockReturnValue({ data: profileWith(null), isLoading: false })
    acceptTerms.mockResolvedValue({ currentVersion: CURRENT, acceptedVersion: CURRENT, acceptedAt: '2026-11-12T14:00:00.000Z' })
    renderGate()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Принимаю' }))
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledWith(CURRENT))
  })

  it('opens the documents from the consent screen', () => {
    useProfile.mockReturnValue({ data: profileWith(null), isLoading: false })
    renderGate()
    fireEvent.click(screen.getByRole('button', { name: 'Пользовательское соглашение' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Пользовательское соглашение HARMONY' })).toBeTruthy()
  })
})
