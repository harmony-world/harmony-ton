import type { Bot } from "grammy";
import type { PrismaClient } from "@prisma/client";
import { InputFile } from "grammy";
import path from "node:path";
import fs from "node:fs/promises";

const MEDIA_STORAGE_CHAT_ID = Number(process.env.MEDIA_STORAGE_CHAT_ID ?? "0");

export async function ensureTelegramPhotoId(
  bot: Bot,
  prisma: PrismaClient,
  campaign: { id: string; photos: string[]; tgPhotoFileId: string | null },
  uploadsDir: string,
): Promise<string | null> {
  if (campaign.tgPhotoFileId) return campaign.tgPhotoFileId;
  if (campaign.photos.length === 0) return null;
  if (!MEDIA_STORAGE_CHAT_ID) return null;

  const filePath = path.join(uploadsDir, path.basename(campaign.photos[0]!));
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  const msg = await bot.api.sendPhoto(MEDIA_STORAGE_CHAT_ID, new InputFile(filePath));
  const biggest = msg.photo[msg.photo.length - 1]!;
  const fileId = biggest.file_id;

  await bot.api.deleteMessage(MEDIA_STORAGE_CHAT_ID, msg.message_id).catch(() => {});

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { tgPhotoFileId: fileId },
  });

  return fileId;
}
