// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'
import i18n from '../i18n'

vi.mock('../utils/telegram', () => ({
  getInitData: () => 'test-init-data',
}))

vi.mock('../utils/env', () => ({
  API_URL: 'https://api.test',
}))

describe('api client', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends GET request with auth header', async () => {
    await i18n.changeLanguage('en')
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    })

    const result = await api.get('/campaigns')

    expect(fetchSpy).toHaveBeenCalledWith('https://api.test/campaigns', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'tma test-init-data',
        'Content-Type': 'application/json',
        'x-harmony-language': 'en',
      }),
    }))
    expect(result).toEqual({ data: 'ok' })
  })

  it('sends POST request with JSON body', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1' }),
    })

    const result = await api.post('/campaigns', { title: 'Test' })

    expect(fetchSpy).toHaveBeenCalledWith('https://api.test/campaigns', expect.objectContaining({
      method: 'POST',
      body: '{"title":"Test"}',
    }))
    expect(result).toEqual({ id: '1' })
  })

  it('sends PUT request', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })

    await api.put('/users/me/privacy', { isPublic: false })

    expect(fetchSpy).toHaveBeenCalledWith('https://api.test/users/me/privacy', expect.objectContaining({
      method: 'PUT',
      body: '{"isPublic":false}',
    }))
  })

  it('throws ApiError with status and parsed message on error response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ message: 'Invalid title', error: 'VALIDATION_ERROR' }),
    })

    await expect(api.get('/campaigns')).rejects.toThrow(ApiError)

    try {
      await api.get('/campaigns')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(400)
      expect(apiErr.message).toBe('Invalid title')
      expect(apiErr.code).toBe('VALIDATION_ERROR')
    }
  })

  it('maps category-related errors to user-friendly message', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ message: 'Invalid /category value' }),
    })

    try {
      await api.post('/campaigns', {})
    } catch (err) {
      expect((err as ApiError).message).toBe('Некорректная категория')
    }
  })

  it('maps generic 400 Bad Request to user-friendly message', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ message: 'Bad Request' }),
    })

    try {
      await api.post('/campaigns', {})
    } catch (err) {
      expect((err as ApiError).message).toBe('Проверьте поля формы и попробуйте ещё раз')
    }
  })

  it('handles unparseable error body gracefully', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    })

    try {
      await api.get('/campaigns')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(500)
      expect((err as ApiError).message).toBe('Internal Server Error')
    }
  })

  it('redirects to / on 401', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ message: 'unauthorized' }),
    })

    window.location.hash = '#/profile'

    await expect(api.get('/users/me')).rejects.toThrow(ApiError)

    expect(window.location.hash).toBe('#/')
  })
})
