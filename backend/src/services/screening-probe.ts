import type { FastifyBaseLogger } from "fastify";

export type ScreeningProbeStatus = "ok" | "degraded" | "unknown";

export type ScreeningProbeState = {
  status: ScreeningProbeStatus;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
};

export function getScreeningProbeState(): ScreeningProbeState {
  return { status: "unknown", lastCheckedAt: null, lastSuccessAt: null, consecutiveFailures: 0 };
}

export function startScreeningProbe(_logger?: FastifyBaseLogger, _intervalMs?: number): NodeJS.Timeout {
  const timer = setInterval(() => undefined, 24 * 60 * 60 * 1000);
  timer.unref();
  return timer;
}
