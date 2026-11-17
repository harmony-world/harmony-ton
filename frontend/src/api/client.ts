import { API_URL } from '../utils/env'
import { getInitData } from '../utils/telegram'
import i18n from '../i18n'
import { getLanguageHeader } from './headers'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface ErrorBody {
  error?: string
  message?: string
}

function userMessageFromErrorBody(status: number, fallback: string, body?: ErrorBody): { message: string; code: string | undefined } {
  const code = body?.error
  const message = body?.message ?? body?.error ?? fallback
  if (message.includes('/category') || message.includes('category')) return { message: i18n.t('common:api.invalidCategory'), code }
  if (status === 400 && message === 'Bad Request') return { message: i18n.t('common:api.badRequest'), code }
  return { message, code }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const initData = getInitData()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getLanguageHeader(),
    ...(init?.headers as Record<string, string>),
  }
  if (initData) {
    headers['Authorization'] = `tma ${initData}`
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers })

  if (!res.ok) {
    let parsed: { message: string; code: string | undefined }
    try {
      const body = (await res.json()) as ErrorBody
      parsed = userMessageFromErrorBody(res.status, res.statusText, body)
    } catch {
      parsed = userMessageFromErrorBody(res.status, res.statusText)
    }
    if (res.status === 401) {
      window.location.hash = '/'
    }
    throw new ApiError(res.status, parsed.message, parsed.code)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
}
