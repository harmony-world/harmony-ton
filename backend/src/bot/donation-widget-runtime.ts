import type { FastifyInstance } from "fastify";
import type { Bot } from "grammy";
import { t } from "../i18n/index.js";
import {
  buildDonationWidgetChatData,
  buildDonationWidgetHtml,
  handleDonationWidgetQuery,
  isCampaignShownInWidget,
  loadCampaignForWidget,
  type WidgetDeps,
  type WidgetQuery,
} from "./donation-widget.js";
import { loadWidgetPhoto } from "./donation-widget-photo.js";
import { resolveUploadsDir } from "../services/upload-cleanup.js";
import { localizeCampaignContent } from "../services/campaign-translation.js";

export const BOT_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "inline_query",
  "chosen_inline_result",
  "callback_query",
  "shipping_query",
  "pre_checkout_query",
  "poll",
  "poll_answer",
  "my_chat_member",
  "chat_join_request",
  "widget_query",
] as const;

const REFRESH_DELAYS_MS = [25_000, 90_000];

type RawApi = Record<string, (payload: Record<string, unknown>) => Promise<unknown>>;

function raw(bot: Bot): RawApi {
  return bot.api.raw as unknown as RawApi;
}

type LoadedCampaign = NonNullable<Awaited<ReturnType<typeof loadCampaignForWidget>>>;

async function chatDataFor(app: FastifyInstance, campaign: LoadedCampaign, locale: string | null | undefined) {
  const content = await localizeCampaignContent(app.prisma, campaign, locale, app.log);
  return buildDonationWidgetChatData(campaign, new Date(), content);
}

export function isDonationWidgetEnabled(): boolean {
  return process.env.DONATION_WIDGET_ENABLED === "true";
}

export function createSendCampaignCard(app: FastifyInstance, getBot: () => Bot) {
  return async (chatId: number, campaignId: string, locale: string | undefined, appUrl: string): Promise<boolean> => {
    if (!isDonationWidgetEnabled()) return false;
    try {
      const campaign = await loadCampaignForWidget(app.prisma, campaignId);
      if (!campaign || !isCampaignShownInWidget(campaign)) return false;
      const photo = await loadWidgetPhoto(campaign.photos, resolveUploadsDir());
      await raw(getBot()).sendWidget({
        chat_id: chatId,
        html: buildDonationWidgetHtml(locale),
        chat_data: await chatDataFor(app, campaign, locale),
        ...(photo ? { public_data: photo } : {}),
        allow_queries: true,
        reply_markup: { inline_keyboard: [[{ text: t(locale, "bot.startCampaignButton"), web_app: { url: appUrl } }]] },
      });
      return true;
    } catch (err) {
      app.log.warn({ err, campaignId }, "donation widget: sendWidget failed, falling back to the button");
      return false;
    }
  };
}

export function installDonationWidgetQueries(app: FastifyInstance, bot: Bot): void {
  const refresh = async (chatId: number, messageId: number, campaignId: string) => {
    const campaign = await loadCampaignForWidget(app.prisma, campaignId);
    if (!campaign) return;
    const viewer = await app.prisma.user.findUnique({ where: { tgUserId: BigInt(chatId) }, select: { languageCode: true } });
    await raw(bot).editMessageWidgetData({
      chat_id: chatId,
      message_id: messageId,
      chat_data: await chatDataFor(app, campaign, viewer?.languageCode),
    });
  };
  const deps: WidgetDeps = {
    prisma: app.prisma,
    answer: (queryId, data) => raw(bot).answerWidgetQuery({ widget_query_id: queryId, data }),
    log: app.log,
    scheduleRefresh: (chatId, messageId, campaignId) => {
      for (const delay of REFRESH_DELAYS_MS) {
        setTimeout(() => {
          refresh(chatId, messageId, campaignId).catch((err) =>
            app.log.warn({ err, campaignId }, "donation widget: refresh failed"),
          );
        }, delay).unref();
      }
    },
  };

  bot.use(async (ctx, next) => {
    const query = (ctx.update as { widget_query?: WidgetQuery }).widget_query;
    if (!query) return next();
    try {
      await handleDonationWidgetQuery(deps, query);
    } catch (err) {
      app.log.error({ err }, "donation widget: query failed");
      await deps.answer(query.id, JSON.stringify({ e: "err" })).catch(() => undefined);
    }
  });
}
