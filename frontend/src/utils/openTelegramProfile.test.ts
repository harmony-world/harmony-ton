// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openTelegramProfile } from './telegram'

describe('openTelegramProfile', () => {
  afterEach(() => {
    delete (window as { Telegram?: unknown }).Telegram
    vi.restoreAllMocks()
  })

  it('opens the profile through Telegram when inside the mini app', () => {
    const openTelegramLink = vi.fn()
    ;(window as { Telegram?: unknown }).Telegram = { WebApp: { openTelegramLink } }
    expect(openTelegramProfile('@harmony_user')).toBe(true)
    expect(openTelegramLink).toHaveBeenCalledWith('https://t.me/harmony_user')
  })

  it('falls back to a new tab outside Telegram', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openTelegramProfile('harmony_user')).toBe(true)
    expect(open).toHaveBeenCalledWith('https://t.me/harmony_user', '_blank', 'noopener')
  })

  it('rejects anything that is not a Telegram username', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openTelegramProfile('a/../joinchat')).toBe(false)
    expect(openTelegramProfile('abc')).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
