import type { PrismaClient } from "@prisma/client";
import { getBotUsername } from "../config/env.js";
import { telegramApi, type TelegramMessage } from "./telegram-api.js";

const RATE_LIMIT_PER_CAMPAIGN_MS = 4 * 60 * 60 * 1000;
const RATE_LIMIT_PER_CHANNEL_DAILY = 3;
const MILESTONES = [25, 50, 75, 100] as const;

type AutopostCampaign = {
  id: string;
  title: string;
  channelId: bigint | null;
  channelUsername: string | null;
  channelAutopost: boolean;
  channelBotIsAdmin: boolean;
  goalAmountUsd: unknown;
  raisedAmountUsd: unknown;
  deadline: Date | null;
};

export function checkMilestone(
  prevRaisedUsd: number,
  newRaisedUsd: number,
  goalUsd: number,
): number | null {
  if (goalUsd <= 0) return null;
  for (const m of MILESTONES) {
    const threshold = (m / 100) * goalUsd;
    if (prevRaisedUsd < threshold && newRaisedUsd >= threshold) return m;
  }
  return null;
}

async function isRateLimited(
  prisma: PrismaClient,
  campaignId: string,
  channelId: bigint,
): Promise<boolean> {
  const fourHoursAgo = new Date(Date.now() - RATE_LIMIT_PER_CAMPAIGN_MS);
  const recentCampaignPost = await prisma.channelAutopost.findFirst({
    where: { campaignId, postedAt: { gte: fourHoursAgo } },
    select: { id: true },
  });
  if (recentCampaignPost) return true;

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dailyChannelCount = await prisma.channelAutopost.count({
    where: { channelId, postedAt: { gte: dayStart } },
  });
  return dailyChannelCount >= RATE_LIMIT_PER_CHANNEL_DAILY;
}

async function sendToChannel(
  botToken: string,
  channelId: bigint,
  text: string,
  deeplink: string,
): Promise<number | null> {
  const json = await telegramApi(botToken).post<TelegramMessage>("sendMessage", {
    chat_id: channelId.toString(),
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "\u{1F49D} Помочь", url: deeplink }]],
    },
  });
  return json.ok && json.result ? json.result.message_id : null;
}

function campaignDeeplink(campaignId: string): string {
  return `https://t.me/${getBotUsername()}?start=c_${campaignId}`;
}

export async function postCampaignOpened(
  prisma: PrismaClient,
  botToken: string,
  campaign: AutopostCampaign,
): Promise<boolean> {
  if (!campaign.channelAutopost || !campaign.channelBotIsAdmin || !campaign.channelId) return false;

  if (await isRateLimited(prisma, campaign.id, campaign.channelId)) return false;

  const goal = Number(campaign.goalAmountUsd);
  const deadlineStr = campaign.deadline
    ? campaign.deadline.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : "не указан";

  const text =
    `\u{1F91D} <b>Открыт сбор: ${escapeHtml(campaign.title)}</b>\n\n` +
    `\u{1F3AF} Цель: $${goal}\n` +
    `\u{1F4C5} Дедлайн: ${deadlineStr}\n\n` +
    `Поддержите прямо сейчас \u{2B07}`;

  const msgId = await sendToChannel(botToken, campaign.channelId, text, campaignDeeplink(campaign.id));
  if (msgId === null) return false;

  await prisma.channelAutopost.create({
    data: {
      campaignId: campaign.id,
      channelId: campaign.channelId,
      eventType: "campaign_opened",
      messageId: BigInt(msgId),
    },
  });
  return true;
}

