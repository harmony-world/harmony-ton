import { API_URL } from '../utils/env'
import { getInitData } from '../utils/telegram'
import { ApiError } from './client'
import { getLanguageHeader } from './headers'

export async function sendFeedback(message: string, photos: string[]): Promise<void> {
  const initData = getInitData()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getLanguageHeader() }
  if (initData) headers['Authorization'] = `tma ${initData}`

  const res = await fetch(`${API_URL}/support/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, photos }),
  })

  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {  }
    throw new ApiError(res.status, msg)
  }
}
