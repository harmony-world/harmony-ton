// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  createUserScopedTonConnectStorage,
  getLegacyTonConnectStorageKeys,
  getTonConnectStorageKey,
} from './tonConnectStorage'

describe('user-scoped TonConnect storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not migrate legacy TonConnect keys into the current user namespace', async () => {
    const storage = createUserScopedTonConnectStorage(() => '42')
    localStorage.setItem('connection', 'legacy')
    localStorage.setItem('tc_default_connection', 'default')

    expect(await storage.getItem('connection')).toBeNull()
  })

  it('writes only to the current Telegram user namespace', async () => {
    const storage = createUserScopedTonConnectStorage(() => '42')
    await storage.setItem('connection', 'value')

    expect(localStorage.getItem(getTonConnectStorageKey('connection', '42'))).toBe('value')
    expect(localStorage.getItem('connection')).toBeNull()
  })

  it('removes current user and legacy keys on explicit cleanup', async () => {
    const storage = createUserScopedTonConnectStorage(() => '42')
    await storage.setItem('connection', 'value')
    for (const key of getLegacyTonConnectStorageKeys('connection')) {
      localStorage.setItem(key, 'legacy')
    }

    await storage.removeItem('connection')

    expect(localStorage.getItem(getTonConnectStorageKey('connection', '42'))).toBeNull()
    for (const key of getLegacyTonConnectStorageKeys('connection')) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })
})
