import { useState, useEffect, useRef, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { lockTelegramVerticalSwipes } from '../../utils/telegram'
import { isDesktopPhotoViewerPlatform } from './photoViewerPlatform'

type PhotoPointerState = {
  id: number
  x: number
  y: number
}

function isTelegramFullscreenSupported() {
  const tg = window.Telegram?.WebApp
  return Boolean(tg?.isVersionAtLeast?.('8.0') && typeof tg.requestFullscreen === 'function')
}

interface PhotoViewerProps {
  photos: string[]
  title: string
  activeIndex: number
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}

export function PhotoViewer({ photos, title, activeIndex, onClose, onPrevious, onNext }: PhotoViewerProps) {
  const { t } = useTranslation('campaign')
  const [isDesktopViewer, setIsDesktopViewer] = useState(() => isDesktopPhotoViewerPlatform())
  const pointerStartRef = useRef<PhotoPointerState | null>(null)
  const requestedFullscreenRef = useRef(false)
  const photoCount = photos.length
  const hasMultiplePhotos = photoCount > 1

  useEffect(() => {
    const pointerQuery = window.matchMedia?.('(hover: hover) and (pointer: fine)')
    if (!pointerQuery) return

    const handlePointerChange = () => setIsDesktopViewer(isDesktopPhotoViewerPlatform())
    pointerQuery.addEventListener?.('change', handlePointerChange)
    return () => pointerQuery.removeEventListener?.('change', handlePointerChange)
  }, [])

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    const previousOverflow = document.body.style.overflow
    const previousHeaderColor = tg?.headerColor

    document.body.style.overflow = 'hidden'

    try {
      tg?.setHeaderColor?.('#000000')
    } catch {
    }

    try {
      tg?.disableVerticalSwipes?.()
    } catch {
    }

    if (tg && isTelegramFullscreenSupported()) {
      try {
        tg.requestFullscreen?.()
        requestedFullscreenRef.current = true
      } catch {
        requestedFullscreenRef.current = false
      }
    }

    return () => {
      document.body.style.overflow = previousOverflow

      if (requestedFullscreenRef.current) {
        try {
          tg?.exitFullscreen?.()
        } catch {
        }
      }

      lockTelegramVerticalSwipes()

      if (previousHeaderColor) {
        try {
          tg?.setHeaderColor?.(previousHeaderColor)
        } catch {
        }
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (!hasMultiplePhotos) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrevious()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasMultiplePhotos, onClose, onNext, onPrevious])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (!start || start.id !== event.pointerId || !hasMultiplePhotos) return

    const deltaX = start.x - event.clientX
    const deltaY = start.y - event.clientY
    if (Math.abs(deltaX) <= 42 || Math.abs(deltaY) > Math.abs(deltaX) * 0.85) return

    if (deltaX > 0) onNext()
    else onPrevious()
  }

  const viewer = (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{
        zIndex: 2147483647,
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t('photoViewer.label')}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerStartRef.current = null
      }}
    >
      <div
        className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: `${photoCount * 100}vw`,
          height: '100dvh',
          transform: `translateX(-${activeIndex * (100 / photoCount)}%)`,
        }}
      >
        {photos.map((photo, index) => (
          <div key={photo} className="flex shrink-0 items-center justify-center" style={{ width: `${100 / photoCount}%`, height: '100dvh' }}>
            <img
              src={photo}
              alt={index === activeIndex ? title : ''}
              aria-hidden={index === activeIndex ? undefined : true}
              className="max-h-[100dvh] max-w-[100vw] object-contain"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {hasMultiplePhotos && isDesktopViewer && (
        <>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onPrevious()
            }}
            className="fixed left-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-white/80 outline-none transition-colors hover:bg-white/[.18] focus-visible:ring-2 focus-visible:ring-white/80 active:bg-white/25"
            style={{
              width: 46,
              height: 46,
              background: 'rgba(255,255,255,.10)',
              border: '1px solid rgba(255,255,255,.16)',
            }}
            aria-label={t('photoViewer.previous')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onNext()
            }}
            className="fixed right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-white/80 outline-none transition-colors hover:bg-white/[.18] focus-visible:ring-2 focus-visible:ring-white/80 active:bg-white/25"
            style={{
              width: 46,
              height: 46,
              background: 'rgba(255,255,255,.10)',
              border: '1px solid rgba(255,255,255,.16)',
            }}
            aria-label={t('photoViewer.next')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}

      {hasMultiplePhotos && (
        <div
          className="fixed left-0 right-0 flex justify-center gap-1.5"
          style={{
            bottom: 'max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px), var(--tg-viewport-safe-area-inset-bottom, 0px), 16px)',
            pointerEvents: 'none',
          }}
        >
          {photos.map((_photo, index) => (
            <span
              key={index}
              aria-hidden="true"
              style={{
                width: index === activeIndex ? 18 : 6,
                height: 6,
                borderRadius: 999,
                background: index === activeIndex ? '#fff' : 'rgba(255,255,255,.4)',
                transition: 'width 0.2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )

  return createPortal(viewer, document.body)
}
