import { TON_NETWORK } from './env'

export const EXPENSE_REPORT_MIN_RAISED_USD = TON_NETWORK === 'mainnet' ? 50 : 0

export function expenseReportPenaltyApplies(
  raisedAmountUsd: number,
  minRaisedUsd: number = EXPENSE_REPORT_MIN_RAISED_USD,
): boolean {
  return raisedAmountUsd >= minRaisedUsd
}
