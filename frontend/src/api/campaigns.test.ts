import { describe, expect, it, vi } from 'vitest'
import { campaignsApi } from './campaigns'

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
    post: vi.fn().mockResolvedValue({ id: 'test-id' }),
  },
}))

import { api } from './client'

describe('campaignsApi', () => {
  it('list() calls GET /campaigns with no params by default', async () => {
    await campaignsApi.list()
    expect(api.get).toHaveBeenCalledWith('/campaigns?lang=ru')
  })

  it('list() builds query string from filters', async () => {
    await campaignsApi.list({ category: 'education', limit: 10, sort: 'trustScore' })
    const call = vi.mocked(api.get).mock.calls.at(-1)![0] as string
    expect(call).toContain('category=education')
    expect(call).toContain('limit=10')
    expect(call).toContain('sort=trustScore')
  })

  it('list() includes cursor in query', async () => {
    await campaignsApi.list({ cursor: 'abc123' })
    const call = vi.mocked(api.get).mock.calls.at(-1)![0] as string
    expect(call).toContain('cursor=abc123')
  })

  it('getById() calls correct endpoint', async () => {
    await campaignsApi.getById('camp-001')
    expect(api.get).toHaveBeenCalledWith('/campaigns/camp-001?lang=ru')
  })

  it('create() posts campaign body', async () => {
    const body = {
      title: 'Test',
      story: 'Story',
      category: 'education' as const,
      goal_amount_usd: 1000,
      deadline: '2026-12-31',
      payout_address: '0:abc',
      organizer_type: 'personal' as const,
      photos: ['/uploads/11111111-1111-4111-8111-111111111111.jpg'],
      photos_illustrative: false,
    }
    await campaignsApi.create(body)
    expect(api.post).toHaveBeenCalledWith('/campaigns', body)
  })

  it('retryDeploy() calls POST with empty body', async () => {
    await campaignsApi.retryDeploy('camp-001')
    expect(api.post).toHaveBeenCalledWith('/campaigns/camp-001/retry-deploy', {})
  })

  it('channelInfo() encodes link parameter', async () => {
    await campaignsApi.channelInfo('https://t.me/test')
    const call = vi.mocked(api.get).mock.calls.at(-1)![0] as string
    expect(call).toContain('link=https%3A%2F%2Ft.me%2Ftest')
  })

  it('verifyChannel() posts link', async () => {
    await campaignsApi.verifyChannel('https://t.me/test')
    expect(api.post).toHaveBeenCalledWith('/channels/verify', { link: 'https://t.me/test' })
  })
})
