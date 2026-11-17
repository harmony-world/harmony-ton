import { API_URL } from '../utils/env'
import { getInitData } from '../utils/telegram'
import i18n from '../i18n'
import { ApiError } from './client'
import { getLanguageHeader } from './headers'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const MAX_SOURCE_BYTES = 30 * 1024 * 1024

const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.85

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
] as const

export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(',')

export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)
}

const PASSTHROUGH_MIME = new Set<string>(['image/jpeg', 'image/png'])

function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (
        PASSTHROUGH_MIME.has(file.type) &&
        width <= MAX_DIMENSION &&
        height <= MAX_DIMENSION &&
        file.size <= MAX_UPLOAD_BYTES
      ) {
        resolve(file)
        return
      }
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error(i18n.t('common:upload.compressFailed')))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(i18n.t('common:upload.loadFailed')))
    }
    img.src = url
  })
}

export async function uploadImage(file: File): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ApiError(413, i18n.t('common:upload.tooLarge'))
  }

  if (!isAcceptedImage(file)) {
    throw new ApiError(415, i18n.t('common:upload.unsupportedFormat'))
  }

  const blob = await resizeImage(file)

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, i18n.t('common:upload.tooLargeAfterCompression'))
  }

  const initData = getInitData()
  const headers: Record<string, string> = getLanguageHeader()
  if (initData) headers['Authorization'] = `tma ${initData}`

  const form = new FormData()
  form.append('file', blob, file.name.replace(/\.\w+$/, '.jpg'))

  const res = await fetch(`${API_URL}/uploads/image`, {
    method: 'POST',
    headers,
    body: form,
  })

  if (!res.ok) {
    let message = res.statusText
    if (res.status === 413) message = i18n.t('common:upload.tooLarge')
    else {
      try {
        const body = (await res.json()) as { error?: string }
        if (body.error) message = body.error
      } catch {
      }
    }
    throw new ApiError(res.status, message)
  }

  const { url } = (await res.json()) as { url: string }
  return url
}

export async function deleteUploadedImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return

  const initData = getInitData()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getLanguageHeader() }
  if (initData) headers['Authorization'] = `tma ${initData}`

  await fetch(`${API_URL}/uploads/image`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ urls }),
  }).catch(() => {
  })
}
