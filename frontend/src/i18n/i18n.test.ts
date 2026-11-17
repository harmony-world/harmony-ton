import { describe, expect, it } from 'vitest'
import i18n from './index'

const LOCALES = ['ru', 'en', 'hi'] as const
const NAMESPACES = ['common', 'feed', 'create', 'campaign', 'profile', 'wallet', 'support', 'kyc'] as const

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
}

describe('frontend i18n resources', () => {
  it('keeps ru/en/hi namespaces key-compatible', () => {
    for (const ns of NAMESPACES) {
      const reference = flattenKeys(i18n.getResourceBundle('ru', ns)).sort()
      for (const locale of LOCALES) {
        expect(flattenKeys(i18n.getResourceBundle(locale, ns)).sort(), `${locale}/${ns}`).toEqual(reference)
      }
    }
  })

  it('has no empty translation strings', () => {
    for (const locale of LOCALES) {
      for (const ns of NAMESPACES) {
        const bundle = i18n.getResourceBundle(locale, ns)
        for (const key of flattenKeys(bundle)) {
          expect(i18n.t(`${ns}:${key}`, { lng: locale }), `${locale}/${ns}:${key}`).not.toBe('')
        }
      }
    }
  })
})
