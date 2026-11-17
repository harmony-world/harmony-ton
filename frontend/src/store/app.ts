import { create } from 'zustand'
import type { KycLevel, TgUser } from '../types'

interface AppState {
  user: TgUser | null
  kycLevel: KycLevel
  walletAddress: string | null
  setUser: (user: TgUser | null) => void
  setKycLevel: (level: KycLevel) => void
  setWalletAddress: (address: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  kycLevel: 0,
  walletAddress: null,
  setUser: (user) => set({ user }),
  setKycLevel: (kycLevel) => set({ kycLevel }),
  setWalletAddress: (walletAddress) => set({ walletAddress }),
}))
