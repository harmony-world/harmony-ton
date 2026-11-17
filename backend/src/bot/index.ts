import { fileURLToPath } from "node:url";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { getWebAppUrl } from "../config/env.js";
import { t } from "../i18n/index.js";

export type HarmonyBot = Bot;

const WELCOME_BANNER = fileURLToPath(new URL("../assets/brand/welcome.jpg", import.meta.url));
let welcomeBannerFileId: string | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateBotOptions = {
  sendCampaignCard?: (chatId: number, campaignId: string, locale: string | undefined, appUrl: string) => Promise<boolean>;
};

export function createBot(token: string, botInfo?: UserFromGetMe, options: CreateBotOptions = {}): HarmonyBot {
  const bot = new Bot(token, { botInfo });
  const webAppBase = getWebAppUrl();

  bot.command("start", async (ctx) => {
    const payload = ctx.match?.toString().trim();
    if (ctx.chat?.type === "private") {
      await ctx.api
        .setChatMenuButton({
          chat_id: ctx.chat.id,
          menu_button: { type: "web_app", text: t(ctx.from?.language_code, "bot.menuButton"), web_app: { url: webAppBase } },
        })
        .catch(() => undefined);
    }

    if (payload?.startsWith("c_")) {
      const campaignId = payload.slice(2);
      const locale = ctx.from?.language_code;
      if (options.sendCampaignCard && ctx.chat && UUID_RE.test(campaignId)) {
        const sent = await options.sendCampaignCard(
          ctx.chat.id,
          campaignId,
          locale,
          `${webAppBase}/#/campaign/${campaignId}`,
        );
        if (sent) return;
      }
      const keyboard = new InlineKeyboard().webApp(
        t(locale, "bot.startCampaignButton"),
        `${webAppBase}/#/campaign/${campaignId}`,
      );
      await ctx.reply(t(locale, "bot.startCampaignShared"), {
        reply_markup: keyboard,
      });
      return;
    }

    if (payload?.startsWith("profile_")) {
      const userId = payload.slice("profile_".length);
      if (UUID_RE.test(userId)) {
        const locale = ctx.from?.language_code;
        const keyboard = new InlineKeyboard().webApp(
          t(locale, "bot.startProfileButton"),
          `${webAppBase}/#/profile/${userId}`,
        );
        await ctx.reply(t(locale, "bot.startProfileShared"), {
          reply_markup: keyboard,
        });
        return;
      }
    }

    const locale = ctx.from?.language_code;
    const keyboard = new InlineKeyboard()
      .webApp(t(locale, "bot.welcomeOpen"), webAppBase)
      .row()
      .webApp(t(locale, "bot.welcomeCreate"), `${webAppBase}/#/create`);
    const caption = t(locale, "bot.welcome");
    try {
      const sent = await ctx.replyWithPhoto(welcomeBannerFileId ?? new InputFile(WELCOME_BANNER), {
        caption,
        reply_markup: keyboard,
      });
      welcomeBannerFileId = sent.photo?.at(-1)?.file_id ?? welcomeBannerFileId;
    } catch {
      welcomeBannerFileId = null;
      await ctx.reply(caption, { reply_markup: keyboard });
    }
  });

  return bot;
}
