import type { PrismaClient } from "@prisma/client";
import type pino from "pino";
import { calcRatingDelta } from "./expense-report-moderation.js";
import { recalcUserTrustScore } from "./trust-score.js";
import { getBotUsername } from "../config/env.js";
import { t } from "../i18n/index.js";

const REMINDER_DAYS = 7;
const PENALTY_DAYS = 14;
import { EXPENSE_REPORT_MIN_RAISED_USD as MIN_RAISED_USD } from "../constants/expense-report.js";

export interface CreatorMessengerApp {
  bot: { api: { sendMessage: (chatId: number, text: string) => Promise<unknown> } };
  moderationBot: { api: { sendMessage: (chatId: number, text: string) => Promise<unknown> } } | null;
}

export function creatorMessenger(app: CreatorMessengerApp) {
  return (chatId: number, text: string) => app.bot.api.sendMessage(chatId, text).then(() => {});
}

export interface ExpenseReportCronDeps {
  prisma: PrismaClient;
  log: pino.Logger;
  sendTelegramMessage?: (chatId: number, text: string) => Promise<void>;
}

export interface ExpenseReportCronResult {
  reminders: number;
  penalties: number;
}

export async function processExpenseReportCron(
  deps: ExpenseReportCronDeps,
): Promise<ExpenseReportCronResult> {
  const { prisma, log } = deps;
  let reminders = 0;
  let penalties = 0;

  const campaigns = await prisma.campaign.findMany({
    where: {
      isPublic: true,
      channelId: null,
      status: "completed",
      raisedAmountUsd: { gte: MIN_RAISED_USD },
      withdrawals: {
        some: { status: "confirmed" },
      },
    },
    select: {
      id: true,
      title: true,
      isPublic: true,
      channelId: true,
      creatorId: true,
      withdrawals: {
        where: { status: "confirmed" },
        orderBy: { confirmedAt: "asc" },
        take: 1,
        select: { confirmedAt: true, createdAt: true },
      },
      expenseReport: {
        select: {
          id: true,
          status: true,
          ratingDelta: true,
          reminderSentAt: true,
        },
      },
      creator: {
        select: { tgUserId: true, languageCode: true },
      },
    },
  });

  const now = new Date();

  for (const campaign of campaigns) {
    const withdrawal = campaign.withdrawals[0];
    if (!withdrawal) continue;

    const claimedAt = withdrawal.confirmedAt ?? withdrawal.createdAt;
    const daysSinceClaim = (now.getTime() - claimedAt.getTime()) / (1000 * 60 * 60 * 24);
    const report = campaign.expenseReport;

    if (report && report.status !== "missing") continue;

    if (daysSinceClaim >= PENALTY_DAYS) {
      if (report && report.ratingDelta !== 0) continue;

      const ratingDelta = calcRatingDelta("missing", {
        isPublic: campaign.isPublic,
        channelId: campaign.channelId,
      });

      if (report) {
        await prisma.expenseReport.update({
          where: { id: report.id },
          data: { ratingDelta },
        });
      } else {
        await prisma.expenseReport.create({
          data: {
            campaignId: campaign.id,
            creatorId: campaign.creatorId,
            status: "missing",
            ratingDelta,
            photos: [],
          },
        });
      }
      await recalcUserTrustScore(prisma, campaign.creatorId);

      penalties++;
      log.info(
        { campaignId: campaign.id, daysSinceClaim: Math.floor(daysSinceClaim), ratingDelta },
        "Expense report penalty applied",
      );

      if (deps.sendTelegramMessage) {
        const chatId = Number(campaign.creator.tgUserId);
        const botUsername = getBotUsername();
        const deepLink = `https://t.me/${botUsername}?start=c_${campaign.id}`;
        const text = t(campaign.creator.languageCode, "bot.expensePenalty", {
          campaignTitle: campaign.title,
          points: Math.abs(ratingDelta),
          deepLink,
        });
        try {
          await deps.sendTelegramMessage(chatId, text);
        } catch (err) {
          log.error({ campaignId: campaign.id, err }, "Failed to send penalty notification");
        }
      }

      continue;
    }

    if (daysSinceClaim >= REMINDER_DAYS) {
      if (report?.reminderSentAt) continue;

      if (report) {
        await prisma.expenseReport.update({
          where: { id: report.id },
          data: { reminderSentAt: now },
        });
      } else {
        await prisma.expenseReport.create({
          data: {
            campaignId: campaign.id,
            creatorId: campaign.creatorId,
            status: "missing",
            ratingDelta: 0,
            photos: [],
            reminderSentAt: now,
          },
        });
      }

      reminders++;
      log.info(
        { campaignId: campaign.id, daysSinceClaim: Math.floor(daysSinceClaim) },
        "Expense report reminder sent",
      );

      if (deps.sendTelegramMessage) {
        const chatId = Number(campaign.creator.tgUserId);
        const botUsername = getBotUsername();
        const deepLink = `https://t.me/${botUsername}?start=c_${campaign.id}`;
        const daysLeft = Math.ceil(PENALTY_DAYS - daysSinceClaim);
        const text = t(campaign.creator.languageCode, "bot.expenseReminder", {
          campaignTitle: campaign.title,
          daysLeft,
          deepLink,
        });
        try {
          await deps.sendTelegramMessage(chatId, text);
        } catch (err) {
          log.error({ campaignId: campaign.id, err }, "Failed to send reminder notification");
        }
      }
    }
  }

  if (reminders > 0 || penalties > 0) {
    log.info({ reminders, penalties }, "Expense report cron completed");
  }

  return { reminders, penalties };
}
