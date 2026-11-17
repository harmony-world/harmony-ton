import type { UpdateWalletBody, WalletProofPayload } from '../api/users'

export type TonConnectWalletForBinding = {
  account: {
    address: string
    walletStateInit?: string
  }
  connectItems?: {
    tonProof?: { proof: WalletProofPayload } | { error: unknown }
  }
}

export function walletBindingBody(address: string, wallet?: TonConnectWalletForBinding | null): UpdateWalletBody {
  const tonProof = wallet?.connectItems?.tonProof
  if (tonProof && 'proof' in tonProof && wallet.account.walletStateInit) {
    return {
      walletAddress: address,
      walletStateInit: wallet.account.walletStateInit,
      proof: tonProof.proof,
    }
  }
  return { walletAddress: address }
}
