export function deriveDisplayStatus(
  status: string,
  deadline: Date | null,
  raisedAmountUsd: unknown,
  raisedAmountToken: unknown,
): string {
  const isLive = status === "active" || status === "approved";
  if (isLive && deadline && deadline.getTime() <= Date.now()) {
    const hasRaised =
      (raisedAmountUsd != null && Number(raisedAmountUsd) > 0) ||
      (raisedAmountToken != null && BigInt(String(raisedAmountToken)) > 0n);
    return hasRaised ? "expired_partial" : "expired_no_donations";
  }
  return status;
}
