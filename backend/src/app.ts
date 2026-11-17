import Fastify from "fastify";
import cors, { type OriginFunction } from "@fastify/cors";
import helmet from "@fastify/helmet";
import { healthRoutes } from "./routes/health.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { kycRoutes } from "./routes/kyc.js";
import { priceRoutes } from "./routes/price.js";
import { channelRoutes } from "./routes/channels.js";
import { userRoutes } from "./routes/users.js";
import { uploadRoutes } from "./routes/uploads.js";
import { supportRoutes } from "./routes/support.js";
import { walletRoutes } from "./routes/wallets.js";
import { expenseReportRoutes } from "./routes/expense-reports.js";
import { adminRoutes } from "./routes/admin/index.js";
import { frontendErrorRoutes } from "./routes/frontend-errors.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { shareRoutes } from "./routes/share.js";
import { maintenanceGuard } from "./routes/admin/runtime-toggles.js";

import prismaPlugin from "./plugins/prisma.js";
import i18nPlugin from "./plugins/i18n.js";
import authPlugin from "./plugins/auth.js";
import botPlugin from "./plugins/bot.js";
import sumsubPlugin from "./plugins/sumsub.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import { startPricePolling, stopPricePolling } from "./services/price.js";
import {
  resolveUploadsDir,
  startUploadCleanup,
  stopUploadCleanup,
} from "./services/upload-cleanup.js";
import { retryStuckDeploys } from "./services/campaign-deploy.js";
import { installErrorHandler } from "./plugins/errors.js";
import { cleanupExpiredPendingRejects } from "./services/moderation-cleanup.js";

type CorsOriginOption =
  | boolean
  | string[]
  | OriginFunction;

export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildCorsOriginOption(): CorsOriginOption {
  const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
  if (allowedOrigins.length > 0) return allowedOrigins;
  if (process.env.NODE_ENV !== "production") return true;

  return (origin, callback) => {
    callback(null, !origin);
  };
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  installErrorHandler(app);

  await app.register(helmet);
  await app.register(cors, {
    origin: buildCorsOriginOption(),
  });

  await app.register(prismaPlugin);
  await app.register(i18nPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(sumsubPlugin);
  await app.register(botPlugin);

  app.addHook("onRequest", maintenanceGuard);

  await app.register(healthRoutes);
  await app.register(frontendErrorRoutes);
  await app.register(campaignRoutes);
  await app.register(kycRoutes);
  await app.register(priceRoutes);
  await app.register(channelRoutes);
  await app.register(userRoutes);
  await app.register(uploadRoutes);
  await app.register(supportRoutes);
  await app.register(walletRoutes);
  await app.register(expenseReportRoutes);
  await app.register(adminRoutes);
  await app.register(leaderboardRoutes);
  await app.register(shareRoutes);

  app.addHook("onReady", async () => {
    startPricePolling();
    startUploadCleanup({
      prisma: app.prisma,
      uploadsDir: resolveUploadsDir(),
      logger: app.log,
    });
    const retried = await retryStuckDeploys(app);
    if (retried > 0) {
      app.log.info({ count: retried }, "retried stuck campaign deploys on startup");
    }
    const cleaned = await cleanupExpiredPendingRejects(app.prisma);
    if (cleaned > 0) {
      app.log.info({ count: cleaned }, "cleaned up expired pending moderation rejects");
    }
  });
  app.addHook("onClose", () => {
    stopPricePolling();
    stopUploadCleanup();
  });

  return app;
}
