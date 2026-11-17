import { InputFile } from "grammy";
import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DonorLevel } from "../config/emoji-status.js";
import { setRuntimeEmojiIds, areAllEmojiStatusIdsConfigured } from "../config/emoji-status.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "..", "assets", "emoji");

const LEVEL_FILES: Record<DonorLevel, { file: string; emoji: string }> = {
  1: { file: "level_1_sprout.png", emoji: "🌱" },
  2: { file: "level_2_helper.png", emoji: "🤲" },
  3: { file: "level_3_star.png", emoji: "⭐" },
  4: { file: "level_4_trophy.png", emoji: "🏆" },
  5: { file: "level_5_diamond.png", emoji: "💎" },
};

const STICKER_SET_TITLE = "HARMONY.WORLD — Уровни донора";

function stickerSetName(botUsername: string): string {
  return `harmony_levels_by_${botUsername}`;
}

export async function ensureEmojiStickerSet(app: FastifyInstance): Promise<void> {
  if (areAllEmojiStatusIdsConfigured()) {
    app.log.info("All emoji status IDs configured via env, skipping sticker set auto-setup");
    return;
  }

  if (!app.bot) {
    app.log.warn("Bot not available, skipping emoji sticker set setup");
    return;
  }

  const botInfo = await app.bot.api.getMe();
  const setName = stickerSetName(botInfo.username);
  const ownerId = Number(
    process.env.STICKER_SET_OWNER_ID ??
    process.env.OPS_ALERT_TG_USER_ID ??
    process.env.OPS_TG_USER_ID ??
    "0",
  );

  if (!ownerId) {
    app.log.warn("No STICKER_SET_OWNER_ID or OPS_TG_USER_ID set, skipping emoji sticker set setup");
    return;
  }

  try {
    const existing = await app.bot.api.getStickerSet(setName);
    const ids = extractCustomEmojiIds(existing.stickers);
    if (ids) {
      setRuntimeEmojiIds(ids);
      if (existing.title !== STICKER_SET_TITLE) {
        await app.bot.api.setStickerSetTitle(setName, STICKER_SET_TITLE);
        app.log.info({ setName, oldTitle: existing.title, newTitle: STICKER_SET_TITLE }, "Updated sticker set title");
      }
      app.log.info({ setName, ids }, "Loaded existing emoji sticker set");
      return;
    }
    app.log.warn({ setName }, "Existing sticker set has wrong number of stickers, will recreate");
  } catch {
    app.log.info({ setName }, "Emoji sticker set not found, creating...");
  }

  try {
    await createEmojiStickerSet(app, setName, ownerId);
    const created = await app.bot.api.getStickerSet(setName);
    const ids = extractCustomEmojiIds(created.stickers);
    if (ids) {
      setRuntimeEmojiIds(ids);
      app.log.info({ setName, ids }, "Created emoji sticker set");
    } else {
      app.log.error({ setName }, "Created sticker set but could not extract IDs");
    }
  } catch (err) {
    app.log.error({ err, setName }, "Failed to create emoji sticker set");
  }
}

function extractCustomEmojiIds(
  stickers: Array<{ custom_emoji_id?: string }>,
): Record<DonorLevel, string> | null {
  if (stickers.length < 5) return null;
  const ids: Partial<Record<DonorLevel, string>> = {};
  for (let i = 0; i < 5; i++) {
    const id = stickers[i]?.custom_emoji_id;
    if (!id) return null;
    ids[(i + 1) as DonorLevel] = id;
  }
  return ids as Record<DonorLevel, string>;
}

async function createEmojiStickerSet(
  app: FastifyInstance,
  setName: string,
  ownerId: number,
): Promise<void> {
  const stickers = await Promise.all(
    ([1, 2, 3, 4, 5] as DonorLevel[]).map(async (level) => {
      const info = LEVEL_FILES[level];
      const buf = await readFile(join(ASSETS_DIR, info.file));
      return {
        sticker: new InputFile(buf, info.file),
        emoji_list: [info.emoji],
        format: "static" as const,
      };
    }),
  );

  await app.bot!.api.createNewStickerSet(
    ownerId,
    setName,
    STICKER_SET_TITLE,
    stickers,
    { sticker_type: "custom_emoji" },
  );
}
