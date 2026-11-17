import { InlineKeyboard } from "grammy";
import type { FastifyInstance } from "fastify";
import type { ModerationBot } from "./moderation.js";
import {
  moderateExpenseReport,
  type ModerationAction,
} from "../services/expense-report-moderation.js";
import {
  getModeratorTgIds,
  isAllowedModerator,
} from "../services/campaign-moderation-notifications.js";
import { absoluteUrl } from "../services/campaign-moderation-format.js";
import { getBotUsername } from "../config/env.js";
import { formatAiWarning, type AiDetectionResult } from "../services/ai-image-detector.js";
import { t } from "../i18n/index.js";

const PENDING_TTL_MS = 15 * 60 * 1000;

interface PendingExpenseAction {
  campaignId: string;
  reportId: string;
  action: "reject" | "request_revision";
  expiresAt: number;
}

const pendingExpenseActions = new Map<number, PendingExpenseAction>();

export function getExpensePendingAction(tgUserId: number): PendingExpenseAction | null {
  const pending = pendingExpenseActions.get(tgUserId);
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) {
    pendingExpenseActions.delete(tgUserId);
    return null;
  }
  return pending;
}

export function clearExpensePendingAction(tgUserId: number): void {
  pendingExpenseActions.delete(tgUserId);
}

function setExpensePendingAction(tgUserId: number, action: PendingExpenseAction): void {
  pendingExpenseActions.set(tgUserId, action);
}

interface ExpenseReportCard {
  reportId: string;
  campaignId: string;
  campaignTitle: string;
  goalAmountUsd: number;
  collectedAmountUsd: number;
  photos: string[];
  comment: string | null;
  revision: number;
  isChannel: boolean;
  aiDetectionResults?: AiDetectionResult[] | null;
  creator: {
    tgUserId: bigint;
    firstName: string | null;
    username: string | null;
    kycLevel: number;
  };
}

export function buildExpenseReportText(card: ExpenseReportCard): string {
  const creatorName = card.creator.firstName ?? "Без имени";
  const creatorTag = card.creator.username ? `@${card.creator.username}` : `tg:${card.creator.tgUserId}`;
  const comment = card.comment
    ? card.comment.length > 1000 ? `${card.comment.slice(0, 1000)}...` : card.comment
    : "—";

  const lines = [
    "📋 Отчёт о расходовании средств",
    "",
    `Кампания: ${card.campaignTitle}`,
    `Цель: $${card.goalAmountUsd.toLocaleString("en-US")}`,
    `Собрано: $${card.collectedAmountUsd.toLocaleString("en-US")}`,
    card.isChannel ? "Тип: канальная (бонус-only)" : "Тип: обычная",
    `Автор: ${creatorName} ${creatorTag}`,
    `KYC: ${card.creator.kycLevel}`,
  ];

  if (card.revision > 1) {
    lines.push(`Ревизия: ${card.revision}`);
  }

  if (card.aiDetectionResults && card.aiDetectionResults.length > 0) {
    const summary = {
      results: card.aiDetectionResults,
      suspectedCount: card.aiDetectionResults.filter((r) => r.suspectedAi).length,
      autoReject: false,
    };
    const warning = formatAiWarning(summary);
    if (warning) {
      lines.push("", warning);
    }
  }

  lines.push("", `Комментарий: ${comment}`);

  return lines.join("\n");
}

export function expenseReportKeyboard(reportId: string, campaignId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Одобрить", `exp:approve:${campaignId}`)
    .text("❌ Отклонить", `exp:reject:${campaignId}`)
    .row()
    .text("✏️ На доработку", `exp:revision:${campaignId}`);
}

