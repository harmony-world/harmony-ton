import { api, ApiError } from './client'

export type ExpenseReportStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'missing'

export interface ExpenseReport {
  id: string
  status: ExpenseReportStatus
  photos: string[]
  comment: string | null
  ratingDelta: number
  revision: number
  reviewedAt: string | null
  createdAt: string
  hasPhotos?: boolean
  moderationNote?: string
}

export interface SubmitExpenseReportBody {
  photos: string[]
  comment?: string
}

export interface SubmitExpenseReportResponse {
  id: string
  status: string
  revision: number
}

export const expenseReportsApi = {
  get: async (campaignId: string): Promise<ExpenseReport | null> => {
    try {
      return await api.get<ExpenseReport>(`/campaigns/${campaignId}/expense-report`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  submit: (campaignId: string, body: SubmitExpenseReportBody) =>
    api.post<SubmitExpenseReportResponse>(`/campaigns/${campaignId}/expense-report`, body),
}
