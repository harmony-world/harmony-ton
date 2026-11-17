// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { FeedPage } from './FeedPage'

const useCampaigns = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useApi', () => ({ useCampaigns }))
vi.mock('../components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }))
vi.mock('../components/feed/CampaignCard', () => ({ CampaignCard: ({ campaign }: { campaign: { title: string } }) => <div>{campaign.title}</div> }))

const campaign = { id: 'c-1', title: 'Сбор', status: 'active', displayStatus: 'active' }

function renderFeed() {
  return render(<MemoryRouter><FeedPage /></MemoryRouter>)
}

beforeEach(async () => {
  localStorage.clear()
  useCampaigns.mockReset()
  useCampaigns.mockReturnValue({ data: { data: [campaign], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() })
  await i18n.changeLanguage('ru')
})
afterEach(() => cleanup())

describe('FeedPage sort', () => {
  it('asks for the rating sort by default', () => {
    renderFeed()

    expect(useCampaigns).toHaveBeenLastCalledWith({ sort: 'trustScore' })
    fireEvent.click(screen.getByRole('button', { name: 'Сортировка' }))
    expect(screen.getByRole('menuitemradio', { name: 'По рейтингу автора' }).getAttribute('aria-checked')).toBe('true')
  })

  it('switches to newest first and remembers the choice', () => {
    renderFeed()
    fireEvent.click(screen.getByRole('button', { name: 'Сортировка' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Сначала новые' }))

    expect(useCampaigns).toHaveBeenLastCalledWith({ sort: 'createdAt' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(localStorage.getItem('harmony.feedSort')).toBe('createdAt')

    cleanup()
    renderFeed()
    expect(useCampaigns).toHaveBeenLastCalledWith({ sort: 'createdAt' })
  })
})
