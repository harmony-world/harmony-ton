import { api } from './client'

export interface JettonWalletAddressResponse {
  address: string
}

export interface WalletKindResponse {
  kind: 'wallet_tg' | 'other' | null
  acceptsUsdt: boolean
}

export const walletsApi = {
  kind: (address: string) => api.get<WalletKindResponse>(`/wallets/kind?address=${encodeURIComponent(address)}`),
  getJettonWalletAddress: (walletAddress: string, jettonMaster: string) =>
    api.get<JettonWalletAddressResponse>(
      `/wallets/jetton-address?walletAddress=${encodeURIComponent(walletAddress)}&jettonMaster=${encodeURIComponent(jettonMaster)}`,
    ),
}
