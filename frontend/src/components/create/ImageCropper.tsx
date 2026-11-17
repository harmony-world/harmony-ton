import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { useTranslation } from 'react-i18next'

const ASPECT = 16 / 9
const OUTPUT_WIDTH = 1280
const OUTPUT_HEIGHT = Math.round(OUTPUT_WIDTH / ASPECT)
const ADVANCED_CROPPER_ENABLED = import.meta.env.VITE_ADVANCED_IMAGE_CROPPER !== '0'

interface Props {
  src: string
  onCrop: (blob: Blob) => void
  onCancel: () => void
}

type CropMode = 'cover' | 'contain'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = src
  })
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180
}

function rotatedSize(width: number, height: number, rotation: number) {
  const angle = radians(rotation)
  return {
    width: Math.abs(Math.cos(angle) * width) + Math.abs(Math.sin(angle) * height),
    height: Math.abs(Math.sin(angle) * width) + Math.abs(Math.cos(angle) * height),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to crop image'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function drawRotatedImage(image: HTMLImageElement, rotation: number) {
  const size = rotatedSize(image.naturalWidth, image.naturalHeight, rotation)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(size.width)
  canvas.height = Math.round(size.height)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(radians(rotation))
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  return canvas
}

async function createCroppedCoverBlob(src: string, crop: Area, rotation: number) {
  const image = await loadImage(src)
  const rotated = drawRotatedImage(image, rotation)
  const cropX = Math.max(0, Math.round(crop.x))
  const cropY = Math.max(0, Math.round(crop.y))
  const cropW = Math.min(rotated.width - cropX, Math.round(crop.width))
  const cropH = Math.min(rotated.height - cropY, Math.round(crop.height))

  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')

  ctx.drawImage(rotated, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return canvasToBlob(canvas)
}

async function createContainedCoverBlob(src: string, rotation: number) {
  const image = await loadImage(src)
  const rotated = drawRotatedImage(image, rotation)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_WIDTH
  canvas.height = OUTPUT_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')

  const coverScale = Math.max(canvas.width / rotated.width, canvas.height / rotated.height)
  const coverW = rotated.width * coverScale
  const coverH = rotated.height * coverScale
  const coverX = (canvas.width - coverW) / 2
  const coverY = (canvas.height - coverH) / 2

  ctx.save()
  ctx.filter = 'blur(22px)'
  ctx.drawImage(rotated, coverX, coverY, coverW, coverH)
  ctx.restore()

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const containScale = Math.min(canvas.width / rotated.width, canvas.height / rotated.height)
  const containW = rotated.width * containScale
  const containH = rotated.height * containScale
  const containX = (canvas.width - containW) / 2
  const containY = (canvas.height - containH) / 2

  ctx.drawImage(rotated, containX, containY, containW, containH)
  return canvasToBlob(canvas, 0.9)
}

export function ImageCropper(props: Props) {
  if (!ADVANCED_CROPPER_ENABLED) {
    return <LegacyImageCropper {...props} />
  }

  return <AdvancedImageCropper {...props} />
}

function AdvancedImageCropper({ src, onCrop, onCancel }: Props) {
  const { t } = useTranslation('create')
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [mode, setMode] = useState<CropMode>('cover')
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleCropComplete = useCallback((_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels)
  }, [])

  const reset = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }

  const rotate = () => {
    setCrop({ x: 0, y: 0 })
    setRotation((current) => (current + 90) % 360)
  }

  const handleConfirm = async () => {
    if (isProcessing) return

    try {
      setIsProcessing(true)
      const blob = mode === 'contain'
        ? await createContainedCoverBlob(src, rotation)
        : await createCroppedCoverBlob(src, croppedAreaPixels ?? { x: 0, y: 0, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }, rotation)
      onCrop(blob)
    } finally {
      setIsProcessing(false)
    }
  }

  const isContainMode = mode === 'contain'

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-[var(--tg-theme-text-color,#1C1C1E)]">
          {t('details.cropTitle')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--tg-theme-hint-color,#8E8E93)]">
          {isContainMode ? t('details.cropContainHint') : t('details.cropCoverHint')}
        </p>
      </div>

      <div
        className="grid grid-cols-2 rounded-[14px] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] p-1"
        role="tablist"
        aria-label={t('details.cropModeLabel')}
      >
        {(['cover', 'contain'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value)
              reset()
            }}
            className="min-h-11 rounded-[11px] px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--tg-brand-color)] focus:ring-offset-2"
            style={{
              background: mode === value ? 'var(--tg-theme-bg-color,#fff)' : 'transparent',
              color: mode === value ? 'var(--tg-theme-text-color,#1C1C1E)' : 'var(--tg-theme-hint-color,#8E8E93)',
              boxShadow: mode === value ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            }}
          >
            {t(value === 'cover' ? 'details.cropModeCover' : 'details.cropModeContain')}
          </button>
        ))}
      </div>

      <div
        className="relative overflow-hidden rounded-[16px] border border-[var(--tg-theme-hint-color,#8E8E93)]/20 bg-black"
        style={{ aspectRatio: `${ASPECT}` }}
      >
        {isContainMode ? (
          <>
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-65 blur-xl"
              style={{ transform: `rotate(${rotation}deg) scale(1.14)` }}
              draggable={false}
            />
            <div className="absolute inset-0 bg-black/20" />
            <img
              src={src}
              alt={t('details.cropPreviewAlt')}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ transform: `rotate(${rotation}deg)` }}
              draggable={false}
            />
          </>
        ) : (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={ASPECT}
            minZoom={1}
            maxZoom={3}
            cropShape="rect"
            objectFit="cover"
            showGrid
            onCropChange={setCrop}
            onCropComplete={handleCropComplete}
            onZoomChange={setZoom}
          />
        )}
      </div>

      <div className="rounded-[16px] bg-[var(--tg-theme-secondary-bg-color,#F2F2F7)] p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={rotate}
            className="min-h-11 rounded-[12px] px-3 text-sm font-semibold transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-brand-color)] focus:ring-offset-2"
            style={{
              background: 'var(--tg-theme-bg-color,#fff)',
              color: 'var(--tg-theme-text-color,#1C1C1E)',
            }}
            aria-label={t('details.cropRotateAria')}
          >
            90°
          </button>

          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-[12px] px-3 text-sm font-semibold transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-brand-color)] focus:ring-offset-2"
            style={{
              background: 'var(--tg-theme-bg-color,#fff)',
              color: 'var(--tg-theme-text-color,#1C1C1E)',
            }}
          >
            {t('details.cropReset')}
          </button>
        </div>

        {!isContainMode && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom((current) => Math.max(1, Number((current - 0.1).toFixed(2))))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-brand-color)] focus:ring-offset-2"
              style={{
                background: 'var(--tg-theme-bg-color,#fff)',
                color: 'var(--tg-theme-text-color,#1C1C1E)',
              }}
              aria-label={t('details.cropZoomOutAria')}
            >
              -
            </button>
            <label className="sr-only" htmlFor="campaign-photo-zoom">
              {t('details.cropZoomLabel')}
            </label>
            <input
              id="campaign-photo-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-11 min-w-0 flex-1 accent-[var(--tg-brand-color)]"
              aria-label={t('details.cropZoomLabel')}
            />
            <button
              type="button"
              onClick={() => setZoom((current) => Math.min(3, Number((current + 0.1).toFixed(2))))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold transition-opacity active:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--tg-brand-color)] focus:ring-offset-2"
              style={{
                background: 'var(--tg-theme-bg-color,#fff)',
                color: 'var(--tg-theme-text-color,#1C1C1E)',
              }}
              aria-label={t('details.cropZoomInAria')}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="min-h-11 flex-1 rounded-[12px] border py-2.5 text-sm font-medium transition-opacity active:opacity-70 disabled:opacity-50"
          style={{
            borderColor: 'var(--tg-theme-hint-color, #8E8E93)',
            color: 'var(--tg-theme-text-color, #1C1C1E)',
          }}
        >
          {t('details.cropCancel')}
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={isProcessing}
          className="min-h-11 flex-1 rounded-[12px] py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
          style={{ background: 'var(--tg-brand-color)' }}
        >
          {isProcessing ? t('details.cropProcessing') : t('details.cropConfirm')}
        </button>
      </div>
    </div>
  )
}

