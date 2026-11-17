// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TrustBadge } from './TrustBadge'
import { getTrustScoreZone } from './trustScore'

afterEach(() => cleanup())

describe('TrustBadge', () => {
  it('maps zone boundaries correctly', () => {
    expect(getTrustScoreZone(30)).toBe('red')
    expect(getTrustScoreZone(31)).toBe('gray')
    expect(getTrustScoreZone(70)).toBe('green')
  })

  it('opens and closes the Trust Score modal', () => {
    render(<TrustBadge score={70} />)

    fireEvent.click(screen.getByRole('button', { name: /trust score 70/i }))
    const dialog = screen.getByRole('dialog', { name: /высокий уровень доверия/i })
    expect(dialog).toBeTruthy()
    expect(dialog.className).toContain('text-left')

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the modal from the backdrop and Escape key', () => {
    render(<TrustBadge score={31} />)

    fireEvent.click(screen.getByRole('button', { name: /trust score 31/i }))
    fireEvent.click(screen.getByRole('presentation'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /trust score 31/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
