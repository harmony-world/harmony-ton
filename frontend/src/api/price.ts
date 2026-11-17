import { api } from './client'

export interface TonPriceResponse {
  usd: number
  fetchedAt: number | null
}

export const priceApi = {
  ton: () => api.get<TonPriceResponse>('/price/ton'),
}
