import type { FastifyInstance } from "fastify";
import {
  areAllEmojiStatusIdsConfigured,
  getDonorLevelForUsd,
  getEmojiStatusIdForLevel,
} from "../config/emoji-status.js";
import { t, type Locale } from "../i18n/index.js";

export type EmojiStatusResult =
  | { ok: true; enabled: boolean; emojiId: string | null; level: number }
  | { ok: false; error: "PREMIUM_REQUIRED" | "NOT_READY" | "BOT_UNAVAILABLE" | "TELEGRAM_ERROR" | "PERMISSION_REVOKED"; message: string };

type UserForStatus = {
  id: string;
  tgUserId: bigint;
  tgIsPremium: boolean;
  totalDonatedUsd: unknown;
};

async function fetchUser(app: FastifyInstance, userId: string): Promise<UserForStatus | null> {
  return app.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tgUserId: true,
      tgIsPremium: true,
      totalDonatedUsd: true,
    },
  });
}

export async function setUserEmojiStatus(
  app: FastifyInstance,
  userId: string,
  enabled: boolean,
  locale?: Locale,
): Promise<EmojiStatusResult> {
  const user = await fetchUser(app, userId);
  if (!user) return { ok: false, error: "TELEGRAM_ERROR", message: "User not found" };

  if (!user.tgIsPremium) {
    return {
      ok: false,
      error: "PREMIUM_REQUIRED",
      message: t(locale, "emoji.premiumRequired"),
    };
  }

  if (!app.bot) {
    return { ok: false, error: "BOT_UNAVAILABLE", message: t(locale, "emoji.botUnavailable") };
  }

  const now = new Date();

  if (!enabled) {
    try {
      await app.bot.api.setUserEmojiStatus(Number(user.tgUserId));
    } catch (err) {
      const code = (err as { error_code?: number }).error_code;
      if (code === 403) {
        app.log.info({ userId }, "emoji status already revoked by user, clearing DB only");
      } else {
        app.log.error({ err, userId }, "failed to clear emoji status via Telegram");
        return {
          ok: false,
          error: "TELEGRAM_ERROR",
          message: (err as Error).message ?? t(locale, "emoji.clearTelegramError"),
        };
      }
    }
    await app.prisma.user.update({
      where: { id: userId },
      data: {
        emojiStatusEnabled: false,
        emojiStatusEmojiId: null,
        emojiStatusGrantedAt: null,
      },
    });
    return { ok: true, enabled: false, emojiId: null, level: 0 };
  }

  if (!areAllEmojiStatusIdsConfigured()) {
    return {
      ok: false,
      error: "NOT_READY",
      message: t(locale, "emoji.notReady"),
    };
  }

  const totalUsd = Number(user.totalDonatedUsd);
  const level = getDonorLevelForUsd(Number.isFinite(totalUsd) ? totalUsd : 0);
  const emojiId = getEmojiStatusIdForLevel(level);
  if (!emojiId) {
    return {
      ok: false,
      error: "NOT_READY",
      message: t(locale, "emoji.levelNotReady"),
    };
  }

  try {
    await app.bot.api.setUserEmojiStatus(Number(user.tgUserId), {
      emoji_status_custom_emoji_id: emojiId,
    });
  } catch (err) {
    const code = (err as { error_code?: number }).error_code;
    if (code === 403) {
      app.log.info({ userId, emojiId, level }, "emoji status permission revoked, user must re-grant");
      return {
        ok: false,
        error: "PERMISSION_REVOKED",
        message: t(locale, "emoji.permissionRevoked"),
      };
    }
    app.log.error({ err, userId, emojiId, level }, "failed to set emoji status via Telegram");
    return {
      ok: false,
      error: "TELEGRAM_ERROR",
      message: (err as Error).message ?? t(locale, "emoji.setTelegramError"),
    };
  }

  await app.prisma.user.update({
    where: { id: userId },
    data: {
      emojiStatusEnabled: true,
      emojiStatusEmojiId: emojiId,
      emojiStatusGrantedAt: now,
    },
  });

  return { ok: true, enabled: true, emojiId, level };
}

export function computeEmojiStatusReadiness(): boolean {
  return areAllEmojiStatusIdsConfigured();
}

export async function refreshEmojiStatusForUser(
  app: FastifyInstance,
  userId: string,
): Promise<void> {
  try {
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tgUserId: true,
        tgIsPremium: true,
        totalDonatedUsd: true,
        emojiStatusEnabled: true,
        emojiStatusEmojiId: true,
      },
    });
    if (!user) return;
    if (!user.emojiStatusEnabled) return;
    if (!user.tgIsPremium) return;
    if (!app.bot) return;
    if (!areAllEmojiStatusIdsConfigured()) return;

    const totalUsd = Number(user.totalDonatedUsd);
    const level = getDonorLevelForUsd(Number.isFinite(totalUsd) ? totalUsd : 0);
    const desiredEmojiId = getEmojiStatusIdForLevel(level);
    if (!desiredEmojiId) return;
    if (user.emojiStatusEmojiId === desiredEmojiId) return;

    try {
      await app.bot.api.setUserEmojiStatus(Number(user.tgUserId), {
        emoji_status_custom_emoji_id: desiredEmojiId,
      });
    } catch (err) {
      app.log.error(
        { err, userId, level, desiredEmojiId },
        "failed to auto-refresh emoji status via Telegram",
      );
      return;
    }

    await app.prisma.user.update({
      where: { id: userId },
      data: {
        emojiStatusEmojiId: desiredEmojiId,
        emojiStatusGrantedAt: new Date(),
      },
    });
    app.log.info(
      { userId, level, emojiId: desiredEmojiId },
      "emoji status auto-refreshed for new donor level",
    );
  } catch (err) {
    app.log.error({ err, userId }, "refreshEmojiStatusForUser unexpected error");
  }
}