export async function sendExpenseReportToModerators(
  app: FastifyInstance,
  campaignId: string,
): Promise<void> {
  const bot = app.moderationBot;
  if (!bot) {
    app.log.warn({ campaignId }, "MODERATION_BOT_TOKEN not set; expense report notification skipped");
    return;
  }

  const moderatorIds = getModeratorTgIds();
  if (moderatorIds.length === 0) {
    app.log.warn({ campaignId }, "MODERATOR_TG_IDS not set; expense report notification skipped");
    return;
  }

  const campaign = await app.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      title: true,
      goalAmountUsd: true,
      raisedAmountUsd: true,
      channelId: true,
      expenseReport: {
        select: { id: true, photos: true, comment: true, revision: true, aiDetectionResults: true },
      },
      creator: {
        select: { tgUserId: true, tgFirstName: true, tgUsername: true, kycLevel: true },
      },
    },
  });

  if (!campaign?.expenseReport) return;

  const card: ExpenseReportCard = {
    reportId: campaign.expenseReport.id,
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    goalAmountUsd: Number(campaign.goalAmountUsd),
    collectedAmountUsd: Number(campaign.raisedAmountUsd),
    photos: campaign.expenseReport.photos,
    comment: campaign.expenseReport.comment,
    revision: campaign.expenseReport.revision,
    isChannel: campaign.channelId != null,
    aiDetectionResults: campaign.expenseReport.aiDetectionResults as AiDetectionResult[] | null,
    creator: {
      tgUserId: campaign.creator.tgUserId,
      firstName: campaign.creator.tgFirstName,
      username: campaign.creator.tgUsername,
      kycLevel: campaign.creator.kycLevel,
    },
  };

  const text = buildExpenseReportText(card);
  const keyboard = expenseReportKeyboard(card.reportId, campaignId);
  const photos = card.photos.map((p) => absoluteUrl(p));

  await Promise.all(
    moderatorIds.map(async (moderatorTgUserId) => {
      const chatId = Number(moderatorTgUserId);
      try {
        if (photos.length > 1) {
          const media = photos.map((url) => ({ type: "photo" as const, media: url }));
          await bot.api.sendMediaGroup(chatId, media);
          await bot.api.sendMessage(chatId, text, { reply_markup: keyboard });
        } else if (photos.length === 1) {
          await bot.api.sendPhoto(chatId, photos[0]!, { caption: text, reply_markup: keyboard });
        } else {
          await bot.api.sendMessage(chatId, text, { reply_markup: keyboard });
        }
      } catch (err) {
        app.log.error(
          { campaignId, moderatorTgUserId: moderatorTgUserId.toString(), err },
          "failed to send expense report moderation request",
        );
      }
    }),
  );
}

async function removeButtons(ctx: { editMessageReplyMarkup: () => Promise<unknown> }, log: FastifyInstance["log"]) {
  try {
    await ctx.editMessageReplyMarkup();
  } catch (err) {
    log.debug({ err }, "failed to remove expense report inline buttons");
  }
}

async function resolveModeratorId(app: FastifyInstance, tgUserId: number): Promise<string | null> {
  const user = await app.prisma.user.findFirst({
    where: { tgUserId: BigInt(tgUserId) },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function notifyCreator(
  app: FastifyInstance,
  campaignId: string,
  action: ModerationAction,
  note: string | null,
): Promise<void> {
  const bot = app.bot;
  if (!bot) return;

  const campaign = await app.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      title: true,
      creator: { select: { tgUserId: true, languageCode: true } },
    },
  });
  if (!campaign) return;

  const chatId = Number(campaign.creator.tgUserId);
  const title = campaign.title;
  const locale = campaign.creator.languageCode;
  const botUsername = getBotUsername();
  const deepLink = `https://t.me/${botUsername}?start=c_${campaignId}`;

  let text: string;
  switch (action) {
    case "approve":
      text = t(locale, "bot.expenseApproved", { campaignTitle: title });
      break;
    case "reject":
      text = note
        ? t(locale, "bot.expenseRejected", { campaignTitle: title, note, deepLink })
        : t(locale, "bot.expenseRejectedNoNote", { campaignTitle: title, deepLink });
      break;
    case "request_revision":
      text = note
        ? t(locale, "bot.expenseRevision", { campaignTitle: title, note, deepLink })
        : t(locale, "bot.expenseRevisionNoNote", { campaignTitle: title, deepLink });
      break;
  }

  try {
    await bot.api.sendMessage(chatId, text);
  } catch (err) {
    app.log.error({ campaignId, err }, "failed to notify creator about expense report moderation");
  }
}

