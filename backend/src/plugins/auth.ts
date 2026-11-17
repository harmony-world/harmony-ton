import fp from "fastify-plugin";
import crypto from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { consumeRateLimit, resetRateLimit } from "../services/rate-limit.js";
import { recalcUserTrustScore } from "../services/trust-score.js";
import { isOwnerUser } from "../constants/owner.js";
import { resolveLocale, t } from "../i18n/index.js";
import { writeAuditLog, currentEnv } from "../routes/admin/audit.js";

const PROFILE_FIELDS = ["tgUsername", "tgFirstName", "tgLastName", "tgPhotoUrl"] as const;
type ProfileFields = Record<(typeof PROFILE_FIELDS)[number], string | null>;

const AUTH_MAX_AGE_SECONDS = parseInt(process.env.AUTH_MAX_AGE_SECONDS ?? "3600", 10);
const AUTH_CACHE_TTL_MS = parseInt(process.env.AUTH_CACHE_TTL_MS ?? "300000", 10);
function authFailureRateLimitMax(): number {
  const value = parseInt(process.env.AUTH_FAILURE_RATE_LIMIT_MAX ?? "20", 10);
  return Number.isInteger(value) && value > 0 ? value : 20;
}

function authFailureRateLimitWindowMs(): number {
  const value = parseInt(process.env.AUTH_FAILURE_RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  return Number.isInteger(value) && value > 0 ? value : 60_000;
}

interface CachedUser {
  data: {
    id: string;
    tgUserId: bigint;
    tgUsername: string | null;
    tgFirstName: string | null;
    tgLastName: string | null;
    tgPhotoUrl: string | null;
    languageCode: string | null;
  };
  expiresAt: number;
}

const userCache = new Map<string, CachedUser>();

function getCachedUser(tgUserId: string): CachedUser["data"] | null {
  const entry = userCache.get(tgUserId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(tgUserId);
    return null;
  }
  return entry.data;
}

function setCachedUser(tgUserId: string, data: CachedUser["data"]): void {
  userCache.set(tgUserId, { data, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

export function clearAuthCache(): void {
  userCache.clear();
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_premium?: boolean;
  language_code?: string;
}

export interface RequestUser {
  id: string;
  tgUserId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  languageCode: string | null;
  kycLevel: number;
  role: string;
  isBlocked: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user: RequestUser;
  }
}

function validateInitData(initData: string, botToken: string): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("missing hash");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const expectedHashBuffer = Buffer.from(expectedHash, "hex");
  const actualHashBuffer = Buffer.from(hash, "hex");
  if (
    expectedHashBuffer.length !== actualHashBuffer.length ||
    !crypto.timingSafeEqual(expectedHashBuffer, actualHashBuffer)
  ) {
    throw new Error("invalid hash");
  }

  const authDate = params.get("auth_date");
  if (!authDate) throw new Error("missing auth_date");

  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(authDate, 10) > AUTH_MAX_AGE_SECONDS) {
    throw new Error("initData expired");
  }

  const userJson = params.get("user");
  if (!userJson) throw new Error("missing user");

  return JSON.parse(userJson) as TelegramUser;
}

export interface ServiceApiKeyEntry {
  label: string;
  userId: string;
}

const SERVICE_API_KEY_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedServiceApiKeys {
  keys: Map<string, ServiceApiKeyEntry>;
  rejected: string[];
}

export function parseServiceApiKeys(raw: string | undefined): ParsedServiceApiKeys {
  const keys = new Map<string, ServiceApiKeyEntry>();
  const rejected: string[] = [];
  if (!raw?.trim()) return { keys, rejected };

  for (const [index, entry] of raw.split(",").entries()) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(":").map((part) => part.trim());
    const [label, key, userId] =
      parts.length === 3 ? parts : parts.length === 2 ? [`key-${index + 1}`, parts[0], parts[1]] : [];

    if (!key || !userId) {
      rejected.push(`entry #${index + 1}: expected "label:key:userId"`);
      continue;
    }
    if (!SERVICE_API_KEY_PATTERN.test(key)) {
      rejected.push(`entry #${index + 1} (${label}): key must be 64 hex chars`);
      continue;
    }
    if (!UUID_PATTERN.test(userId)) {
      rejected.push(`entry #${index + 1} (${label}): userId must be a UUID`);
      continue;
    }
    if (keys.has(key)) {
      rejected.push(`entry #${index + 1} (${label}): duplicate key`);
      continue;
    }
    keys.set(key, { label: label as string, userId });
  }

  return { keys, rejected };
}

function authFailureKey(request: FastifyRequest): string {
  return `auth_failure:${request.ip}`;
}

