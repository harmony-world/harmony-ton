import { api } from './client'

interface PrepareShareResponse {
  msgId: string
}

export function prepareShare(type: 'campaign' | 'profile', id: string): Promise<PrepareShareResponse> {
  return api.post<PrepareShareResponse>('/share/prepare', { type, id })
}
