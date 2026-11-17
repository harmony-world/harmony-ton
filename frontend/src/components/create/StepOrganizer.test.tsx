// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StepOrganizer } from './StepOrganizer'

function renderStepOrganizer(organizerType: 'telegram_channel' | 'personal' | 'organization' = 'telegram_channel') {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <StepOrganizer
        state={{
          organizerType,
          channelLink: '',
          channelAutopost: true,
          orgName: '',
          orgInn: '',
          orgDoc: null,
        }}
        onChange={vi.fn()}
        errors={{}}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => cleanup())

describe('StepOrganizer', () => {
  it('shows channel and personal options but hides organization option', () => {
    const { container } = renderStepOrganizer()
    const text = container.textContent ?? ''

    expect(text.indexOf('Telegram-канал')).toBeLessThan(text.indexOf('Личный сбор'))
    expect(text).toContain('trust score')
    expect(text).not.toContain('trust rating')
    expect(text).not.toContain('Организация / НКО')
  })

  it('still renders organization fields when state is forced to organization (preserves code for future)', () => {
    renderStepOrganizer('organization')

    expect(screen.getByText(/Верификация организаций и НКО появится позже/i)).toBeTruthy()
    expect(screen.getByLabelText('Название организации')).toBeTruthy()
    expect(screen.getByLabelText('ИНН')).toBeTruthy()
  })
})
