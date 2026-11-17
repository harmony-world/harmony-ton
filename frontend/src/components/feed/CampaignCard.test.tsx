// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { CampaignListItem } from '../../api/campaigns'
import { CampaignCard } from './CampaignCard'

const campaign: CampaignListItem = {
  id: 'camp-1',
  title: 'Помощь семье',
  category: 'health',
  status: 'active',
  displayStatus: 'active',
  deployStatus: 'deployed',
  goalAmountUsd: 100,
  raisedAmountUsd: 25,
  trustScore: 60,
  donorCount: 2,
  deadline: '2026-08-01T00:00:00.000Z',
  photos: ['https://example.com/photo.jpg'],
  createdAt: '2026-07-16T00:00:00.000Z',
  organizerType: 'personal',
  isPublic: true,
  creator: {
    id: 'user-1',
    tgFirstName: 'Simple',
    tgUsername: 'simple',
    tgPhotoUrl: null,
  },
}

afterEach(() => cleanup())

describe('CampaignCard', () => {
  it('shows Trust Score only near the creator, not as a duplicate photo overlay', () => {
    render(
      <MemoryRouter>
        <CampaignCard campaign={campaign} />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('button', { name: /trust score 60/i })).toHaveLength(1)
  })

  it('switches feed photos when swiping over the photo badge area', () => {
    render(
      <MemoryRouter>
        <CampaignCard campaign={{ ...campaign, photos: ['https://example.com/first.jpg', 'https://example.com/second.jpg'] }} />
      </MemoryRouter>,
    )

    const photoArea = screen.getByLabelText('Фото кампании')
    expect(screen.getByAltText(campaign.title).getAttribute('src')).toBe('https://example.com/first.jpg')

    fireEvent.touchStart(photoArea, { touches: [{ clientX: 260 }] })
    fireEvent.touchEnd(photoArea, { changedTouches: [{ clientX: 150 }] })

    expect(screen.getByAltText(campaign.title).getAttribute('src')).toBe('https://example.com/second.jpg')
    expect(screen.getByText('2/2')).toBeTruthy()
  })

  it('marks illustrative photos on the feed card, and only when the flag is set', () => {
    render(
      <MemoryRouter>
        <CampaignCard campaign={{ ...campaign, photosIllustrative: true }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Фото иллюстративное')).toBeTruthy()

    cleanup()
    render(
      <MemoryRouter>
        <CampaignCard campaign={campaign} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Фото иллюстративное')).toBeNull()
  })

  it('keeps the illustrative badge off photoless cards', () => {
    render(
      <MemoryRouter>
        <CampaignCard campaign={{ ...campaign, photos: [], photosIllustrative: true }} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Фото иллюстративное')).toBeNull()
  })
})
