import { describe, expect, it, vi } from 'vitest'
import { expenseReportsApi } from './expenseReports'

vi.mock('./client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ id: 'report-1', status: 'pending_review' }),
    post: vi.fn().mockResolvedValue({ id: 'report-1', status: 'pending_review', revision: 1 }),
  },
}))

import { api } from './client'

describe('expenseReportsApi', () => {
  it('get() calls correct endpoint', async () => {
    await expenseReportsApi.get('campaign-123')
    expect(api.get).toHaveBeenCalledWith('/campaigns/campaign-123/expense-report')
  })

  it('submit() posts photos and comment', async () => {
    const body = { photos: ['/uploads/photo1.jpg'], comment: 'Чеки' }
    await expenseReportsApi.submit('campaign-123', body)
    expect(api.post).toHaveBeenCalledWith('/campaigns/campaign-123/expense-report', body)
  })

  it('submit() works without comment', async () => {
    const body = { photos: ['/uploads/photo1.jpg'] }
    await expenseReportsApi.submit('campaign-456', body)
    expect(api.post).toHaveBeenCalledWith('/campaigns/campaign-456/expense-report', body)
  })
})
