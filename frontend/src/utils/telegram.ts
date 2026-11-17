export function isTelegramEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    (typeof window.Telegram?.WebApp !== 'undefined' ||
      window.location !== window.parent.location)
  )
}

export function expandApp(): void {
  window.Telegram?.WebApp?.expand()
}

export function watchViewportHeight(): void {
  const webApp = window.Telegram?.WebApp as unknown as {
    viewportStableHeight?: number
    onEvent?: (event: string, cb: () => void) => void
  } | undefined
  if (!webApp || typeof webApp.onEvent !== 'function') return

  const sync = () => {
    const h = webApp.viewportStableHeight
    if (h && h > 100) {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', h + 'px')
    }
  }

  webApp.onEvent('viewportChanged', sync)
  sync()
  setTimeout(sync, 300)
  setTimeout(sync, 1000)
}

export function onTelegramActivated(handler: () => void): () => void {
  const webApp = window.Telegram?.WebApp as unknown as {
    onEvent?: (event: string, cb: () => void) => void
    offEvent?: (event: string, cb: () => void) => void
  } | undefined
  if (!webApp || typeof webApp.onEvent !== 'function') return () => {}

  try {
    webApp.onEvent('activated', handler)
  } catch {
    return () => {}
  }

  return () => {
    try {
      webApp.offEvent?.('activated', handler)
    } catch {
    }
  }
}

export function readyApp(): void {
  window.Telegram?.WebApp?.ready()
}

export function lockTelegramVerticalSwipes(): void {
  const webApp = window.Telegram?.WebApp
  try {
    webApp?.disableVerticalSwipes?.()
  } catch {
  }
}

export function applyTelegramViewportTheme(): void {
  const webApp = window.Telegram?.WebApp
  const rootStyles = getComputedStyle(document.documentElement)
  const background =
    rootStyles.getPropertyValue('--tg-theme-bg-color').trim() ||
    rootStyles.getPropertyValue('--app-bg-color').trim() ||
    '#111318'

  try {
    webApp?.setBackgroundColor?.(background)
  } catch {
  }

  try {
    webApp?.setHeaderColor?.(background)
  } catch {
  }
}

export function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? ''
}

type EmojiStatusAccessGranter = (callback: (granted: boolean) => void) => void

export function requestEmojiStatusAccess(): Promise<boolean> {
  const webApp = window.Telegram?.WebApp as unknown as
    | { requestEmojiStatusAccess?: EmojiStatusAccessGranter }
    | undefined
  if (!webApp || typeof webApp.requestEmojiStatusAccess !== 'function') {
    return Promise.resolve(false)
  }
  return new Promise<boolean>((resolve) => {
    try {
      webApp.requestEmojiStatusAccess!((granted: boolean) => resolve(Boolean(granted)))
    } catch {
      resolve(false)
    }
  })
}

const DESKTOP_PLATFORMS = new Set(['tdesktop', 'macos', 'linux', 'windows', 'web'])

export function isDesktopTelegram(): boolean {
  const platform = (window.Telegram?.WebApp as unknown as { platform?: string } | undefined)?.platform ?? ''
  return DESKTOP_PLATFORMS.has(platform)
}

const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{4,32}$/

export function openTelegramProfile(username: string): boolean {
  const handle = username.replace(/^@/, '')
  if (!TELEGRAM_USERNAME.test(handle)) return false
  const url = `https://t.me/${handle}`
  const tg = window.Telegram?.WebApp
  if (typeof tg?.openTelegramLink === 'function') {
    try {
      tg.openTelegramLink(url)
      return true
    } catch {  }
  }
  window.open(url, '_blank', 'noopener')
  return true
}

type ShareMessageFn = (msgId: string, callback?: (ok: boolean) => void) => void

export async function shareViaPreparedMessage(msgId: string): Promise<'shared' | 'unsupported' | 'failed'> {
  const tg = window.Telegram?.WebApp as unknown as
    | { shareMessage?: ShareMessageFn; version?: string }
    | undefined
  if (!tg || typeof tg.shareMessage !== 'function') return 'unsupported'

  return new Promise<'shared' | 'failed'>((resolve) => {
    try {
      tg.shareMessage!(msgId, (ok: boolean) => resolve(ok ? 'shared' : 'failed'))
    } catch {
      resolve('failed')
    }
  })
}

export async function shareText(text: string): Promise<'shared' | 'copied' | 'error'> {
  const tg = window.Telegram?.WebApp

  if (tg?.openTelegramLink && !isDesktopTelegram()) {
    try {
      tg.openTelegramLink(`https://t.me/share/url?text=${encodeURIComponent(text)}`)
      return 'shared'
    } catch {  }
  }

  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch {  }
  }

  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'error'
  }
}

export function isTelegramPremium(): boolean {
  const webApp = window.Telegram?.WebApp as unknown as
    | { initDataUnsafe?: { user?: { is_premium?: boolean } } }
    | undefined
  return Boolean(webApp?.initDataUnsafe?.user?.is_premium)
}
