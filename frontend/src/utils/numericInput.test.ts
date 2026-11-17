import { describe, expect, it } from 'vitest'
import { sanitizeDecimalInput, sanitizeIntegerInput } from './numericInput'

describe('sanitizeIntegerInput', () => {
  it('keeps digits and drops everything else', () => {
    expect(sanitizeIntegerInput('100')).toBe('100')
    expect(sanitizeIntegerInput('1 0 0$')).toBe('100')
    expect(sanitizeIntegerInput('100.5')).toBe('1005')
    expect(sanitizeIntegerInput('-100')).toBe('100')
    expect(sanitizeIntegerInput('e')).toBe('')
  })
})

describe('sanitizeDecimalInput', () => {
  it('keeps a single decimal separator', () => {
    expect(sanitizeDecimalInput('12.5')).toBe('12.5')
    expect(sanitizeDecimalInput('12,5')).toBe('12.5')
    expect(sanitizeDecimalInput('12.5.7')).toBe('12.57')
    expect(sanitizeDecimalInput('1e5')).toBe('15')
  })

  it('keeps a trailing separator so a decimal can still be typed', () => {
    expect(sanitizeDecimalInput('0.')).toBe('0.')
    expect(sanitizeDecimalInput('.')).toBe('.')
  })
})
