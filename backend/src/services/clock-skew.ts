let lastSkewMs: number | null = null;
let lastCheckedAt = 0;

export function recordExternalDate(header: string | null | undefined, receivedAt = Date.now()): void {
  if (!header) return;
  const remoteMs = Date.parse(header);
  if (!Number.isFinite(remoteMs)) return;
  lastSkewMs = receivedAt - remoteMs;
  lastCheckedAt = receivedAt;
}

export function getClockSkewMs(): number | null {
  return lastSkewMs;
}

export function getClockSkewCheckedAt(): number {
  return lastCheckedAt;
}

export function _resetForTest(): void {
  lastSkewMs = null;
  lastCheckedAt = 0;
}
