import type { FastifyInstance } from "fastify";
import {
  verifyChannelOwnership,
  checkChannelAvailability,
  upsertChannelBinding,
  ChannelVerificationError,
} from "../services/channel-verification.js";
import { requireEnv } from "../config/env.js";
import { telegramApi, type TelegramChat, type TelegramFile } from "../services/telegram-api.js";

interface ChannelInfo {
  name: string;
  username: string;
  avatar_url: string | null;
  subscribers: number;
}

interface CacheEntry {
  data: ChannelInfo;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const TELEGRAM_FILE_PATH_RE = /^[a-zA-Z0-9_./-]{1,180}$/;

function extractUsername(link: string): string | null {
  const trimmed = link.trim();
  if (trimmed.startsWith("@")) return trimmed.slice(1);
  const match = trimmed.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{4,32})/);
  if (match?.[1]) return match[1];
  return null;
}

async function fetchChannelInfo(username: string, botToken: string): Promise<ChannelInfo> {
  const api = telegramApi(botToken);
  const [chatJson, countJson] = await Promise.all([
    api.get<TelegramChat>("getChat", { chat_id: `@${username}` }),
    api.get<number>("getChatMemberCount", { chat_id: `@${username}` }),
  ]);

  if (!chatJson.ok) throw new Error(chatJson.description ?? "chat not found");

  const chat = chatJson.result!;
  const name = chat.title ?? username;
  const resolvedUsername = chat.username ?? username;
  const subscribers = countJson.ok && countJson.result != null ? countJson.result : 0;

  let avatar_url: string | null = null;
  if (chat.photo?.small_file_id) {
    const fileJson = await api.get<TelegramFile>("getFile", { file_id: chat.photo.small_file_id });
    if (fileJson.ok && fileJson.result?.file_path) {
      avatar_url = `/channels/avatar?path=${encodeURIComponent(fileJson.result.file_path)}`;
    }
  }

  return { name, username: `@${resolvedUsername}`, avatar_url, subscribers };
}

function isSafeTelegramFilePath(filePath: string): boolean {
  return (
    TELEGRAM_FILE_PATH_RE.test(filePath) &&
    !filePath.startsWith("/") &&
    !filePath.includes("..") &&
    !filePath.includes("\\")
  );
}

export async function fetchChannelAvatarUrl(botToken: string, username: string): Promise<string | null> {
  const api = telegramApi(botToken);
  try {
    const chatJson = await api.get<TelegramChat>("getChat", { chat_id: `@${username}` });
    if (chatJson.ok && chatJson.result?.photo?.small_file_id) {
      const fileJson = await api.get<TelegramFile>("getFile", { file_id: chatJson.result.photo.small_file_id });
      if (fileJson.ok && fileJson.result?.file_path) {
        return `/channels/avatar?path=${encodeURIComponent(fileJson.result.file_path)}`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function channelRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { path: string } }>(
    "/channels/avatar",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["path"],
          additionalProperties: false,
          properties: {
            path: { type: "string", minLength: 1, maxLength: 180 },
          },
        },
      },
    },
    async (request, reply) => {
      const filePath = request.query.path;
      if (!isSafeTelegramFilePath(filePath)) {
        return reply.code(400).send({ error: "Invalid avatar path" });
      }

      const botToken = requireEnv("BOT_TOKEN");

      const telegramRes = await telegramApi(botToken).fetchFile(filePath);
      if (!telegramRes.ok) {
        return reply.code(404).send({ error: "Avatar not found" });
      }

      const contentType = telegramRes.headers.get("content-type") ?? "image/jpeg";
      if (!contentType.startsWith("image/")) {
        return reply.code(502).send({ error: "Unexpected avatar content type" });
      }

      const buf = Buffer.from(await telegramRes.arrayBuffer());
      return reply
        .header("content-type", contentType)
        .header("cache-control", "public, max-age=300")
        .header("x-content-type-options", "nosniff")
        .send(buf);
    }
  );

  app.get<{ Querystring: { link: string } }>(
    "/channels/info",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["link"],
          properties: { link: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { link } = request.query;
      const username = extractUsername(link);
      if (!username) {
        return reply.code(400).send({ error: "Invalid channel link" });
      }

      const cacheKey = username.toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }

      const botToken = requireEnv("BOT_TOKEN");

      let info: ChannelInfo;
      try {
        info = await fetchChannelInfo(username, botToken);
      } catch {
        return reply.code(404).send({ error: "Channel not found or bot has no access" });
      }

      cache.set(cacheKey, { data: info, expiresAt: Date.now() + CACHE_TTL_MS });
      return info;
    }
  );

  app.post<{ Body: { link: string } }>(
    "/channels/verify",
    {
      schema: {
        body: {
          type: "object",
          required: ["link"],
          properties: {
            link: { type: "string", minLength: 1, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const botToken = requireEnv("BOT_TOKEN");

      const { link } = request.body;
      const userTgId = Number(request.user.tgUserId);

      try {
        const verification = await verifyChannelOwnership(botToken, link, userTgId, request.locale);

        let hasActiveCampaign = false;
        try {
          await checkChannelAvailability(app.prisma, verification.channelId, undefined, request.locale);
        } catch (err) {
          if (err instanceof ChannelVerificationError && err.code === "CHANNEL_HAS_ACTIVE_CAMPAIGN") {
            hasActiveCampaign = true;
          } else {
            throw err;
          }
        }

        await upsertChannelBinding(app.prisma, request.user.id, verification);

        let avatarUrl: string | null = null;
        if (verification.channelUsername) {
          avatarUrl = await fetchChannelAvatarUrl(botToken, verification.channelUsername.replace("@", ""));
        }

        return {
          channelId: verification.channelId,
          name: verification.channelName,
          username: verification.channelUsername,
          subscribers: verification.channelSubscribers,
          avatarUrl,
          userRole: verification.userRole,
          botIsAdmin: verification.botIsAdmin,
          hasActiveCampaign,
        };
      } catch (err) {
        if (err instanceof ChannelVerificationError) {
          const statusCode = err.code === "NOT_CHANNEL_ADMIN" || err.code === "INSUFFICIENT_RIGHTS" ? 403 : 400;
          return reply.code(statusCode).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
}
