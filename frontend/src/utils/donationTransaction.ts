import { Address, beginCell, toNano } from '@ton/core'
import { IS_TESTNET, TON_CONNECT_NETWORK } from './env'

const OP_DONATE = 0x10000001

export interface TonConnectMessage {
  address: string
  amount: string
  payload?: string
}

export interface DonationTransactionRequest {
  validUntil: number
  network: string
  messages: TonConnectMessage[]
}

function cellToBase64(cell: ReturnType<ReturnType<typeof beginCell>['endCell']>): string {
  const boc = cell.toBoc()
  return btoa(String.fromCharCode(...boc))
}

export function buildDonatePayload(tipBps: number): string {
  return cellToBase64(
    beginCell()
      .storeUint(OP_DONATE, 32)
      .storeUint(tipBps, 32)
      .endCell(),
  )
}

export function normalizeTonConnectMessageAddress(address: string): string {
  return Address.parse(address).toString({
    testOnly: IS_TESTNET,
    bounceable: true,
    urlSafe: true,
  })
}

export function buildJettonTransferBody(
  amount: bigint,
  destination: string,
  responseAddr: string,
  campaignId: string,
  tipBps: number,
): string {
  return cellToBase64(
    beginCell()
      .storeUint(0x0f8a7ea5, 32)
      .storeUint(0, 64)
      .storeCoins(amount)
      .storeAddress(Address.parse(destination))
      .storeAddress(Address.parse(responseAddr))
      .storeBit(0)
      .storeCoins(toNano('0.05'))
      .storeBit(1)
      .storeRef(
        beginCell()
          .storeUint(OP_DONATE, 32)
          .storeUint(tipBps, 32)
          .storeStringTail(`donate:${campaignId}`)
          .endCell(),
      )
      .endCell(),
  )
}

export function buildGramDonationTransaction(
  contractAddr: string,
  amountNano: string,
  tipBps: number,
): DonationTransactionRequest {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    network: TON_CONNECT_NETWORK,
    messages: [{
      address: normalizeTonConnectMessageAddress(contractAddr),
      amount: amountNano,
      payload: buildDonatePayload(tipBps),
    }],
  }
}

export function buildUsdtDonationTransaction(
  senderJettonWallet: string,
  payload: string,
): DonationTransactionRequest {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    network: TON_CONNECT_NETWORK,
    messages: [{
      address: normalizeTonConnectMessageAddress(senderJettonWallet),
      amount: toNano('0.1').toString(),
      payload,
    }],
  }
}
