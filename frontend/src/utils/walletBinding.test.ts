import { describe, expect, it } from 'vitest'
import { walletBindingBody, type TonConnectWalletForBinding } from './walletBinding'

const proof = {
  timestamp: 1,
  domain: { value: 'ton.harmonymarket.click' },
  signature: 'signature',
  payload: 'challenge',
}

describe('walletBindingBody', () => {
  it('includes ton_proof and state init when wallet provides both', () => {
    const wallet: TonConnectWalletForBinding = {
      account: { address: '0:abc', walletStateInit: 'state-init' },
      connectItems: { tonProof: { proof } },
    }

    expect(walletBindingBody('0:abc', wallet)).toEqual({
      walletAddress: '0:abc',
      walletStateInit: 'state-init',
      proof,
    })
  })

  it('does not send partial proof payloads', () => {
    const wallet: TonConnectWalletForBinding = {
      account: { address: '0:abc' },
      connectItems: { tonProof: { proof } },
    }

    expect(walletBindingBody('0:abc', wallet)).toEqual({ walletAddress: '0:abc' })
  })
})
