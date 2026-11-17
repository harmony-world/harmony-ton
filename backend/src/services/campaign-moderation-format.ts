import { InlineKeyboard } from "grammy";
import { getWebAppUrl } from "../config/env.js";
import type { CampaignScreenerInput, CampaignScreenerVerdict } from "./campaign-auto-screener.js";

export type ModeratorIdentity = {
  tgUserId: bigint;
  username?: string | null;
  firstName?: string | null;
};

export type ModerationCampaignCard = {
  id: string;
  title: string;
  story: string;
  category: string;
  goalAmountUsd: unknown;
  deadline: Date | string | null;
  payoutAddress: string;
  photos: string[];
  creator: {
    tgUserId: bigint;
    tgUsername: string | null;
    tgFirstName: string | null;
    kycLevel: number;
  };
};

export const MODERATION_ACTIONS = {
  approve: "approve",
  reject: "reject",
} as const;

export function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

export function formatDate(value: Date | string | null): string {
  if (!value) return "не указан";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "не указан";
  return date.toISOString().slice(0, 10);
}

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, getWebAppUrl()).toString();
}

export function buildModerationText(
  campaign: ModerationCampaignCard,
  screenerVerdict: CampaignScreenerVerdict | null = null,
): string {
  const creatorName = campaign.creator.tgFirstName ?? "Без имени";
  const creatorUsername = campaign.creator.tgUsername ? `@${campaign.creator.tgUsername}` : "username не указан";
  const story = campaign.story.length > 1200 ? `${campaign.story.slice(0, 1200)}...` : campaign.story;

  return [
    "Новая кампания на модерации",
    "",
    `Название: ${campaign.title}`,
    `Категория: ${campaign.category}`,
    `Цель: $${Number(campaign.goalAmountUsd).toLocaleString("en-US")}`,
    `Срок: ${formatDate(campaign.deadline)}`,
    `Автор: ${creatorName} ${creatorUsername}`,
    `KYC: KYC ${campaign.creator.kycLevel}`,
    `Кошелёк выплат: ${shortAddress(campaign.payoutAddress)}`,
    "",
    "Описание:",
    story,
    buildScreenerReportBlock(screenerVerdict),
  ].join("\n");
}

export function moderationKeyboard(campaignId: string, includeFeedback: boolean) {
  const kb = new InlineKeyboard()
    .text("Согласовать", `mod:${MODERATION_ACTIONS.approve}:${campaignId}`)
    .text("Отклонить", `mod:${MODERATION_ACTIONS.reject}:${campaignId}`);
  if (includeFeedback) {
    kb.row()
      .text("👍 Мозг был прав", `mod:fb:ok:${campaignId}`)
      .text("👎 Мозг ошибся", `mod:fb:bad:${campaignId}`);
  }
  return kb;
}

export function buildAutoRejectText(input: {
  screenerInput: CampaignScreenerInput;
  verdict: CampaignScreenerVerdict;
  creatorTgUserId: bigint;
  creatorFirstName?: string | null;
  creatorUsername?: string | null;
}): string {
  const { screenerInput: si, verdict } = input;
  const story = si.story.length > 800 ? `${si.story.slice(0, 800)}...` : si.story;

  return [
    "\u{1F916} Авто-отклонение",
    "",
    `Название: ${si.title}`,
    `Категория: ${si.category}`,
    `Цель: $${si.goalAmountUsd.toLocaleString("en-US")}`,
    `Срок: ${formatDate(si.deadline)}`,
    `Автор: ${input.creatorFirstName ?? "Без имени"} ${input.creatorUsername ? `@${input.creatorUsername}` : `(tg:${input.creatorTgUserId})`}`,
    `KYC: ${si.user.kycLevel}`,
    `Кошелёк выплат: ${shortAddress(si.payoutAddress)}`,
    "",
    "Описание:",
    story,
    "",
    `Причины: ${verdict.reasonCodes.join(", ")}`,
    verdict.humanMessage ? `\nОбъяснение:\n${verdict.humanMessage}` : "",
    "",
    `Скринер: ${verdict.screenerVersion}`,
  ].join("\n");
}

function buildScreenerReportBlock(verdict: CampaignScreenerVerdict | null): string {
  return verdict ? "\nManual review is required." : "";
}
