import { Bot, InlineKeyboard } from "grammy";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { UserFromGetMe } from "grammy/types";
import {
  approveCampaignFromModeration,
  isAllowedModerator,
  recordModeratorFeedback,
  rejectCampaignFromModeration,
  type ModeratorIdentity,
} from "../services/campaign-moderation.js";
import {
  registerExpenseReportCallbacks,
  handleExpensePendingText,
} from "./expense-report-moderation.js";
import {
  adminBotLoginReturnUrl,
  confirmAdminBotLogin,
  parseAdminBotLoginPayload,
} from "../routes/admin/auth.js";

export type ModerationBot = Bot;

const REJECT_REASON_TTL_MS = 15 * 60 * 1000;

function moderatorFromContext(ctx: { from?: { id: number; username?: string; first_name?: string } }): ModeratorIdentity {
  if (!ctx.from) throw new Error("missing moderator");
  return {
    tgUserId: BigInt(ctx.from.id),
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name ?? null,
  };
}

function rejectReasonKeyboard(campaignId: string) {
  return new InlineKeyboard().text("Без причины", `mod:reject_no_reason:${campaignId}`);
}

async function setPendingReject(app: FastifyInstance, moderatorTgId: number, campaignId: string): Promise<void> {
  await app.prisma.pendingModerationReject.upsert({
    where: { moderatorTgId: BigInt(moderatorTgId) },
    create: {
      moderatorTgId: BigInt(moderatorTgId),
      campaignId,
      expiresAt: new Date(Date.now() + REJECT_REASON_TTL_MS),
    },
    update: {
      campaignId,
      expiresAt: new Date(Date.now() + REJECT_REASON_TTL_MS),
    },
  });
}

async function getPendingReject(app: FastifyInstance, moderatorTgId: number): Promise<{ campaignId: string; expiresAt: Date } | null> {
  const row = await app.prisma.pendingModerationReject.findUnique({
    where: { moderatorTgId: BigInt(moderatorTgId) },
  });
  return row ? { campaignId: row.campaignId, expiresAt: row.expiresAt } : null;
}

async function clearPendingReject(app: FastifyInstance, moderatorTgId: number): Promise<void> {
  await app.prisma.pendingModerationReject.deleteMany({
    where: { moderatorTgId: BigInt(moderatorTgId) },
  });
}

async function removeButtons(ctx: { editMessageReplyMarkup: () => Promise<unknown> }, log: FastifyBaseLogger) {
  try {
    await ctx.editMessageReplyMarkup();
  } catch (err) {
    log.debug({ err }, "failed to remove moderation inline buttons");
  }
}

export function createModerationBot(
  token: string,
  app: FastifyInstance,
  botInfo?: UserFromGetMe,
): ModerationBot {
  const bot = new Bot(token, { botInfo });

  bot.command("start", async (ctx) => {
    const loginToken = parseAdminBotLoginPayload(ctx.match?.toString().trim());
    if (!loginToken) {
      await ctx.reply("Harmony moderation bot is active.");
      return;
    }

    if (!ctx.from) {
      await ctx.reply("Не удалось определить Telegram аккаунт.");
      return;
    }

    const result = await confirmAdminBotLogin(app, loginToken, ctx.from);
    if (result === "confirmed") {
      await ctx.reply("Вход в админ-панель подтверждён. Вернитесь во вкладку браузера.", {
        reply_markup: new InlineKeyboard().url(
          "Вернуться в админку",
          adminBotLoginReturnUrl(loginToken),
        ),
      });
      return;
    }

    if (result === "forbidden") {
      await ctx.reply("Нет доступа к админ-панели для этого Telegram аккаунта.");
      return;
    }

    await ctx.reply("Код входа истёк. Откройте админ-панель и начните вход заново.");
  });

  bot.callbackQuery(/^mod:approve:([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const campaignId = ctx.match[1];
    const result = await approveCampaignFromModeration(app, campaignId, moderatorFromContext(ctx));

    if (result.status === "approved") {
      await clearPendingReject(app, ctx.from.id);
      await ctx.answerCallbackQuery({ text: "Кампания согласована" });
      await removeButtons(ctx, app.log);
      await ctx.reply("Кампания согласована. Запускаю публикацию в блокчейне.");
      return;
    }

    if (result.status === "not_found") {
      await ctx.answerCallbackQuery({ text: "Кампания не найдена", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: `Уже обработана: ${result.campaignStatus}`, show_alert: true });
  });

  bot.callbackQuery(/^mod:reject:([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const campaignId = ctx.match[1];
    await setPendingReject(app, ctx.from.id, campaignId);
    await ctx.answerCallbackQuery({ text: "Ожидаю причину" });
    await ctx.reply("Укажите причину отклонения одним сообщением или нажмите «Без причины».", {
      reply_markup: rejectReasonKeyboard(campaignId),
    });
  });

  bot.callbackQuery(/^mod:reject_no_reason:([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const campaignId = ctx.match[1];
    const result = await rejectCampaignFromModeration(app, campaignId, moderatorFromContext(ctx), null);
    await clearPendingReject(app, ctx.from.id);

    if (result.status === "rejected") {
      await ctx.answerCallbackQuery({ text: "Кампания отклонена" });
      await removeButtons(ctx, app.log);
      await ctx.reply("Кампания отклонена без указания причины.");
      return;
    }

    if (result.status === "not_found") {
      await ctx.answerCallbackQuery({ text: "Кампания не найдена", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: `Уже обработана: ${result.campaignStatus}`, show_alert: true });
  });

  bot.callbackQuery(/^mod:fb:(ok|bad):([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }
    const raw = ctx.match[1];
    const campaignId = ctx.match[2];
    const feedback = raw === "ok" ? "correct" : "incorrect";
    const result = await recordModeratorFeedback(app, campaignId, feedback);
    if (result.status === "recorded") {
      await ctx.answerCallbackQuery({
        text: feedback === "correct" ? "Спасибо, отметил: мозг был прав" : "Спасибо, отметил: мозг ошибся",
      });
      return;
    }
    await ctx.answerCallbackQuery({ text: "Нет события авто-скринера для этой кампании", show_alert: true });
  });

  registerExpenseReportCallbacks(bot, app);

  bot.on("message:text", async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) return;

    const handled = await handleExpensePendingText(
      app,
      ctx.from.id,
      ctx.message.text.trim(),
      (msg) => ctx.reply(msg),
    );
    if (handled) return;

    const pending = await getPendingReject(app, ctx.from.id);
    if (!pending) return;

    if (pending.expiresAt.getTime() < Date.now()) {
      await clearPendingReject(app, ctx.from.id);
      await ctx.reply("Время ожидания причины истекло. Нажмите «Отклонить» ещё раз.");
      return;
    }

    const reason = ctx.message.text.trim();
    const result = await rejectCampaignFromModeration(app, pending.campaignId, moderatorFromContext(ctx), reason);
    await clearPendingReject(app, ctx.from.id);

    if (result.status === "rejected") {
      await ctx.reply("Кампания отклонена. Причина отправлена автору.");
      return;
    }

    if (result.status === "not_found") {
      await ctx.reply("Кампания не найдена.");
      return;
    }

    await ctx.reply(`Кампания уже обработана: ${result.campaignStatus}.`);
  });

  return bot;
}
