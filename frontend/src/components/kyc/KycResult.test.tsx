// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { KycResult } from './KycResult'

afterEach(() => cleanup())

describe('KycResult', () => {
  it('shows duplicate KYC rejection as an error and opens the in-app support form', () => {
    render(
      <MemoryRouter initialEntries={['/kyc/level/2']}>
        <Routes>
          <Route
            path="/kyc/level/2"
            element={(
              <KycResult
                status="rejected"
                rejection={{
                  type: 'duplicate',
                  message: 'Этот документ уже использован для другого аккаунта.',
                  labels: ['DUPLICATE_DOCUMENT'],
                }}
              />
            )}
          />
          <Route path="/profile/support" element={<div>support form</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Ошибка' })).toBeTruthy()
    expect(screen.queryByText('Нужна поддержка')).toBeNull()
    expect(screen.getByText('Этот документ уже использован для другого аккаунта.')).toBeTruthy()

    const supportLink = screen.getByRole('link', { name: 'Связаться с поддержкой' })
    expect(supportLink.getAttribute('href')).toBe('/profile/support')

    fireEvent.click(supportLink)
    expect(screen.getByText('support form')).toBeTruthy()
  })
})
