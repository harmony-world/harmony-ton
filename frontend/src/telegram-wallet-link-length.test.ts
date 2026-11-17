import { encodeTelegramUrlParameters } from '@tonconnect/sdk'
import { describe, expect, it } from 'vitest'

const TELEGRAM_STARTAPP_LIMIT = 512
const MANIFEST_URLS = [
  'https://app.harmonymarket.click/tonconnect-manifest.json',
  'https://ton.harmonymarket.click/tonconnect-manifest.json',
]

function startapp(manifestUrl: string, tonProofPayload: string): string {
  const request = {
    manifestUrl,
    items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: tonProofPayload }],
  }
  const url = new URL('about:blank')
  url.searchParams.append('v', '2')
  url.searchParams.append('id', 'f'.repeat(64))
  url.searchParams.append('trace_id', '01234567-89ab-7def-8123-456789abcdef')
  url.searchParams.append('r', JSON.stringify(request))
  return 'tonconnect-' + encodeTelegramUrlParameters(url.search.slice(1))
}

describe('Telegram wallet connect link fits startapp', () => {
  const payload = 'a'.repeat(32)

  it.each(MANIFEST_URLS)('%s with ton_proof', (manifestUrl) => {
    const value = startapp(manifestUrl, payload)
    expect(value).toMatch(/^[\w-]+$/)
    expect(value.length).toBeLessThanOrEqual(TELEGRAM_STARTAPP_LIMIT)
  })

  it('the old payload did not fit — the check catches it', () => {
    const old = `harmony-wallet-bind:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}:${'A'.repeat(43)}`
    expect(startapp(MANIFEST_URLS[0] as string, old).length).toBeGreaterThan(TELEGRAM_STARTAPP_LIMIT)
  })
})
