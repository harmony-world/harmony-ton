import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REQUIRED_BRIDGES = {
  telegram: 'https://tonbridge.telegram.org',
  gramwallet: 'https://tonconnectbridge.mytonwallet.org',
  tonkeeper: 'https://bridge.tonapi.io',
  'telegram-wallet (Walt)': 'https://walletbot.me',
  tonhub: 'https://connect.tonhubapi.com',
}

function connectSrc(): string[] {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
  const directive = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src')) ?? ''
  return directive.split(/\s+/).slice(1)
}

describe('CSP connect-src allows TON Connect wallet bridges', () => {
  it.each(Object.entries(REQUIRED_BRIDGES))('%s bridge %s', (_wallet, bridge) => {
    expect(connectSrc()).toContain(bridge)
  })
})
