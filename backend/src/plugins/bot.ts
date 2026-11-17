import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type { HarmonyBot } from "../bot/index.js";
import { createBot } from "../bot/index.js";
import type { ModerationBot } from "../bot/moderation.js";
import { createModerationBot } from "../bot/moderation.js";
import { ensureEmojiStickerSet } from "../services/emoji-sticker-setup.js";
import {
  BOT_ALLOWED_UPDATES,
  createSendCampaignCard,
  installDonationWidgetQueries,
} from "../bot/donation-widget-runtime.js";

declare module "fastify" {
  interface FastifyInstance {
    bot: HarmonyBot;
    moderationBot: ModerationBot | null;
  }
}

const botPlugin: FastifyPluginAsync = fp(async (app) => {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN not set");

  let botRef: HarmonyBot | null = null;
  const bot = createBot(token, undefined, {
    sendCampaignCard: createSendCampaignCard(app, () => botRef!),
  });
  botRef = bot;
  installDonationWidgetQueries(app, bot);
  app.decorate("bot", bot);

  const moderationToken = process.env.MODERATION_BOT_TOKEN;
  const moderationBot = moderationToken ? createModerationBot(moderationToken, app) : null;
  app.decorate("moderationBot", moderationBot);

  app.addHook("onReady", async () => {
    bot.catch((err) => app.log.error({ err }, "Bot error"));
    void bot.start({ allowed_updates: [...BOT_ALLOWED_UPDATES] as never });
    if (moderationBot) {
      moderationBot.catch((err) => app.log.error({ err }, "Moderation bot error"));
      void moderationBot.start();
    }
    void ensureEmojiStickerSet(app);
  });

  app.addHook("onClose", async () => {
    if (moderationBot) await moderationBot.stop();
    await bot.stop();
  });
});

export default botPlugin;
