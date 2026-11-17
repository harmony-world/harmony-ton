// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DonorStatusBadge } from './DonorStatusBadge'

afterEach(() => cleanup())

describe('DonorStatusBadge', () => {
  it('opens and closes the donor status modal', () => {
    render(<DonorStatusBadge totalUsd={200} />)

    fireEvent.click(screen.getByRole('button', { name: /статус донора: меценат/i }))
    const dialog = screen.getByRole('dialog', { name: /статусы донора/i })
    expect(dialog).toBeTruthy()
    expect(dialog.className).toContain('text-left')
    expect(screen.getByText(/от \$50 подтверждённых пожертвований/i)).toBeTruthy()
    expect(screen.getByText(/от \$1,000 подтверждённых пожертвований/i)).toBeTruthy()
    expect(screen.queryByText(/🌱|💡|🌳|🦅|🔥/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the modal from the backdrop and Escape key', () => {
    render(<DonorStatusBadge totalUsd={0} />)

    fireEvent.click(screen.getByRole('button', { name: /статус донора: росток/i }))
    fireEvent.click(screen.getByRole('presentation'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /статус донора: росток/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
