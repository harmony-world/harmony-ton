// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { DonationCampaignCard, ProfileCampaignCard } from './ProfileActivityCards'
import type { UserCampaign, UserDonation } from '../../api/users'

const privateCampaign: UserCampaign = {
  id: 'camp-private',
  title: 'Приватный сбор',
  story: 'Сбор по ссылке.',
  category: 'birthday',
  status: 'active',
  displayStatus: 'active',
  deployStatus: 'deployed',
  onchainAddress: 'kQPrivate',
  goalAmountUsd: 100,
  raisedAmountUsd: 25,
  donorCount: 2,
  deadline: '2026-08-01T00:00:00.000Z',
  photos: [],
  isPublic: false,
  createdAt: '2026-07-14T00:00:00.000Z',
}

afterEach(() => cleanup())

describe('ProfileActivityCards', () => {
  it('shows aggregate progress for non-public campaign cards', () => {
    render(
      <MemoryRouter>
        <ProfileCampaignCard campaign={privateCampaign} />
      </MemoryRouter>,
    )

    expect(screen.getAllByText('$25').length).toBeGreaterThan(0)
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0)
  })

  it('masks only the user donation amount for non-public donation cards', () => {
    const donation: UserDonation = {
      id: 'don-private',
      campaignId: privateCampaign.id,
      campaign: privateCampaign,
      campaignTitle: privateCampaign.title,
      isAnonymous: false,
      donorAddress: 'wallet',
      amount: null,
      amountUsd: null,
      amountHidden: true,
      currency: 'GRAM',
      txHash: 'tx-private',
      createdAt: '2026-07-14T00:00:00.000Z',
    }

    render(
      <MemoryRouter>
        <DonationCampaignCard donation={donation} />
      </MemoryRouter>,
    )

    expect(screen.getByText('$25')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('***')).toBeTruthy()
  })
})
