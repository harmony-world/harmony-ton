import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildGramDonationTransaction, buildUsdtDonationTransaction } from './donationTransaction'

vi.mock('./env', () => ({ TON_CONNECT_NETWORK: '-3', IS_TESTNET: true }))

const TON_CONNECT_NETWORK = '-3'

describe('donation transaction requests', () => {
  const testnetAddress = 'kQBpAbGEmFT4TDmxHdZKtLlYuPVJw-Q8C3vZW8G1vnwfsKHt'
  const nonBounceableTestnetAddress = '0QBpAbGEmFT4TDmxHdZKtLlYuPVJw-Q8C3vZW8G1vnwfsPwo'

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-13T09:45:00.000Z'))
  })

  it('includes explicit network without a top-level sender for GRAM donations', () => {
    const request = buildGramDonationTransaction(
      nonBounceableTestnetAddress,
      '1000000000',
      99,
    )

    expect(request).toMatchObject({
      validUntil: 1783936200,
      network: TON_CONNECT_NETWORK,
      messages: [{ address: testnetAddress, amount: '1000000000' }],
    })
    expect(request).not.toHaveProperty('from')
    expect(request.messages[0]?.payload).toEqual(expect.any(String))
  })

  it('includes explicit network without a top-level sender for USDT jetton donations', () => {
    const request = buildUsdtDonationTransaction(nonBounceableTestnetAddress, 'payload')

    expect(request).toEqual({
      validUntil: 1783936200,
      network: TON_CONNECT_NETWORK,
      messages: [{
        address: testnetAddress,
        amount: '100000000',
        payload: 'payload',
      }],
    })
    expect(request).not.toHaveProperty('from')
  })
})
