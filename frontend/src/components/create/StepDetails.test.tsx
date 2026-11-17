// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StepDetails } from './StepDetails'

function renderStep() {
  return render(
    <StepDetails
      state={{ title: 'Тест', category: 'other', story: 'История', photos: [], photosIllustrative: null }}
      organizerType="person"
      isPublic={true}
      onIsPublicChange={vi.fn()}
      onChange={vi.fn()}
      errors={{}}
    />,
  )
}

describe('StepDetails', () => {
  it('keeps every sr-only control inside a positioned ancestor', () => {
    const { container } = renderStep()

    const srOnly = [...container.querySelectorAll('.sr-only')]
    expect(srOnly.length).toBeGreaterThan(0)

    for (const el of srOnly) {
      const positioned = el.parentElement?.closest('.relative, .absolute, .fixed, .sticky')
      expect(positioned, `sr-only control has no positioned ancestor: ${el.outerHTML.slice(0, 120)}`).toBeTruthy()
      expect(container.contains(positioned!)).toBe(true)
    }
  })

  it('renders the visibility toggle as a checkbox reflecting isPublic', () => {
    const { container } = renderStep()

    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"].sr-only')
    expect(toggle).toBeTruthy()
    expect(toggle!.checked).toBe(false)
  })
})
