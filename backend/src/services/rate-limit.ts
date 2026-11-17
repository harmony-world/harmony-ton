export interface RateLimitPolicy {
  key: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 60_000;
setInterval(() => cleanup(Date.now()), CLEANUP_INTERVAL_MS).unref();

function nowMs(): number {
  return Date.now();
}

function cleanup(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function consumeRateLimit(policy: RateLimitPolicy): RateLimitResult {
  const now = nowMs();
  cleanup(now);

  const existing = buckets.get(policy.key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + policy.windowMs };

  bucket.count += 1;
  buckets.set(policy.key, bucket);

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    allowed: bucket.count <= policy.max,
    remaining: Math.max(0, policy.max - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function clearRateLimits(): void {
  buckets.clear();
}
