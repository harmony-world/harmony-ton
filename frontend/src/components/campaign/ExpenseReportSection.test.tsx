// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseReport } from '../../api/expenseReports'
import i18n from '../../i18n'
import { ExpenseReportSection } from './ExpenseReportSection'

const useExpenseReport = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useApi', () => ({ useExpenseReport }))

const expenseReportPenaltyApplies = vi.hoisted(() => vi.fn((goal: number) => goal >= 50))

vi.mock('../../utils/expenseReportPenalty', () => ({ expenseReportPenaltyApplies }))

function mockReport(report: ExpenseReport | null) {
  useExpenseReport.mockReturnValue({ data: report, isLoading: false, isError: false })
}

const missingReport: ExpenseReport = {
  id: 'report-1',
  status: 'missing',
  photos: [],
  comment: null,
  ratingDelta: 0,
  revision: 0,
  reviewedAt: null,
  createdAt: '2026-09-25T15:24:32.418Z',
}

function renderSection(isCreator = true, raisedAmountUsd = 100) {
  return render(
    <ExpenseReportSection
      campaignId="campaign-1"
      isCreator={isCreator}
      isPublic
      channelId={null}
      raisedAmountUsd={raisedAmountUsd}
    />,
  )
}

afterEach(cleanup)

describe('ExpenseReportSection with a missing report', () => {
  it('offers the creator the upload button without requiring a tap', async () => {
    await i18n.changeLanguage('ru')
    mockReport(missingReport)

    renderSection()

    const panel = screen
      .getByRole('button', { name: 'Загрузить отчёт' })
      .closest('div[style*="max-height"]')
    expect(panel).not.toBeNull()
    expect((panel as HTMLElement).style.maxHeight).not.toBe('0px')
  })

  it('calls it a first upload, not a re-upload', async () => {
    await i18n.changeLanguage('ru')
    mockReport(missingReport)

    renderSection()

    expect(screen.queryByRole('button', { name: 'Загрузить заново' })).toBeNull()
  })

  it('says re-upload once something was actually uploaded', async () => {
    await i18n.changeLanguage('ru')
    mockReport({ ...missingReport, status: 'rejected', photos: ['/uploads/a.jpg'] })

    renderSection()

    expect(screen.getByRole('button', { name: 'Загрузить заново' })).toBeTruthy()
  })

  it('shows no upload button to anyone but the creator', async () => {
    await i18n.changeLanguage('ru')
    mockReport(missingReport)

    renderSection(false)

    expect(screen.queryByRole('button', { name: 'Загрузить отчёт' })).toBeNull()
  })
})

describe('ExpenseReportSection hint before the first upload', () => {
  it('threatens a rating drop when the campaign can be fined', async () => {
    await i18n.changeLanguage('ru')
    mockReport(null)

    renderSection(true, 100)

    expect(screen.getByText(/может снизить рейтинг/)).toBeTruthy()
  })

  it('shows nothing below the threshold when there is no report: none is expected or accepted', async () => {
    await i18n.changeLanguage('ru')
    mockReport(null)

    const { container } = renderSection(true, 49)

    expect(container.textContent).toBe('')
  })

  it('still shows a report that already exists below the threshold', async () => {
    await i18n.changeLanguage('ru')
    mockReport({ ...missingReport, status: 'approved', photos: ['/uploads/a.jpg'] })

    renderSection(false, 10)

    expect(screen.getByText(i18n.t('campaign:expense.title'))).toBeTruthy()
  })
})
