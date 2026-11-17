import { useIsConnectionRestored, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'
import { Address } from '@ton/core'
import { useProfile } from './useApi'

const IS_TESTNET = import.meta.env.VITE_TON_NETWORK !== 'mainnet'

function toNonBounceable(addr: string): string {
  try {
    return Address.parse(addr).toString({ testOnly: IS_TESTNET, bounceable: false })
  } catch {
    return addr
  }
}

export function useWalletState() {
  const liveTonAddress = useTonAddress()
  const [tonConnectUI] = useTonConnectUI()
  const isConnectionRestored = useIsConnectionRestored()
  const { data: profile, isLoading } = useProfile()

  const liveAddress = liveTonAddress || tonConnectUI.wallet?.account.address || ''
  const rawServerAddress = profile?.walletFriendly || profile?.walletAddress || ''
  const serverAddress = rawServerAddress ? toNonBounceable(rawServerAddress) : ''
  const isLiveConnected = Boolean(liveAddress)
  const isServerBound = Boolean(profile?.walletConnected && rawServerAddress)
  const effectivePayoutAddress = liveAddress || (isServerBound ? serverAddress : '')
  const isRestoringSession = isServerBound && !isLiveConnected && !isConnectionRestored

  return {
    liveAddress,
    serverAddress: isServerBound ? serverAddress : '',
    effectivePayoutAddress,
    isLiveConnected,
    isServerBound,
    isConnectionRestored,
    isRestoringSession,
    isLoading,
    tonConnectUI,
  }
}