function LegacyImageCropper({ src, onCrop, onCancel }: Props) {
  const { t } = useTranslation('create')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [scale, setScale] = useState(1)
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null)

  const imgNatW = useRef(0)
  const imgNatH = useRef(0)
  const frameW = useRef(0)
  const frameH = useRef(0)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      imgNatW.current = img.naturalWidth
      imgNatH.current = img.naturalHeight
      setLoaded(true)
    }
    img.src = src
  }, [src])

  useEffect(() => {
    if (!loaded || !containerRef.current) return
    const cw = containerRef.current.clientWidth
    frameW.current = cw
    frameH.current = Math.round(cw / ASPECT)

    const scaleX = frameW.current / imgNatW.current
    const scaleY = frameH.current / imgNatH.current
    setScale(Math.max(scaleX, scaleY))
    setOffsetX(0)
    setOffsetY(0)
  }, [loaded])

  const clampOffsets = useCallback(
    (x: number, y: number): [number, number] => {
      const scaledW = imgNatW.current * scale
      const scaledH = imgNatH.current * scale
      const maxX = Math.max(0, (scaledW - frameW.current) / 2)
      const maxY = Math.max(0, (scaledH - frameH.current) / 2)
      return [
        Math.max(-maxX, Math.min(maxX, x)),
        Math.max(-maxY, Math.min(maxY, y)),
      ]
    },
    [scale],
  )

  useEffect(() => {
    if (!loaded || !canvasRef.current || !imgRef.current) return
    const canvas = canvasRef.current
    canvas.width = frameW.current
    canvas.height = frameH.current
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const sw = imgNatW.current
    const sh = imgNatH.current
    const dw = sw * scale
    const dh = sh * scale
    const dx = (frameW.current - dw) / 2 + offsetX
    const dy = (frameH.current - dh) / 2 + offsetY

    ctx.drawImage(imgRef.current, dx, dy, dw, dh)
  }, [loaded, offsetX, offsetY, scale])

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offsetX, startOffsetY: offsetY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const [cx, cy] = clampOffsets(dragRef.current.startOffsetX + dx, dragRef.current.startOffsetY + dy)
    setOffsetX(cx)
    setOffsetY(cy)
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handleConfirm = () => {
    if (!canvasRef.current) return
    canvasRef.current.toBlob(
      (blob) => {
        if (blob) onCrop(blob)
      },
      'image/jpeg',
      0.88,
    )
  }

  if (!loaded) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--tg-theme-hint-color,#8E8E93)]">
        {t('details.cropLoading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xs text-[var(--tg-theme-hint-color,#8E8E93)]">
        {t('details.cropHint')}
      </p>
      <div
        ref={containerRef}
        className="relative touch-none select-none overflow-hidden rounded-xl border border-[var(--tg-theme-hint-color,#8E8E93)]/20"
        style={{ aspectRatio: `${ASPECT}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas ref={canvasRef} className="h-full w-full" style={{ display: 'block' }} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[12px] border py-2.5 text-sm font-medium"
          style={{
            borderColor: 'var(--tg-theme-hint-color, #8E8E93)',
            color: 'var(--tg-theme-text-color, #1C1C1E)',
          }}
        >
          {t('details.cropCancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="flex-1 rounded-[12px] py-2.5 text-sm font-semibold text-white"
          style={{ background: 'var(--tg-brand-color)' }}
        >
          {t('details.cropConfirm')}
        </button>
      </div>
    </div>
  )
}
