import type { PrismaClient } from "@prisma/client";

export async function cleanupExpiredPendingRejects(prisma: PrismaClient): Promise<number> {
  const result = await prisma.pendingModerationReject.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
