import { describe, expect, it } from 'vitest'
import { requireProductionEnv } from './env'

describe('requireProductionEnv', () => {
  it('fails closed for missing production values', () => {
    expect(() => requireProductionEnv('VITE_API_URL', undefined, true)).toThrow(
      'VITE_API_URL is required for production builds',
    )
  })

  it('keeps localhost fallback in development only', () => {
    expect(requireProductionEnv('VITE_API_URL', undefined, false)).toBe('http://localhost:3000')
  })
})
