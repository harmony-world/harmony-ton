// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { StepPreview } from './StepPreview'

describe('StepPreview', () => {
  it('renders campaign text as escaped React text, not HTML', () => {
    const { container } = render(
      <StepPreview
        data={{
          title: '<img src=x onerror=alert(1)>',
          category: 'education',
          story: '<script>alert(1)</script>',
          photos: [],
          goalAmount: '100',
          deadline: '2026-08-09',
          payoutAddress: '',
          organizerType: 'telegram_channel',
          channelLink: 'https://t.me/harmony',
          orgName: '',
          isPublic: true,
        }}
        isSubmitting={false}
        apiError={null}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
  })

  it('formats the deadline in the interface language', async () => {
    await i18n.changeLanguage('en')
    const { container } = render(
      <StepPreview
        data={{
          title: 'Garden beds',
          category: 'project',
          story: 'Story',
          photos: [],
          goalAmount: '100',
          deadline: '2026-08-09',
          payoutAddress: '',
          organizerType: 'personal',
          channelLink: '',
          orgName: '',
          isPublic: true,
        }}
        isSubmitting={false}
        apiError={null}
        onSubmit={vi.fn()}
      />,
    )

    expect(container.textContent).toContain('August 9, 2026')
    await i18n.changeLanguage('ru')
  })
})
