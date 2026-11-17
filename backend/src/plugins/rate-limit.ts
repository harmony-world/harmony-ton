import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { consumeRateLimit } from "../services/rate-limit.js";
import { isCampaignRateLimitWhitelisted } from "../constants/campaign-rate-limit.js";

type RouteRateLimitName =
  | "uploads"
  | "support"
  | "kyc_token"
  | "kyc_webhook_sumsub"
  | "kyc_webhook_didit"
  | "admin_bot_login"
  | "donation_intents"
  | "channel_info"
  | "campaign_create"
  | "wallet_bind"
  | "wallet_challenge";

export interface RouteRateLimitRule {
  name: RouteRateLimitName;
  method: string;
  route: string;
  max: number;
  windowMs: number;
  whitelistBoost?: true;
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function whitelistMultiplier(): number {
  return envInt("RATE_LIMIT_WHITELIST_MULTIPLIER", 5);
}

export function effectiveMax(rule: RouteRateLimitRule, request: FastifyRequest): number {
  if (!rule.whitelistBoost) return rule.max;
  if (!isCampaignRateLimitWhitelisted(request.user?.username)) return rule.max;
  return rule.max * whitelistMultiplier();
}

function buildRules(): RouteRateLimitRule[] {
  return [
    {
      name: "uploads",
      method: "POST",
      route: "/uploads/image",
      max: envInt("RATE_LIMIT_UPLOADS_MAX", 20),
      windowMs: envInt("RATE_LIMIT_UPLOADS_WINDOW_MS", 60_000),
      whitelistBoost: true,
    },
    {
      name: "uploads",
      method: "DELETE",
      route: "/uploads/image",
      max: envInt("RATE_LIMIT_UPLOADS_DELETE_MAX", 30),
      windowMs: envInt("RATE_LIMIT_UPLOADS_DELETE_WINDOW_MS", 60_000),
      whitelistBoost: true,
    },
    {
      name: "support",
      method: "POST",
      route: "/support/feedback",
      max: envInt("RATE_LIMIT_SUPPORT_MAX", 5),
      windowMs: envInt("RATE_LIMIT_SUPPORT_WINDOW_MS", 10 * 60_000),
    },
    {
      name: "kyc_token",
      method: "POST",
      route: "/kyc/sumsub/token",
      max: envInt("RATE_LIMIT_KYC_TOKEN_MAX", 5),
      windowMs: envInt("RATE_LIMIT_KYC_TOKEN_WINDOW_MS", 10 * 60_000),
    },
    {
      name: "kyc_token",
      method: "POST",
      route: "/kyc/session",
      max: envInt("RATE_LIMIT_KYC_TOKEN_MAX", 5),
      windowMs: envInt("RATE_LIMIT_KYC_TOKEN_WINDOW_MS", 10 * 60_000),
    },
    {
      name: "kyc_webhook_sumsub",
      method: "POST",
      route: "/kyc/sumsub/webhook",
      max: envInt("RATE_LIMIT_WEBHOOK_MAX", 60),
      windowMs: envInt("RATE_LIMIT_WEBHOOK_WINDOW_MS", 60_000),
    },
    {
      name: "kyc_webhook_didit",
      method: "POST",
      route: "/kyc/didit/webhook",
      max: envInt("RATE_LIMIT_WEBHOOK_MAX", 60),
      windowMs: envInt("RATE_LIMIT_WEBHOOK_WINDOW_MS", 60_000),
    },
    {
      name: "admin_bot_login",
      method: "POST",
      route: "/admin/auth/bot/start",
      max: envInt("RATE_LIMIT_ADMIN_LOGIN_MAX", 10),
      windowMs: envInt("RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS", 60_000),
    },
    {
      name: "donation_intents",
      method: "POST",
      route: "/campaigns/:id/donation-intents",
      max: envInt("RATE_LIMIT_DONATION_INTENTS_MAX", 30),
      windowMs: envInt("RATE_LIMIT_DONATION_INTENTS_WINDOW_MS", 60_000),
    },
    {
      name: "channel_info",
      method: "GET",
      route: "/channels/info",
      max: envInt("RATE_LIMIT_CHANNEL_INFO_MAX", 30),
      windowMs: envInt("RATE_LIMIT_CHANNEL_INFO_WINDOW_MS", 60_000),
    },
    {
      name: "campaign_create",
      method: "POST",
      route: "/campaigns",
      max: envInt("RATE_LIMIT_CAMPAIGN_CREATE_MAX", 10),
      windowMs: envInt("RATE_LIMIT_CAMPAIGN_CREATE_WINDOW_MS", 60_000),
      whitelistBoost: true,
    },
    {
      name: "wallet_bind",
      method: "PUT",
      route: "/users/me/wallet",
      max: envInt("RATE_LIMIT_WALLET_BIND_MAX", 5),
      windowMs: envInt("RATE_LIMIT_WALLET_BIND_WINDOW_MS", 60_000),
    },
    {
      name: "wallet_challenge",
      method: "POST",
      route: "/users/me/wallet/challenge",
      max: envInt("RATE_LIMIT_WALLET_CHALLENGE_MAX", 10),
      windowMs: envInt("RATE_LIMIT_WALLET_CHALLENGE_WINDOW_MS", 60_000),
    },
  ];
}

function routeKey(request: FastifyRequest): string {
  return `${request.method}:${request.routeOptions.url ?? request.url}`;
}

function clientKey(request: FastifyRequest): string {
  const userId = request.user?.id;
  return userId ? `user:${userId}` : `ip:${request.ip}`;
}

function sendRateLimited(reply: FastifyReply, retryAfterSeconds: number) {
  return reply
    .code(429)
    .header("retry-after", String(retryAfterSeconds))
    .send({ error: "rate_limited", retryAfterSeconds });
}

const rateLimitPlugin: FastifyPluginAsync = fp(async (app) => {
  const rules = new Map<string, RouteRateLimitRule>();
  for (const rule of buildRules()) {
    rules.set(`${rule.method}:${rule.route}`, rule);
  }

  app.addHook("preHandler", async (request, reply) => {
    const rule = rules.get(routeKey(request));
    if (!rule) return;

    const result = consumeRateLimit({
      key: `route:${rule.name}:${clientKey(request)}`,
      max: effectiveMax(rule, request),
      windowMs: rule.windowMs,
    });

    if (!result.allowed) {
      return sendRateLimited(reply, result.retryAfterSeconds);
    }
  });
});

export default rateLimitPlugin;
