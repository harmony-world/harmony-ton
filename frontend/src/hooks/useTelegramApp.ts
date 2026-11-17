import { useState } from 'react'
import { retrieveLaunchParams } from '@tma.js/sdk'

export interface TelegramAppState {
  isTMA: boolean
  initData: string | null
  userId: number | null
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  colorScheme: 'light' | 'dark'
}

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: { photo_url?: string }
      }
    }
  }
}

function parseTelegramState(): TelegramAppState {
  try {
    const launchParams = retrieveLaunchParams()
    const tgUser = launchParams.tgWebAppData?.user
    const unsafeUser = (window as TelegramWindow).Telegram?.WebApp?.initDataUnsafe?.user
    return {
      isTMA: true,
      initData: launchParams.tgWebAppData ? JSON.stringify(launchParams.tgWebAppData) : null,
      userId: tgUser?.id ?? null,
      username: tgUser?.username ?? null,
      firstName: tgUser?.firstName ? String(tgUser.firstName) : null,
      lastName: tgUser?.lastName ? String(tgUser.lastName) : null,
      photoUrl: unsafeUser?.photo_url ?? null,
      colorScheme: launchParams.tgWebAppThemeParams?.bg_color === '#ffffff' ? 'light' : 'dark',
    }
  } catch {
    return {
      isTMA: false,
      initData: null,
      userId: null,
      username: null,
      firstName: null,
      lastName: null,
      photoUrl: null,
      colorScheme: 'light',
    }
  }
}

export function useTelegramApp(): TelegramAppState {
  const [state] = useState<TelegramAppState>(parseTelegramState)
  return state
}
