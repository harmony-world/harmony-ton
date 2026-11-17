// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { CampaignRejectedPage } from './CampaignRejectedPage'

afterEach(() => cleanup())

describe('CampaignRejectedPage', () => {
  it('shows support appeal and opens the support page from the appeal link', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/campaign-rejected',
            state: { message: 'Кампания не прошла автоматическую проверку.' },
          },
        ]}
      >
        <Routes>
          <Route path="/campaign-rejected" element={<CampaignRejectedPage />} />
          <Route path="/profile/support" element={<div>support route</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText(/если вы считаете/i)).toBeTruthy()

    const supportLink = screen.getByRole('link', { name: 'оставить обращение в службу технической поддержки' })
    expect(supportLink.getAttribute('href')).toBe('/profile/support')
    expect(supportLink.parentElement?.textContent?.trim()).not.toMatch(/\.$/)

    fireEvent.click(supportLink)
    expect(screen.getByText('support route')).toBeTruthy()
  })
})
