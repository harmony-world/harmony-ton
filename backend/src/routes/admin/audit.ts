import type { PrismaClient } from "@prisma/client";

interface AuditEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  env: string;
  ipAddress?: string;
}

export async function writeAuditLog(
  prisma: PrismaClient,
  entry: AuditEntry,
): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: (entry.details as never) ?? undefined,
      env: entry.env,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

export function currentEnv(): string {
  return process.env.TON_NETWORK === "mainnet" ? "mainnet" : "testnet";
}
