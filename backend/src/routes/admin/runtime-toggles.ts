import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

let toggleCache: Map<string, unknown> = new Map();
let lastRefresh = 0;
const CACHE_TTL_MS = 30_000;
let prismaRef: FastifyInstance["prisma"] | null = null;

export function initRuntimeToggles(app: FastifyInstance) {
  prismaRef = app.prisma;
}

async function refreshCache(): Promise<void> {
  if (!prismaRef) return;
  const now = Date.now();
  if (now - lastRefresh < CACHE_TTL_MS) return;
  try {
    const settings = await prismaRef.runtimeSetting.findMany();
    const newCache = new Map<string, unknown>();
    for (const s of settings) {
      newCache.set(s.key, s.value);
    }
    toggleCache = newCache;
    lastRefresh = now;
  } catch {
  }
}

export function getToggle(key: string): unknown {
  return toggleCache.get(key);
}

export function setCachedToggle(key: string, value: unknown): void {
  toggleCache.set(key, value);
  lastRefresh = Date.now();
}

export function deleteCachedToggle(key: string): void {
  toggleCache.delete(key);
  lastRefresh = Date.now();
}

export function isMaintenanceMode(): boolean {
  return toggleCache.get("maintenance_mode") === true;
}

export function isCampaignCreationDisabled(): boolean {
  return toggleCache.get("disable_campaign_creation") === true;
}

export function isDonationsDisabled(): boolean {
  return toggleCache.get("disable_donations") === true;
}

export async function maintenanceGuard(request: FastifyRequest, reply: FastifyReply) {
  await refreshCache();
  if (isMaintenanceMode()) {
    if (
      !request.routeOptions.url?.startsWith("/admin/") &&
      request.routeOptions.url !== "/api/health"
    ) {
      return reply.code(503).send({
        error: "Service temporarily unavailable",
        reason: "maintenance",
      });
    }
  }
}
