import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_UPLOAD_ORPHAN_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_UPLOAD_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const UPLOAD_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png)$/i;

export interface UploadCleanupResult {
  deleted: string[];
  skipped: string[];
}

export function resolveUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.resolve(import.meta.dirname, "../../../uploads");
}

export function parseUploadUrl(url: string): { filename: string; normalizedUrl: string } | null {
  if (!url.startsWith("/uploads/")) return null;

  const filename = url.slice("/uploads/".length);
  if (
    !filename ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("?") ||
    filename.includes("#") ||
    filename.includes("..") ||
    !UPLOAD_FILENAME_RE.test(filename)
  ) {
    return null;
  }

  return { filename, normalizedUrl: `/uploads/${filename}` };
}

async function findReferencedUploadUrls(
  prisma: PrismaClient,
  urls: string[],
): Promise<Set<string>> {
  if (urls.length === 0) return new Set();

  const [campaigns, expenseReports] = await Promise.all([
    prisma.campaign.findMany({
      where: { photos: { hasSome: urls } },
      select: { photos: true },
    }),
    prisma.expenseReport.findMany({
      where: { photos: { hasSome: urls } },
      select: { photos: true },
    }),
  ]);

  return new Set([
    ...campaigns.flatMap((c) => c.photos),
    ...expenseReports.flatMap((r) => r.photos),
  ]);
}

export async function deleteUnreferencedUploads(params: {
  prisma: PrismaClient;
  uploadsDir: string;
  urls: string[];
  logger?: FastifyBaseLogger;
}): Promise<UploadCleanupResult> {
  const parsed = params.urls.map((url) => ({ url, parsed: parseUploadUrl(url) }));
  const valid = parsed.flatMap((item) => (item.parsed ? [item.parsed] : []));
  const invalid = parsed.flatMap((item) => (item.parsed ? [] : [item.url]));
  const uniqueValid = Array.from(new Map(valid.map((item) => [item.normalizedUrl, item])).values());
  const normalizedUrls = uniqueValid.map((item) => item.normalizedUrl);
  const referenced = await findReferencedUploadUrls(params.prisma, normalizedUrls);
  const deleted: string[] = [];
  const skipped = [...invalid];

  for (const item of uniqueValid) {
    if (referenced.has(item.normalizedUrl)) {
      skipped.push(item.normalizedUrl);
      continue;
    }

    try {
      await fs.rm(path.join(params.uploadsDir, item.filename), { force: true });
      deleted.push(item.normalizedUrl);
    } catch (err) {
      skipped.push(item.normalizedUrl);
      params.logger?.warn({ err, url: item.normalizedUrl }, "failed to delete upload");
    }
  }

  return { deleted, skipped };
}

export async function sweepOrphanUploads(params: {
  prisma: PrismaClient;
  uploadsDir: string;
  ttlMs?: number;
  now?: number;
  logger?: FastifyBaseLogger;
}): Promise<UploadCleanupResult> {
  const ttlMs = params.ttlMs ?? DEFAULT_UPLOAD_ORPHAN_TTL_MS;
  const now = params.now ?? Date.now();
  let entries: string[];

  try {
    entries = await fs.readdir(params.uploadsDir);
  } catch (err) {
    params.logger?.warn({ err, uploadsDir: params.uploadsDir }, "failed to read uploads dir");
    return { deleted: [], skipped: [] };
  }

  const urls: string[] = [];
  for (const filename of entries) {
    const parsed = parseUploadUrl(`/uploads/${filename}`);
    if (!parsed) continue;

    try {
      const stat = await fs.stat(path.join(params.uploadsDir, filename));
      if (stat.mtimeMs < now - ttlMs) {
        urls.push(parsed.normalizedUrl);
      }
    } catch (err) {
      params.logger?.warn({ err, filename }, "failed to stat upload");
    }
  }

  if (urls.length === 0) return { deleted: [], skipped: [] };

  return deleteUnreferencedUploads({
    prisma: params.prisma,
    uploadsDir: params.uploadsDir,
    urls,
    logger: params.logger,
  });
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startUploadCleanup(params: {
  prisma: PrismaClient;
  uploadsDir: string;
  logger?: FastifyBaseLogger;
  ttlMs?: number;
  intervalMs?: number;
}): void {
  stopUploadCleanup();

  const ttlMs = params.ttlMs ?? Number(process.env.UPLOAD_ORPHAN_TTL_MS ?? DEFAULT_UPLOAD_ORPHAN_TTL_MS);
  const intervalMs =
    params.intervalMs ??
    Number(process.env.UPLOAD_CLEANUP_INTERVAL_MS ?? DEFAULT_UPLOAD_CLEANUP_INTERVAL_MS);

  const run = async () => {
    const result = await sweepOrphanUploads({
      prisma: params.prisma,
      uploadsDir: params.uploadsDir,
      ttlMs,
      logger: params.logger,
    });
    if (result.deleted.length > 0) {
      params.logger?.info({ deleted: result.deleted.length }, "orphan uploads cleaned");
    }
  };

  void run();
  cleanupTimer = setInterval(() => void run(), intervalMs);
}

export function stopUploadCleanup(): void {
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
