import { describe, expect, it } from 'vitest'
import { expenseReportPenaltyApplies } from './expenseReportPenalty'

describe('expenseReportPenaltyApplies', () => {
  it('warns an amount that sits exactly on the threshold', () => {
    expect(expenseReportPenaltyApplies(50, 50)).toBe(true)
  })

  it('stays silent one dollar below the threshold', () => {
    expect(expenseReportPenaltyApplies(49, 50)).toBe(false)
  })

  it('warns above the threshold', () => {
    expect(expenseReportPenaltyApplies(100, 50)).toBe(true)
  })

  it('stays silent for a token amount, whatever the goal was', () => {
    expect(expenseReportPenaltyApplies(10, 50)).toBe(false)
  })

  it('warns every campaign when the threshold is zero, as on testnet', () => {
    expect(expenseReportPenaltyApplies(0, 0)).toBe(true)
  })
})
