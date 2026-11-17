import type { SendTransactionRequest, SendTransactionResponse } from '@tonconnect/sdk'
import type { EmbeddedSendTransactionResponse, TonConnectUI } from '@tonconnect/ui'
import i18n from '../i18n'

export type TonConnectTransactionOutcome =
  | { status: 'sent'; response: SendTransactionResponse }
  | { status: 'no-response'; dispatched: boolean }

export class TonConnectNoResponseError extends Error {
  readonly dispatched: boolean

  constructor(dispatched: boolean) {
    super(dispatched
      ? i18n.t('common:tonConnect.noResponseDispatched')
      : i18n.t('common:tonConnect.noResponseConnected'))
    this.name = 'TonConnectNoResponseError'
    this.dispatched = dispatched
  }
}

export function normalizeEmbeddedTransactionResult(
  result: EmbeddedSendTransactionResponse,
): TonConnectTransactionOutcome {
  if (result.hasResponse) {
    return { status: 'sent', response: result.response }
  }

  return {
    status: 'no-response',
    dispatched: result.connectResult.dispatched,
  }
}

export async function sendTonConnectTransaction(
  tonConnectUI: TonConnectUI,
  transaction: SendTransactionRequest,
): Promise<SendTransactionResponse> {
  const result = await tonConnectUI.sendTransaction(transaction, {
    enableEmbeddedRequest: true,
  })
  const outcome = normalizeEmbeddedTransactionResult(result)

  if (outcome.status === 'no-response') {
    throw new TonConnectNoResponseError(outcome.dispatched)
  }

  return outcome.response
}

export function tonConnectDiagnostics(tonConnectUI: TonConnectUI): Record<string, unknown> {
  const wallet = tonConnectUI.wallet
  const accountAddress = wallet?.account.address

  return {
    connected: tonConnectUI.connected,
    accountChain: wallet?.account.chain,
    accountAddressTail: accountAddress ? accountAddress.slice(-8) : null,
    walletAppName: wallet?.device.appName,
    walletPlatform: wallet?.device.platform,
    walletFeatures: wallet?.device.features?.map((feature) => typeof feature === 'string' ? feature : feature.name),
  }
}
