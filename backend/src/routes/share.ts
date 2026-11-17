import type { FastifyInstance } from "fastify";
import type { InlineQueryResult } from "grammy/types";
import { InputFile } from "grammy";
import { t } from "../i18n/index.js";
import { ensureTelegramPhotoId } from "../services/telegram-photo-cache.js";
import { resolveUploadsDir } from "../services/upload-cleanup.js";
import { renderProfileCard } from "../services/profile-card-renderer.js";

const MEDIA_STORAGE_CHAT_ID = Number(process.env.MEDIA_STORAGE_CHAT_ID ?? "0");

export function campaignShareKeyboard(locale: string, deepLink: string) {
  return { inline_keyboard: [[{ text: t(locale, "share.donateButton"), url: deepLink }]] };
}

const shareSchema = {
  body: {
    type: "object" as const,
    required: ["type", "id"],
    properties: {
      type: { type: "string" as const, enum: ["campaign", "profile"] },
      id: { type: "string" as const, minLength: 1, maxLength: 100 },
    },
    additionalProperties: false,
  },
};

export async function shareRoutes(app: FastifyInstance) {
  app.post<{
    Body: { type: "campaign" | "profile"; id: string };
  }>("/share/prepare", { schema: shareSchema }, async (request, reply) => {
    const { user } = request;
    const { type, id } = request.body;
    const locale = user.languageCode ?? "ru";
    const botUsername =
      process.env.BOT_USERNAME ??
      (await app.bot.api.getMe()).username;

    let result: InlineQueryResult;

    if (type === "campaign") {
      const campaign = await app.prisma.campaign.findUnique({
        where: { id },
        select: {
          id: true,
          hiddenAt: true,
          title: true,
          story: true,
          goalAmountUsd: true,
          organizerType: true,
          channelUsername: true,
          photos: true,
          tgPhotoFileId: true,
        },
      });

      if (!campaign || campaign.hiddenAt) {
        return reply.code(404).send({ error: "Campaign not found" });
      }

      const deepLink = `https://t.me/${botUsername}?start=c_${campaign.id}`;
      const goal = Number(campaign.goalAmountUsd);

      const messageText =
        campaign.organizerType === "telegram_channel" && campaign.channelUsername
          ? t(locale, "share.channelText", { channel: campaign.channelUsername, title: campaign.title, goal: String(goal) })
          : t(locale, "share.personalText", { title: campaign.title, goal: String(goal) });

      let photoFileId: string | null = null;
      try {
        photoFileId = await ensureTelegramPhotoId(
          app.bot,
          app.prisma,
          campaign,
          resolveUploadsDir(),
        );
      } catch (err) {
        request.log.warn({ err }, "Failed to cache photo in Telegram, falling back to article");
      }

      if (photoFileId) {
        result = {
          type: "photo",
          id: `share_campaign_${campaign.id}`,
          photo_file_id: photoFileId,
          title: campaign.title,
          description: campaign.story.length > 100 ? campaign.story.slice(0, 97) + "..." : campaign.story,
          caption: messageText,
          reply_markup: campaignShareKeyboard(locale, deepLink),
        };
      } else {
        result = {
          type: "article",
          id: `share_campaign_${campaign.id}`,
          title: campaign.title,
          description: campaign.story.length > 100 ? campaign.story.slice(0, 97) + "..." : campaign.story,
          input_message_content: {
            message_text: messageText,
          },
          reply_markup: campaignShareKeyboard(locale, deepLink),
        };
      }
    } else {
      const profile = await app.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          tgFirstName: true,
          tgLastName: true,
          tgPhotoUrl: true,
          totalDonatedUsd: true,
          donationCount: true,
          trustScore: true,
        },
      });

      if (!profile) {
        return reply.code(404).send({ error: "User not found" });
      }

      const deepLink = `https://t.me/${botUsername}?start=profile_${profile.id}`;
      const name = [profile.tgFirstName, profile.tgLastName]
        .filter(Boolean)
        .join(" ") || "User";
      const initials = name[0]?.toUpperCase() ?? "?";

      const messageText = t(locale, "share.profileText", { name, link: deepLink });

      let profilePhotoFileId: string | null = null;
      if (MEDIA_STORAGE_CHAT_ID) {
        try {
          const campaignCount = await app.prisma.campaign.count({
            where: { creatorId: id },
          });

          const cardPng = await renderProfileCard({
            name,
            initials,
            avatarUrl: profile.tgPhotoUrl,
            totalDonatedUsd: Number(profile.totalDonatedUsd),
            donationCount: profile.donationCount,
            campaignCount,
            trustScore: profile.trustScore,
          });

          const msg = await app.bot.api.sendPhoto(
            MEDIA_STORAGE_CHAT_ID,
            new InputFile(cardPng, "profile-card.png"),
          );
          const biggest = msg.photo[msg.photo.length - 1]!;
          profilePhotoFileId = biggest.file_id;
          await app.bot.api.deleteMessage(MEDIA_STORAGE_CHAT_ID, msg.message_id).catch(() => {});
        } catch (err) {
          request.log.warn({ err }, "Failed to render profile card, falling back to article");
        }
      }

      if (profilePhotoFileId) {
        result = {
          type: "photo",
          id: `share_profile_${profile.id}`,
          photo_file_id: profilePhotoFileId,
          title: name,
          description: t(locale, "share.profileDescription"),
          caption: messageText,
        };
      } else {
        result = {
          type: "article",
          id: `share_profile_${profile.id}`,
          title: name,
          description: t(locale, "share.profileDescription"),
          input_message_content: {
            message_text: messageText,
          },
        };
      }
    }

    try {
      const prepared = await app.bot.api.savePreparedInlineMessage(
        Number(user.tgUserId),
        result,
        {
          allow_user_chats: true,
          allow_bot_chats: true,
          allow_group_chats: true,
          allow_channel_chats: true,
        },
      );

      return reply.send({ msgId: prepared.id });
    } catch (err) {
      request.log.error({ err }, "savePreparedInlineMessage failed");
      return reply.code(500).send({ error: "Failed to prepare share message" });
    }
  });
}