export function isAdminPath(request: Pick<FastifyRequest, "routeOptions" | "url">): boolean {
  const matched = request.routeOptions.url;
  if (matched) return matched.startsWith("/admin/");
  return request.url.split("?")[0].startsWith("/admin/");
}

function sendUnauthorizedOrRateLimited(request: FastifyRequest, reply: FastifyReply) {
  const result = consumeRateLimit({
    key: authFailureKey(request),
    max: authFailureRateLimitMax(),
    windowMs: authFailureRateLimitWindowMs(),
  });
  if (!result.allowed) {
    return reply
      .code(429)
      .header("retry-after", String(result.retryAfterSeconds))
      .send({ error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds });
  }
  return reply.code(401).send({ error: "Unauthorized" });
}

const authPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorateRequest("user", null);

  const serviceApiKeys = parseServiceApiKeys(process.env.HARMONY_SERVICE_API_KEYS);
  for (const reason of serviceApiKeys.rejected) {
    app.log.warn({ reason }, "discarded malformed HARMONY_SERVICE_API_KEYS entry");
  }
  if (serviceApiKeys.keys.size > 0) {
    app.log.info(
      { count: serviceApiKeys.keys.size, labels: [...serviceApiKeys.keys.values()].map((e) => e.label) },
      "service API keys loaded",
    );
  }

  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      request.locale = resolveLocale(request.locale ?? request.headers["accept-language"]);
      request.t ??= (key, vars) => t(request.locale, key, vars);
      if (request.method === "GET" && request.routeOptions.url === "/health") return;
      if ((request.routeOptions.config as unknown as Record<string, unknown>)?.skipAuth) return;
      if (isAdminPath(request)) return;

      const authHeader = request.headers.authorization;

      if (authHeader?.startsWith("Bearer ")) {
        const entry = serviceApiKeys.keys.get(authHeader.slice(7).trim());
        if (!entry) {
          request.log.warn("invalid service API key");
          return sendUnauthorizedOrRateLimited(request, reply);
        }

        const dbUser = await app.prisma.user.findUnique({
          where: { id: entry.userId },
          select: {
            id: true,
            tgUserId: true,
            tgUsername: true,
            tgFirstName: true,
            tgLastName: true,
            tgPhotoUrl: true,
            languageCode: true,
            kycLevel: true,
            role: true,
            isBlocked: true,
          },
        });

        if (!dbUser) {
          request.log.error({ label: entry.label }, "service API key bound to a non-existent user");
          return sendUnauthorizedOrRateLimited(request, reply);
        }
        if (dbUser.isBlocked && !isOwnerUser(dbUser.tgUserId)) {
          return reply.code(403).send({ error: "User is blocked" });
        }

        request.locale = resolveLocale(dbUser.languageCode);
        request.user = {
          id: dbUser.id,
          tgUserId: dbUser.tgUserId,
          username: dbUser.tgUsername,
          firstName: dbUser.tgFirstName,
          lastName: dbUser.tgLastName,
          photoUrl: dbUser.tgPhotoUrl,
          languageCode: request.locale,
          kycLevel: dbUser.kycLevel,
          role: dbUser.role,
          isBlocked: dbUser.isBlocked,
        };
        resetRateLimit(authFailureKey(request));
        return;
      }

      if (!authHeader?.startsWith("tma ")) {
        return sendUnauthorizedOrRateLimited(request, reply);
      }

      const initData = authHeader.slice(4);
      const botToken = process.env.BOT_TOKEN;
      if (!botToken) throw new Error("BOT_TOKEN not set");

      let tgUser: TelegramUser;
      try {
        tgUser = validateInitData(initData, botToken);
      } catch (e) {
        request.log.warn({ err: (e as Error).message, initDataLen: initData.length }, "initData validation failed");
        return sendUnauthorizedOrRateLimited(request, reply);
      }

      resetRateLimit(authFailureKey(request));

      const tgIdStr = String(tgUser.id);
      const tgIsPremium = Boolean(tgUser.is_premium);
      const languageCode = resolveLocale(tgUser.language_code ?? request.locale);
      request.locale = languageCode;
      const cached = getCachedUser(tgIdStr);
      if (cached) {
        const freshClaims = await app.prisma.user.findUnique?.({
          where: { id: cached.id },
          select: { kycLevel: true, role: true, isBlocked: true, tgIsPremium: true },
        });
        if (
          !freshClaims ||
          typeof freshClaims.kycLevel !== "number" ||
          typeof freshClaims.role !== "string" ||
          typeof freshClaims.isBlocked !== "boolean" ||
          typeof freshClaims.tgIsPremium !== "boolean"
        ) {
          userCache.delete(tgIdStr);
        } else {
          if (freshClaims.isBlocked && !isOwnerUser(cached.tgUserId)) {
            return reply.code(403).send({ error: "User is blocked" });
          }
          request.user = {
            id: cached.id,
            tgUserId: cached.tgUserId,
            username: cached.tgUsername,
            firstName: cached.tgFirstName,
            lastName: cached.tgLastName,
            photoUrl: cached.tgPhotoUrl,
            languageCode,
            kycLevel: freshClaims.kycLevel,
            role: freshClaims.role,
            isBlocked: freshClaims.isBlocked,
          };
          if (freshClaims.tgIsPremium !== tgIsPremium || cached.languageCode !== languageCode) {
            await app.prisma.user.update({
              where: { id: cached.id },
              data: { tgIsPremium, languageCode },
              select: { id: true },
            });
            setCachedUser(tgIdStr, { ...cached, languageCode });
          }
          if (freshClaims.tgIsPremium !== tgIsPremium) {
            await recalcUserTrustScore(app.prisma, cached.id);
          }
          return;
        }
      }

      const existing = await app.prisma.user.findUnique({
        where: { tgUserId: BigInt(tgUser.id) },
        select: {
          id: true,
          tgUsername: true,
          tgFirstName: true,
          tgLastName: true,
          tgPhotoUrl: true,
          tgIsPremium: true,
          role: true,
        },
      });
      const ownerFlag = isOwnerUser(BigInt(tgUser.id));
      const incoming: ProfileFields = {
        tgUsername: tgUser.username ?? null,
        tgFirstName: tgUser.first_name ?? null,
        tgLastName: tgUser.last_name ?? null,
        tgPhotoUrl: tgUser.photo_url ?? null,
      };
      if (!incoming.tgFirstName && existing?.tgFirstName) {
        incoming.tgFirstName = existing.tgFirstName;
      }
      const profileChanges = existing
        ? PROFILE_FIELDS.filter((field) => existing[field] !== incoming[field])
        : [];
      const dbUser = await app.prisma.user.upsert({
        where: { tgUserId: BigInt(tgUser.id) },
        create: {
          tgUserId: BigInt(tgUser.id),
          ...incoming,
          languageCode,
          tgIsPremium,
          ...(ownerFlag ? { role: "owner" } : {}),
        },
        update: {
          ...Object.fromEntries(profileChanges.map((field) => [field, incoming[field]])),
          languageCode,
          tgIsPremium,
          ...(ownerFlag ? { role: "owner" } : {}),
        },
        select: {
          id: true,
          tgUserId: true,
          tgUsername: true,
          tgFirstName: true,
          tgLastName: true,
          tgPhotoUrl: true,
          languageCode: true,
          kycLevel: true,
          role: true,
          isBlocked: true,
          tgIsPremium: true,
        },
      });

      if (existing && profileChanges.length > 0 && existing.role !== "donor") {
        try {
          await writeAuditLog(app.prisma, {
            actorId: existing.id,
            action: "user.profile_login_change",
            targetType: "user",
            targetId: existing.id,
            env: currentEnv(),
            ipAddress: request.ip,
            details: {
              role: existing.role,
              fields: Object.fromEntries(
                profileChanges.map((field) => [field, { from: existing[field], to: incoming[field] }]),
              ),
            },
          });
        } catch (e) {
          request.log.warn({ err: (e as Error).message }, "profile change audit failed");
        }
      }

      if (dbUser.isBlocked && !ownerFlag) {
        return reply.code(403).send({ error: "User is blocked" });
      }

      const userData = {
        id: dbUser.id,
        tgUserId: dbUser.tgUserId,
        tgUsername: dbUser.tgUsername,
        tgFirstName: dbUser.tgFirstName,
        tgLastName: dbUser.tgLastName,
        tgPhotoUrl: dbUser.tgPhotoUrl,
        languageCode: dbUser.languageCode,
      };
      setCachedUser(tgIdStr, userData);

      if (!existing || existing.tgIsPremium !== dbUser.tgIsPremium) {
        await recalcUserTrustScore(app.prisma, dbUser.id);
      }

      request.user = {
        id: userData.id,
        tgUserId: userData.tgUserId,
        username: userData.tgUsername,
        firstName: userData.tgFirstName,
        lastName: userData.tgLastName,
        photoUrl: userData.tgPhotoUrl,
        languageCode: userData.languageCode,
        kycLevel: dbUser.kycLevel,
        role: dbUser.role,
        isBlocked: dbUser.isBlocked,
      };
    }
  );
});

export default authPlugin;
