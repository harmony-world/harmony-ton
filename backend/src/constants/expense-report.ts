export const EXPENSE_REPORT_MIN_RAISED_USD = process.env.TON_NETWORK === "testnet" ? 0 : 50;

export function expenseReportExpected(raisedAmountUsd: unknown): boolean {
  return Number(raisedAmountUsd) >= EXPENSE_REPORT_MIN_RAISED_USD;
}
