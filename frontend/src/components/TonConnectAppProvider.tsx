import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TonConnectUIProvider, useIsConnectionRestored, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react'
import { TON_MANIFEST_URL, TWA_RETURN_URL } from '../utils/env'
import { userScopedTonConnect } from '../utils/tonConnectStorage'
import { usersApi } from '../api/users'
import { walletBindingBody, type TonConnectWalletForBinding } from '../utils/walletBinding'

const manifestUrl =
  TON_MANIFEST_URL || `${window.location.origin}/tonconnect-manifest.json`

const connector = userScopedTonConnect(manifestUrl)

function WalletBindingSync() {
  const walletAddress = useTonAddress()
  const [tonConnectUI] = useTonConnectUI()
  const connectionRestored = useIsConnectionRestored()
  const queryClient = useQueryClient()
  const lastSyncedAddress = useRef<string | null>(null)
  const inFlightAddress = useRef<string | null>(null)
  const proofRequired = useRef<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadWalletChallenge = async () => {
      tonConnectUI.setConnectRequestParameters({ state: 'loading' })
      try {
        const challenge = await usersApi.walletChallenge()
        if (cancelled) return
        proofRequired.current = challenge.required
        tonConnectUI.setConnectRequestParameters({
          state: 'ready',
          value: { tonProof: challenge.payload },
        })
      } catch {
        if (cancelled) return
        proofRequired.current = null
        tonConnectUI.setConnectRequestParameters(null)
      }
    }

    void loadWalletChallenge()
    const refreshTimer = window.setInterval(() => {
      void loadWalletChallenge()
    }, 8 * 60 * 1000)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [tonConnectUI])

  const syncWallet = useCallback(async (address: string, source: string, wallet?: TonConnectWalletForBinding | null) => {
    if (!address) return
    if (lastSyncedAddress.current === address || inFlightAddress.current === address) return

    const body = walletBindingBody(address, wallet)
    if (proofRequired.current === true && (!body.proof || !body.walletStateInit)) {
      if (import.meta.env.DEV) {
        console.warn('[wallet-binding] proof required, reconnect wallet to sign ton_proof', { source })
      }
      return
    }

    inFlightAddress.current = address
    try {
      const result = await usersApi.updateWallet(body)
      lastSyncedAddress.current = address
      if (import.meta.env.DEV) {
        console.info('[wallet-binding] server wallet synced', {
          source,
          rebind: result.rebind,
          linkedCount: result.repair.linkedCount,
          donationCount: result.repair.donationCount,
        })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['kycStatus'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['userDonations'], refetchType: 'active' }),
      ])
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[wallet-binding] failed to sync wallet with backend', { source, error })
      }
    } finally {
      if (inFlightAddress.current === address) {
        inFlightAddress.current = null
      }
    }
  }, [queryClient])

  useEffect(() => {
    if (!connectionRestored || !walletAddress) return
    void syncWallet(walletAddress, 'useTonAddress', tonConnectUI.wallet as TonConnectWalletForBinding | null)
  }, [connectionRestored, walletAddress, syncWallet, tonConnectUI])

  useEffect(() => {
    const unsubscribe = tonConnectUI.onStatusChange((wallet) => {
      const rawAddress = wallet?.account.address
      if (!rawAddress) {
        lastSyncedAddress.current = null
        return
      }
      void syncWallet(rawAddress, 'onStatusChange', wallet as TonConnectWalletForBinding)
    })

    tonConnectUI.connectionRestored
      .then(() => {
        const rawAddress = tonConnectUI.wallet?.account.address
        if (rawAddress) {
          void syncWallet(
            rawAddress,
            'connectionRestored',
            tonConnectUI.wallet as TonConnectWalletForBinding | null,
          )
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error('[wallet-binding] TonConnect restore failed', { error })
        }
      })

    return unsubscribe
  }, [syncWallet, tonConnectUI])

  return null
}

export function TonConnectAppProvider({ children }: { children: ReactNode }) {
  return (
    <TonConnectUIProvider
      connector={connector}
      actionsConfiguration={{ twaReturnUrl: TWA_RETURN_URL }}
    >
      <WalletBindingSync />
      {children}
    </TonConnectUIProvider>
  )
}
