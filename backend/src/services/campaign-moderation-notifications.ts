import type { FastifyInstance } from "fastify";
import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import type { CampaignScreenerInput, CampaignScreenerVerdict } from "./campaign-auto-screener.js";
import {
  absoluteUrl,
  buildAutoRejectText,
  buildModerationText,
  moderationKeyboard,
  type ModerationCampaignCard,
} from "./campaign-moderation-format.js";

export function getModeratorTgIds(): bigint[] {
  return (process.env.MODERATOR_TG_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => BigInt(value));
}

export function isAllowedModerator(tgUserId: number | bigint): boolean {
  const id = BigInt(tgUserId);
  return getModeratorTgIds().some((allowedId) => allowedId === id);
}

export async function sendCampaignModerationRequest(
  api: Api,
  moderatorTgUserId: bigint,
  campaign: ModerationCampaignCard,
  screenerVerdict: CampaignScreenerVerdict | null = null,
): Promise<void> {
  const text = buildModerationText(campaign, screenerVerdict);
  const keyboard = moderationKeyboard(campaign.id, screenerVerdict !== null);
  const chatId = Number(moderatorTgUserId);
  const photos = campaign.photos.map((p) => absoluteUrl(p));

  if (photos.length > 1) {
    const media = photos.map((url) => ({ type: "photo" as const, media: url }));
    await api.sendMediaGroup(chatId, media);
    await api.sendMessage(chatId, text, { reply_markup: keyboard });
    return;
  }

  if (photos.length === 1) {
    await api.sendPhoto(chatId, photos[0]!, { caption: text, reply_markup: keyboard });
    return;
  }

  await api.sendMessage(chatId, text, { reply_markup: keyboard });
}

export async function notifyCampaignModerators(
  app: FastifyInstance,
  campaign: ModerationCampaignCard,
  screenerVerdict: CampaignScreenerVerdict | null = null,
): Promise<void> {
  const bot = app.moderationBot;
  if (!bot) {
    app.log.warn({ campaignId: campaign.id }, "MODERATION_BOT_TOKEN not set; moderation notification skipped");
    return;
  }

  const moderatorIds = getModeratorTgIds();
  if (moderatorIds.length === 0) {
    app.log.warn({ campaignId: campaign.id }, "MODERATOR_TG_IDS not set; moderation notification skipped");
    return;
  }

  await Promise.all(
    moderatorIds.map(async (moderatorTgUserId) => {
      try {
        await sendCampaignModerationRequest(bot.api, moderatorTgUserId, campaign, screenerVerdict);
      } catch (err) {
        app.log.error(
          { campaignId: campaign.id, moderatorTgUserId: moderatorTgUserId.toString(), err },
          "failed to send campaign moderation request",
        );
      }
    }),
  );
}

export async function notifyAutoRejectModerators(
  app: FastifyInstance,
  input: {
    screenerInput: CampaignScreenerInput;
    verdict: CampaignScreenerVerdict;
    creatorTgUserId: bigint;
    creatorFirstName?: string | null;
    creatorUsername?: string | null;
    photos?: string[];
  },
  ephemeralCampaignId: string,
): Promise<void> {
  const bot = app.moderationBot;
  if (!bot) return;

  const moderatorIds = getModeratorTgIds();
  if (moderatorIds.length === 0) return;

  const text = buildAutoRejectText(input);
  const kb = new InlineKeyboard()
    .text("\u{1F44D} Мозг был прав", `mod:fb:ok:${ephemeralCampaignId}`)
    .text("\u{1F44E} Мозг ошибся", `mod:fb:bad:${ephemeralCampaignId}`);
  const cover = input.photos?.[0];

  await Promise.all(
    moderatorIds.map(async (moderatorTgUserId) => {
      try {
        if (cover) {
          await bot.api.sendPhoto(Number(moderatorTgUserId), absoluteUrl(cover), {
            caption: text,
            reply_markup: kb,
          });
        } else {
          await bot.api.sendMessage(Number(moderatorTgUserId), text, {
            reply_markup: kb,
          });
        }
      } catch (err) {
        app.log.error(
          { err, moderatorTgUserId: moderatorTgUserId.toString() },
          "failed to send auto-reject notification to moderator",
        );
      }
    }),
  );
}

