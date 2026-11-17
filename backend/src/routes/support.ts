import type { FastifyInstance } from "fastify";
import { getWebAppUrl } from "../config/env.js";
import { getModeratorTgIds } from "../services/campaign-moderation.js";

const supportFeedbackSchema = {
  body: {
    type: "object" as const,
    required: ["message"],
    properties: {
      message: { type: "string" as const, minLength: 5, maxLength: 2000 },
      photos: {
        type: "array" as const,
        items: { type: "string" as const, maxLength: 500 },
        maxItems: 3,
        default: [],
      },
    },
    additionalProperties: false,
  },
};

export async function supportRoutes(app: FastifyInstance) {
  app.post<{
    Body: { message: string; photos?: string[] };
  }>("/support/feedback", { schema: supportFeedbackSchema }, async (request, reply) => {
    const { user } = request;

    const { message, photos = [] } = request.body;

    const bot = app.moderationBot;
    if (!bot) {
      app.log.warn("MODERATION_BOT_TOKEN not set; support feedback skipped");
      return reply.code(503).send({ error: request.t("api.feedbackUnavailable") });
    }

    const moderatorIds = getModeratorTgIds();
    if (moderatorIds.length === 0) {
      app.log.warn("MODERATOR_TG_IDS not set; support feedback skipped");
      return reply.code(503).send({ error: request.t("api.feedbackUnavailable") });
    }

    const username = user.username ? `@${user.username}` : user.firstName ?? `tg:${user.tgUserId}`;
    const webAppBase = getWebAppUrl();
    const photoUrls = photos
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      .map((p) => (/^https?:\/\//i.test(p) ? p : new URL(p, webAppBase).toString()));

    const text = [
      "📩 Обращение в поддержку",
      "",
      `От: ${username} (tg:${user.tgUserId})`,
      "",
      message.trim(),
    ].join("\n");

    let delivered = 0;

    for (const modId of moderatorIds) {
      try {
        const chatId = Number(modId);
        if (photoUrls.length > 1) {
          const media = photoUrls.map((url) => ({ type: "photo" as const, media: url }));
          await bot.api.sendMediaGroup(chatId, media);
          await bot.api.sendMessage(chatId, text);
        } else if (photoUrls.length === 1) {
          await bot.api.sendPhoto(chatId, photoUrls[0]!, { caption: text });
        } else {
          await bot.api.sendMessage(chatId, text);
        }
        delivered += 1;
      } catch (err) {
        app.log.error({ modId: modId.toString(), err }, "Failed to send support feedback to moderator");
      }
    }

    if (delivered === 0) {
      app.log.error({ moderators: moderatorIds.length }, "Support feedback reached no moderator");
      return reply.code(503).send({ error: request.t("api.feedbackUnavailable") });
    }

    return reply.send({ ok: true });
  });
}
