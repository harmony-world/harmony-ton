import { useEffect } from 'react'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        platform?: string
        headerColor?: string
        BackButton?: {
          show: () => void
          hide: () => void
          onClick: (cb: () => void) => void
          offClick: (cb: () => void) => void
        }
        expand: () => void
        ready: () => void
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
        openTelegramLink: (url: string) => void
        isVersionAtLeast?: (version: string) => boolean
        requestFullscreen?: () => void
        exitFullscreen?: () => void
        setBackgroundColor?: (color: string) => void
        setHeaderColor?: (color: string) => void
        disableVerticalSwipes?: () => void
        enableVerticalSwipes?: () => void
        HapticFeedback?: {
          impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
          notificationOccurred?: (type: 'success' | 'warning' | 'error') => void
          selectionChanged?: () => void
        }
      }
    }
  }
}

export function useBackButton(onBack?: () => void) {
  useEffect(() => {
    const bb = window.Telegram?.WebApp?.BackButton
    if (!bb) return

    if (onBack) {
      bb.show()
      bb.onClick(onBack)
      return () => {
        bb.offClick(onBack)
        bb.hide()
      }
    } else {
      bb.hide()
    }
  }, [onBack])
}
