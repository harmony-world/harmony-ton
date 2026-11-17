const SESSION_USER_KEY = 'harmony_current_user'

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: { id?: string | number }
      }
    }
  }
}

function getCurrentTgUserId(): string | null {
  try {
    const user = (window as TelegramWindow).Telegram?.WebApp?.initDataUnsafe?.user
    return user?.id ? String(user.id) : null
  } catch {
    return null
  }
}

function shouldRemoveStorageKeyOnUserSwitch(key: string, currentUserId: string): boolean {
  if (key === SESSION_USER_KEY) return false
  if (key.startsWith(`tc_${currentUserId}_`)) return false
  if (key.startsWith('tc_')) return true
  if (key.startsWith('ton-connect')) return true
  return true
}

export function ensureSessionIsolation(): void {
  const currentUserId = getCurrentTgUserId()
  if (!currentUserId) return

  const storedUserId = localStorage.getItem(SESSION_USER_KEY)
  if (storedUserId === currentUserId) return

  if (storedUserId === null) {
    localStorage.setItem(SESSION_USER_KEY, currentUserId)
    return
  }

  const allKeys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && shouldRemoveStorageKeyOnUserSwitch(key, currentUserId)) {
      allKeys.push(key)
    }
  }
  for (const key of allKeys) {
    localStorage.removeItem(key)
  }

  localStorage.setItem(SESSION_USER_KEY, currentUserId)
}

export function getUserStorageKey(base: string): string {
  const userId = getCurrentTgUserId()
  return userId ? `${base}_${userId}` : base
}
