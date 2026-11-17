import type { FastifyInstance } from "fastify";
import { registerUserWalletRoutes } from "./users-wallet.js";
import { registerPublicUserRoutes } from "./users-public.js";
import {
  computeEmojiStatusReadiness,
  setUserEmojiStatus,
} from "../services/emoji-status.js";
import { TERMS_VERSION } from "../constants/legal.js";

interface UpdateProfilePrivacyBody {
  isPublic: boolean;
}

export async function userRoutes(app: FastifyInstance) {
  registerUserWalletRoutes(app);
  registerPublicUserRoutes(app);
  app.get("/users/me", async (request, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        tgUserId: true,
        tgUsername: true,
        tgFirstName: true,
        tgLastName: true,
        tgPhotoUrl: true,
        languageCode: true,
        tgIsPremium: true,
        walletAddress: true,
        walletFriendly: true,
        walletConnected: true,
        kycLevel: true,
        kycStatus: true,
        role: true,
        trustScore: true,
        donorStatus: true,
        totalDonatedUsd: true,
        donationCount: true,
        isPublic: true,
        emojiStatusEnabled: true,
        emojiStatusEmojiId: true,
        emojiStatusGrantedAt: true,
        termsVersion: true,
        termsAcceptedAt: true,
      },
    });

    if (!user) return reply.code(404).send({ error: "User not found" });

    return {
      id: user.id,
      tgUserId: user.tgUserId.toString(),
      username: user.tgUsername,
      firstName: user.tgFirstName,
      lastName: user.tgLastName,
      photoUrl: user.tgPhotoUrl,
      languageCode: user.languageCode,
      isPremium: user.tgIsPremium,
      walletAddress: user.walletAddress,
      walletFriendly: user.walletFriendly,
      walletConnected: user.walletConnected,
      kycLevel: user.kycLevel,
      kycStatus: user.kycStatus,
      role: user.role,
      trustScore: user.trustScore,
      donorStatus: user.donorStatus,
      totalDonatedUsd: Number(user.totalDonatedUsd),
      donationCount: user.donationCount,
      isPublic: user.isPublic,
      emojiStatus: {
        enabled: user.emojiStatusEnabled,
        emojiId: user.emojiStatusEmojiId,
        grantedAt: user.emojiStatusGrantedAt?.toISOString() ?? null,
        premiumRequired: !user.tgIsPremium,
        ready: computeEmojiStatusReadiness(),
      },
      terms: {
        currentVersion: TERMS_VERSION,
        acceptedVersion: user.termsVersion,
        acceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
      },
    };
  });

  app.post<{ Body: { version: string } }>(
    "/users/me/terms",
    {
      schema: {
        body: {
          type: "object",
          required: ["version"],
          properties: { version: { type: "string", maxLength: 20 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (request.body.version !== TERMS_VERSION) {
        return reply.code(409).send({ error: "TERMS_VERSION_OUTDATED", currentVersion: TERMS_VERSION });
      }
      const user = await app.prisma.user.update({
        where: { id: request.user.id },
        data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
        select: { termsVersion: true, termsAcceptedAt: true },
      });
      return {
        currentVersion: TERMS_VERSION,
        acceptedVersion: user.termsVersion,
        acceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
      };
    },
  );

  app.put<{ Body: UpdateProfilePrivacyBody }>(
    "/users/me/privacy",
    {
      schema: {
        body: {
          type: "object",
          required: ["isPublic"],
          properties: { isPublic: { type: "boolean" } },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const user = await app.prisma.user.update({
        where: { id: request.user.id },
        data: { isPublic: request.body.isPublic },
        select: { id: true, isPublic: true },
      });

      return user;
    },
  );

  app.put<{ Body: { enabled: boolean } }>(
    "/users/me/emoji-status",
    {
      schema: {
        body: {
          type: "object",
          required: ["enabled"],
          properties: { enabled: { type: "boolean" } },
        },
      },
    },
    async (request, reply) => {
      const { enabled } = request.body;
      const result = await setUserEmojiStatus(app, request.user.id, enabled, request.locale);
      if (!result.ok) {
        const code = result.error === "PREMIUM_REQUIRED"
          ? 403
          : result.error === "NOT_READY"
            ? 409
            : result.error === "BOT_UNAVAILABLE"
              ? 503
              : result.error === "PERMISSION_REVOKED"
                ? 403
                : 502;
        return reply.code(code).send({ error: result.error, message: result.message });
      }
      return {
        status: result.enabled ? "on" : "off",
        emojiId: result.emojiId,
        level: result.level,
      };
    },
  );

}