export async function postMilestone(
  prisma: PrismaClient,
  botToken: string,
  campaign: AutopostCampaign,
  milestone: number,
): Promise<boolean> {
  if (!campaign.channelAutopost || !campaign.channelBotIsAdmin || !campaign.channelId) return false;

  if (await isRateLimited(prisma, campaign.id, campaign.channelId)) return false;

  const existing = await prisma.channelAutopost.findFirst({
    where: { campaignId: campaign.id, eventType: `milestone_${milestone}` },
    select: { id: true },
  });
  if (existing) return false;

  const raised = Number(campaign.raisedAmountUsd);
  const goal = Number(campaign.goalAmountUsd);
  const emoji = milestone === 100 ? "\u{1F389}" : "\u{1F525}";

  const text = milestone === 100
    ? `${emoji} <b>Цель достигнута!</b>\n\n` +
      `Сбор «${escapeHtml(campaign.title)}» собрал $${raised} из $${goal} (100%)!\n\n` +
      `Спасибо всем, кто помог \u{2764}`
    : `${emoji} <b>${milestone}% собрано!</b>\n\n` +
      `Сбор «${escapeHtml(campaign.title)}» — уже $${raised} из $${goal}.\n` +
      `Осталось совсем немного \u{1F4AA}`;

  const msgId = await sendToChannel(botToken, campaign.channelId, text, campaignDeeplink(campaign.id));
  if (msgId === null) return false;

  await prisma.channelAutopost.create({
    data: {
      campaignId: campaign.id,
      channelId: campaign.channelId,
      eventType: `milestone_${milestone}`,
      messageId: BigInt(msgId),
    },
  });
  return true;
}

export async function postDeadlineWarning(
  prisma: PrismaClient,
  botToken: string,
  campaign: AutopostCampaign,
  daysLeft: number,
): Promise<boolean> {
  if (!campaign.channelAutopost || !campaign.channelBotIsAdmin || !campaign.channelId) return false;

  if (await isRateLimited(prisma, campaign.id, campaign.channelId)) return false;

  const eventType = `deadline_${daysLeft}d`;
  const existing = await prisma.channelAutopost.findFirst({
    where: { campaignId: campaign.id, eventType },
    select: { id: true },
  });
  if (existing) return false;

  const raised = Number(campaign.raisedAmountUsd);
  const goal = Number(campaign.goalAmountUsd);
  const pctRaw = goal > 0 ? (raised / goal) * 100 : 0;
  const pct = pctRaw < 1 ? pctRaw.toFixed(2) : Math.round(pctRaw);
  const urgency = daysLeft === 1 ? "\u{26A1} Последний день!" : `\u{23F3} Осталось ${daysLeft} дня`;

  const text =
    `${urgency}\n\n` +
    `Сбор «${escapeHtml(campaign.title)}» — $${raised} из $${goal} (${pct}%).\n` +
    `Поддержите, пока есть время \u{2B07}`;

  const msgId = await sendToChannel(botToken, campaign.channelId, text, campaignDeeplink(campaign.id));
  if (msgId === null) return false;

  await prisma.channelAutopost.create({
    data: {
      campaignId: campaign.id,
      channelId: campaign.channelId,
      eventType,
      messageId: BigInt(msgId),
    },
  });
  return true;
}

export async function processDeadlineWarnings(
  prisma: PrismaClient,
  botToken: string,
  log: { info: (obj: Record<string, unknown>, msg: string) => void },
): Promise<number> {
  const now = new Date();
  const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const campaigns = await prisma.campaign.findMany({
    where: {
      channelAutopost: true,
      channelBotIsAdmin: true,
      channelId: { not: null },
      status: { in: ["active", "approved"] },
      deadline: { gte: now, lte: in3days },
    },
    select: {
      id: true,
      title: true,
      channelId: true,
      channelUsername: true,
      channelAutopost: true,
      channelBotIsAdmin: true,
      goalAmountUsd: true,
      raisedAmountUsd: true,
      deadline: true,
    },
  });

  let sent = 0;
  for (const c of campaigns) {
    if (!c.deadline || !c.channelId) continue;
    const msLeft = c.deadline.getTime() - now.getTime();
    const dLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (dLeft === 1 || dLeft === 3) {
      const ok = await postDeadlineWarning(prisma, botToken, c as AutopostCampaign, dLeft);
      if (ok) {
        log.info({ campaignId: c.id, daysLeft: dLeft }, "deadline warning sent");
        sent++;
      }
    }
  }
  return sent;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
