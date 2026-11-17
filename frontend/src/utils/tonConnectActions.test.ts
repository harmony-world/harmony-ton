import { describe, expect, it } from 'vitest'
import type { EmbeddedSendTransactionResponse } from '@tonconnect/ui'
import { normalizeEmbeddedTransactionResult } from './tonConnectActions'

describe('normalizeEmbeddedTransactionResult', () => {
  it('returns sent outcome when wallet returns a response', () => {
    const outcome = normalizeEmbeddedTransactionResult({
      hasResponse: true,
      response: { boc: 'te6ccgEBAQEAAgAAAA==' },
    } as EmbeddedSendTransactionResponse)

    expect(outcome).toEqual({
      status: 'sent',
      response: { boc: 'te6ccgEBAQEAAgAAAA==' },
    })
  })

  it('preserves dispatched flag when wallet does not return a response', () => {
    const outcome = normalizeEmbeddedTransactionResult({
      hasResponse: false,
      connectResult: { dispatched: true },
    } as EmbeddedSendTransactionResponse)

    expect(outcome).toEqual({
      status: 'no-response',
      dispatched: true,
    })
  })
})
