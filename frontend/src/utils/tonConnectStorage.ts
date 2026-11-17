import TonConnect from '@tonconnect/sdk'
import type { IStorage } from '@tonconnect/sdk'

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: { id?: string | number }
      }
    }
  }
}

function getTgUserId(): string {
  try {
    const user = (window as TelegramWindow).Telegram?.WebApp?.initDataUnsafe?.user
    return user?.id ? String(user.id) : 'default'
  } catch {
    return 'default'
  }
}

export function getTonConnectStorageKey(key: string, userId = getTgUserId()): string {
  return `tc_${userId}_${key}`
}

export function getLegacyTonConnectStorageKeys(key: string): string[] {
  return [`tc_default_${key}`, key]
}

export function createUserScopedTonConnectStorage(getUserId = getTgUserId): IStorage {
  return {
    async setItem(key: string, value: string) {
      localStorage.setItem(getTonConnectStorageKey(key, getUserId()), value)
    },
    async getItem(key: string): Promise<string | null> {
      const storageKey = getTonConnectStorageKey(key, getUserId())
      return localStorage.getItem(storageKey)
    },
    async removeItem(key: string) {
      localStorage.removeItem(getTonConnectStorageKey(key, getUserId()))
      for (const legacyKey of getLegacyTonConnectStorageKeys(key)) {
        localStorage.removeItem(legacyKey)
      }
    },
  }
}

export function resetUserScopedTonConnectStorage(userId = getTgUserId()): void {
  const prefixes = [`tc_${userId}_`, 'tc_default_', 'ton-connect']
  const keysToRemove: string[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }
}

export function userScopedTonConnect(manifestUrl: string): TonConnect {
  return new TonConnect({ manifestUrl, storage: createUserScopedTonConnectStorage() })
}
