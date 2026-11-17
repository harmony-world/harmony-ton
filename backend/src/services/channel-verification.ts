import type { Prisma, PrismaClient } from "@prisma/client";
import { getBotUsername } from "../config/env.js";
import { t, type Locale } from "../i18n/index.js";
import { telegramApi, type TelegramChat, type TelegramChatMember } from "./telegram-api.js";

export interface ChannelVerification {
  channelId: number;
  channelName: string;
  channelUsername: string | null;
  channelSubscribers: number;
  userRole: "creator" | "administrator";
  botIsAdmin: boolean;
}

export class ChannelVerificationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ChannelVerificationError";
    this.code = code;
  }
}

let cachedBotId: number | null = null;

async function getBotId(botToken: string): Promise<number> {
  if (cachedBotId) return cachedBotId;
  const json = await telegramApi(botToken).get<{ id: number }>("getMe");
  if (!json.ok || !json.result) throw new Error("Failed to get bot info");
  cachedBotId = json.result.id;
  return cachedBotId;
}

function resolveChannelIdentifier(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("@")) return trimmed;
  const match = trimmed.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{4,32})/);
  if (match?.[1]) return `@${match[1]}`;
  if (/^-?\d+$/.test(trimmed)) return trimmed;
  return `@${trimmed}`;
}

export async function verifyChannelOwnership(
  botToken: string,
  channelInput: string,
  userTgId: number,
  locale?: Locale,
): Promise<ChannelVerification> {
  const chatId = resolveChannelIdentifier(channelInput);
  const api = telegramApi(botToken);

  const chatJson = await api.get<TelegramChat>("getChat", { chat_id: chatId });

  if (!chatJson.ok || !chatJson.result) {
    throw new ChannelVerificationError("CHANNEL_NOT_FOUND", t(locale, "channel.notFound"));
  }

  const chat = chatJson.result;
  if (chat.type !== "channel" && chat.type !== "supergroup") {
    throw new ChannelVerificationError("CHANNEL_NOT_FOUND", t(locale, "channel.notChannel"));
  }

  const botId = await getBotId(botToken);
  let botIsAdmin = false;
  let botInChannel = false;

  const botMemberJson = await api.get<TelegramChatMember>("getChatMember", {
    chat_id: chat.id,
    user_id: botId,
  });
  if (botMemberJson.ok && botMemberJson.result) {
    const bm = botMemberJson.result;
    botInChannel = bm.status === "administrator" || bm.status === "member" || bm.status === "creator";
    botIsAdmin = bm.status === "administrator" && bm.can_post_messages === true;
  }

  if (!botInChannel) {
    throw new ChannelVerificationError(
      "BOT_NOT_IN_CHANNEL",
      t(locale, "channel.botNotInChannel", { bot: getBotUsername() }),
    );
  }

  const memberJson = await api.get<TelegramChatMember>("getChatMember", {
    chat_id: chat.id,
    user_id: userTgId,
  });

  if (!memberJson.ok || !memberJson.result) {
    throw new ChannelVerificationError("NOT_CHANNEL_ADMIN", t(locale, "channel.notAdmin"));
  }

  const member = memberJson.result;
  let userRole: "creator" | "administrator";

  if (member.status === "creator") {
    userRole = "creator";
  } else if (member.status === "administrator" && member.can_post_messages) {
    userRole = "administrator";
  } else if (member.status === "administrator") {
    throw new ChannelVerificationError(
      "INSUFFICIENT_RIGHTS",
      t(locale, "channel.insufficientRights"),
    );
  } else {
    throw new ChannelVerificationError("NOT_CHANNEL_ADMIN", t(locale, "channel.notAdmin"));
  }

  const countJson = await api.get<number>("getChatMemberCount", { chat_id: chat.id });
  const subscribers = countJson.ok && countJson.result ? countJson.result : 0;

  return {
    channelId: chat.id,
    channelName: chat.title ?? "Unknown",
    channelUsername: chat.username ? `@${chat.username}` : null,
    channelSubscribers: subscribers,
    userRole,
    botIsAdmin,
  };
}

export async function checkChannelAvailability(
  prisma: PrismaClient,
  channelId: number,
  excludeCampaignId?: string,
  locale?: Locale,
): Promise<void> {
  const activeStatuses = ["pending_moderation", "approved", "active", "deploying"];
  const where: Prisma.CampaignWhereInput = {
    channelId: BigInt(channelId),
    status: { in: activeStatuses },
    ...(excludeCampaignId ? { id: { not: excludeCampaignId } } : {}),
  };
  const existing = await prisma.campaign.findFirst({ where, select: { id: true } });
  if (existing) {
    throw new ChannelVerificationError(
      "CHANNEL_HAS_ACTIVE_CAMPAIGN",
      t(locale, "channel.hasActiveCampaign"),
    );
  }
}

export async function upsertChannelBinding(
  prisma: PrismaClient,
  userId: string,
  verification: ChannelVerification,
) {
  return prisma.channelBinding.upsert({
    where: {
      userId_channelId: { userId, channelId: BigInt(verification.channelId) },
    },
    create: {
      userId,
      channelId: BigInt(verification.channelId),
      channelUsername: verification.channelUsername,
      channelName: verification.channelName,
      channelSubscribers: verification.channelSubscribers,
      userRole: verification.userRole,
      botIsAdmin: verification.botIsAdmin,
    },
    update: {
      channelUsername: verification.channelUsername,
      channelName: verification.channelName,
      channelSubscribers: verification.channelSubscribers,
      userRole: verification.userRole,
      botIsAdmin: verification.botIsAdmin,
      lastCheckAt: new Date(),
      isValid: true,
    },
  });
}
