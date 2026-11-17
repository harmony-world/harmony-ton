// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SOURCE_BYTES, uploadImage } from './uploads'

const COMPRESSED_BYTES = 320 * 1024

function fileOfSize(bytes: number, type = 'image/jpeg'): File {
  const file = new File(['stub'], 'photo.jpg', { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:stub')
  URL.revokeObjectURL = vi.fn()

  class StubImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    width = 4032
    height = 3024
    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', StubImage)

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) => {
    cb(new Blob([new Uint8Array(COMPRESSED_BYTES)], { type: 'image/jpeg' }))
  }) as never

  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ url: '/uploads/11111111-1111-4111-8111-111111111111.jpg' }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('uploadImage', () => {
  it('compresses a phone-sized photo instead of refusing it', async () => {
    const url = await uploadImage(fileOfSize(12 * 1024 * 1024))

    expect(url).toBe('/uploads/11111111-1111-4111-8111-111111111111.jpg')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const body = fetchMock.mock.calls[0]![1].body as FormData
    const sent = body.get('file') as Blob
    expect(sent.size).toBe(COMPRESSED_BYTES)
    expect(sent.size).toBeLessThan(5 * 1024 * 1024)
  })

  it('still refuses a source too heavy for the browser to decode', async () => {
    await expect(uploadImage(fileOfSize(MAX_SOURCE_BYTES + 1))).rejects.toMatchObject({ status: 413 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads a small in-bounds photo untouched', async () => {
    class SmallImage {
      onload: (() => void) | null = null
      width = 1200
      height = 900
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', SmallImage)

    await uploadImage(fileOfSize(400 * 1024))

    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-encodes an accepted format the server does not take, however small', async () => {
    class SmallImage {
      onload: (() => void) | null = null
      width = 800
      height = 600
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', SmallImage)

    await uploadImage(fileOfSize(90 * 1024, 'image/webp'))

    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      expect.any(Number),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a format the browser cannot decode', async () => {
    await expect(uploadImage(fileOfSize(2 * 1024 * 1024, 'image/heic'))).rejects.toMatchObject({
      status: 415,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