export function registerExpenseReportCallbacks(bot: ModerationBot, app: FastifyInstance): void {
  bot.callbackQuery(/^exp:approve:([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const campaignId = ctx.match[1];
    const moderatorId = await resolveModeratorId(app, ctx.from.id);
    if (!moderatorId) {
      await ctx.answerCallbackQuery({ text: "Модератор не найден в системе", show_alert: true });
      return;
    }

    const result = await moderateExpenseReport(app.prisma, {
      campaignId,
      moderatorId,
      action: "approve",
    });

    if ("error" in result) {
      const errorMessages: Record<string, string> = {
        not_found: "Кампания не найдена",
        private_campaign: "Приватная кампания",
        no_report: "Отчёт не найден",
        not_pending: "Отчёт уже обработан",
      };
      await ctx.answerCallbackQuery({
        text: errorMessages[result.error as string] ?? "Ошибка",
        show_alert: true,
      });
      return;
    }

    clearExpensePendingAction(ctx.from.id);
    await ctx.answerCallbackQuery({ text: "Отчёт одобрен (+10 баллов)" });
    await removeButtons(ctx, app.log);
    await ctx.reply(`✅ Отчёт одобрен. Рейтинг автора: ${result.report.ratingDelta > 0 ? "+" : ""}${result.report.ratingDelta}`);
    void notifyCreator(app, campaignId, "approve", null);
  });

  bot.callbackQuery(/^exp:reject:([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const campaignId = ctx.match[1];
    const report = await app.prisma.expenseReport.findUnique({
      where: { campaignId },
      select: { id: true, status: true },
    });

    if (!report || report.status !== "pending_review") {
      await ctx.answerCallbackQuery({ text: "Отчёт уже обработан", show_alert: true });
      return;
    }

    setExpensePendingAction(ctx.from.id, {
      campaignId,
      reportId: report.id,
      action: "reject",
      expiresAt: Date.now() + PENDING_TTL_MS,
    });

    await ctx.answerCallbackQuery({ text: "Ожидаю причину" });
    await ctx.reply("Укажите причину отклонения отчёта одним сообщением или нажмите «Без причины».", {
      reply_markup: new InlineKeyboard().text("Без причины", `exp:no_reason:${campaignId}`),
    });
  });

  bot.callbackQuery(/^exp:revision:([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const campaignId = ctx.match[1];
    const report = await app.prisma.expenseReport.findUnique({
      where: { campaignId },
      select: { id: true, status: true },
    });

    if (!report || report.status !== "pending_review") {
      await ctx.answerCallbackQuery({ text: "Отчёт уже обработан", show_alert: true });
      return;
    }

    setExpensePendingAction(ctx.from.id, {
      campaignId,
      reportId: report.id,
      action: "request_revision",
      expiresAt: Date.now() + PENDING_TTL_MS,
    });

    await ctx.answerCallbackQuery({ text: "Ожидаю комментарий" });
    await ctx.reply("Укажите комментарий к доработке одним сообщением.");
  });

  bot.callbackQuery(/^exp:no_reason:([0-9a-f-]+)$/i, async (ctx) => {
    if (!ctx.from || !isAllowedModerator(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
      return;
    }

    const campaignId = ctx.match[1];
    clearExpensePendingAction(ctx.from.id);

    const moderatorId = await resolveModeratorId(app, ctx.from.id);
    if (!moderatorId) {
      await ctx.answerCallbackQuery({ text: "Модератор не найден", show_alert: true });
      return;
    }

    const result = await moderateExpenseReport(app.prisma, {
      campaignId,
      moderatorId,
      action: "reject",
    });

    if ("error" in result) {
      await ctx.answerCallbackQuery({ text: "Ошибка модерации", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: "Отчёт отклонён" });
    await removeButtons(ctx, app.log);
    await ctx.reply("❌ Отчёт отклонён без указания причины.");
    void notifyCreator(app, campaignId, "reject", null);
  });
}

export async function handleExpensePendingText(
  app: FastifyInstance,
  tgUserId: number,
  text: string,
  reply: (msg: string) => Promise<unknown>,
): Promise<boolean> {
  const pending = getExpensePendingAction(tgUserId);
  if (!pending) return false;

  clearExpensePendingAction(tgUserId);

  const moderatorId = await resolveModeratorId(app, tgUserId);
  if (!moderatorId) {
    await reply("Модератор не найден в системе.");
    return true;
  }

  const result = await moderateExpenseReport(app.prisma, {
    campaignId: pending.campaignId,
    moderatorId,
    action: pending.action,
    note: text,
  });

  if ("error" in result) {
    const errorMessages: Record<string, string> = {
      not_found: "Кампания не найдена.",
      no_report: "Отчёт не найден.",
      not_pending: "Отчёт уже обработан.",
    };
    await reply(errorMessages[result.error as string] ?? "Ошибка модерации.");
    return true;
  }

  if (pending.action === "reject") {
    await reply("❌ Отчёт отклонён. Причина отправлена автору.");
  } else {
    await reply("✏️ Отчёт отправлен на доработку. Комментарий отправлен автору.");
  }

  void notifyCreator(app, pending.campaignId, pending.action, text);
  return true;
}
