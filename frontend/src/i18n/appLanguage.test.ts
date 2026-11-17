// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { appLanguage } from './index'

describe('appLanguage', () => {
  it('keeps the three app languages, with or without a region', () => {
    expect(appLanguage('ru')).toBe('ru')
    expect(appLanguage('en-US')).toBe('en')
    expect(appLanguage('hi_IN')).toBe('hi')
  })

  it('gives English to any other language, so the API never gets an unsupported lang', () => {
    expect(appLanguage('de')).toBe('en')
    expect(appLanguage('es-ES')).toBe('en')
  })

  it('keeps Russian when there is no language at all, like the backend', () => {
    expect(appLanguage(undefined)).toBe('ru')
    expect(appLanguage('')).toBe('ru')
  })
})
