// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

const list = vi.fn()

vi.mock('../api/campaigns', () => ({
  campaignsApi: {
    list: (...args: unknown[]) => list(...args),
  },
}))

describe('useCampaigns — feed refresh', () => {
  beforeEach(() => {
    list.mockReset()
    list.mockResolvedValue({ data: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps refetching the feed while it stays mounted', async () => {
    const { useCampaigns } = await import('./useApi')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children)

    renderHook(() => useCampaigns(), { wrapper })
    await vi.advanceTimersByTimeAsync(0)
    expect(list).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(61_000)
    expect(list.mock.calls.length).toBeGreaterThan(1)

    client.clear()
  })
})
