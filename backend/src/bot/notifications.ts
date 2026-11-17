import type { Api } from "grammy";
import { t, type Locale } from "../i18n/index.js";

export function hasTelegramChat(tgUserId: bigint): boolean {
  return tgUserId > 0n;
}

export async function sendNewDonation(
  api: Api,
  tgUserId: bigint,
  amountUsd: string,
  campaignTitle: string,
  locale?: Locale | string | null,
): Promise<void> {
  if (!hasTelegramChat(tgUserId)) return;
  await api.sendMessage(
    Number(tgUserId),
    t(locale, "bot.newDonation", { amountUsd, campaignTitle })
  );
}

export async function sendCampaignApproved(
  api: Api,
  tgUserId: bigint,
  campaignTitle: string,
  locale?: Locale | string | null,
): Promise<void> {
  if (!hasTelegramChat(tgUserId)) return;
  await api.sendMessage(
    Number(tgUserId),
    t(locale, "bot.campaignApproved", { campaignTitle })
  );
}

export async function sendCampaignRejected(
  api: Api,
  tgUserId: bigint,
  campaignTitle: string,
  reason?: string | null,
  locale?: Locale | string | null,
): Promise<void> {
  if (!hasTelegramChat(tgUserId)) return;
  await api.sendMessage(
    Number(tgUserId),
    reason
      ? t(locale, "bot.campaignRejected", { campaignTitle, reason })
      : t(locale, "bot.campaignRejectedNoReason", { campaignTitle })
  );
}

const lastOpsAlertSentAt = new Map<string, number>();

export function shouldSendOpsAlert(key: string, now = Date.now()): boolean {
  const intervalMs = Number(process.env.OPS_ALERT_RATE_LIMIT_MS ?? 30 * 60 * 1000);
  const lastSentAt = lastOpsAlertSentAt.get(key) ?? 0;
  if (now - lastSentAt < intervalMs) return false;
  lastOpsAlertSentAt.set(key, now);
  return true;
}

export async function sendManualReconcileAlert(
  api: Api,
  tgUserId: bigint,
  opts: {
    campaignId: string;
    campaignTitle: string;
    attempts: number;
  }
): Promise<void> {
  await api.sendMessage(
    Number(tgUserId),
    [
      `⚠️ Кампания требует ручной сверки (needs_manual_reconcile)`,
      `Кампания: ${opts.campaignTitle} (${opts.campaignId})`,
      `Попыток деплоя: ${opts.attempts}`,
      "Действие: проверить HarmonyMaster registry on-chain и сопоставить с БД.",
    ].join("\n")
  );
}

export async function sendDeployerLowBalanceAlert(
  api: Api,
  tgUserId: bigint,
  opts: {
    address: string;
    balanceGram: string;
    minBalanceGram: string;
    campaignId: string;
    campaignTitle: string;
  }
): Promise<void> {
  await api.sendMessage(
    Number(tgUserId),
    [
      `⚠️ Баланс деплойера Harmony ниже ${opts.minBalanceGram} GRAM`,
      `Адрес: ${opts.address}`,
      `Баланс: ${opts.balanceGram} GRAM`,
      `Кампания: ${opts.campaignTitle} (${opts.campaignId})`,
      "Действие: пополнить deployer и повторить deploy.",
    ].join("\n")
  );
}

export async function sendDeployFailedAlert(
  api: Api,
  tgUserId: bigint,
  opts: {
    campaignId: string;
    campaignTitle: string;
    attempts: number;
    error: string;
    afterSend: boolean;
  }
): Promise<void> {
  await api.sendMessage(
    Number(tgUserId),
    [
      `⚠️ Деплой кампании не удался`,
      `Кампания: ${opts.campaignTitle} (${opts.campaignId})`,
      `Попыток: ${opts.attempts}`,
      `Ошибка: ${opts.error.slice(0, 300)}`,
      opts.afterSend
        ? "Упало после отправки транзакции — перед повтором проверить HarmonyMaster on-chain, чтобы не задеплоить дважды."
        : "До блокчейна ничего не дошло — повтор безопасен: кнопка «Повторить деплой» у создателя или в админке.",
    ].join("\n")
  );
}
