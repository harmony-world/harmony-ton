import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('frontend CSP', () => {
  it('allows Telegram avatar source and redirect hosts', () => {
    const html = readFileSync(resolve(here, '../../index.html'), 'utf8')

    expect(html).toContain('https://t.me')
    expect(html).toContain('https://*.t.me')
    expect(html).toContain('https://telegram.me')
    expect(html).toContain('https://*.telegram.me')
    expect(html).toContain('https://*.telesco.pe')
  })
})
