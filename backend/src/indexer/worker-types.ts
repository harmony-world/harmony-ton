import type { Prisma, PrismaClient } from "@prisma/client";
import type pino from "pino";
import type { TonCenterClient, TonTransaction } from "./ton-api.js";

export interface ProcessTxResult {
  eventCreated: boolean;
  skippedExisting: boolean;
  donationApplied: boolean;
  donorLinked: boolean;
  donorUserId?: string | null;
}

export type ApplyIndexerEvent = (
  tx: Prisma.TransactionClient,
  contractAddr: string,
  op: number,
  raw: TonTransaction,
) => Promise<{ donationApplied: boolean; donorLinked: boolean; donorUserId?: string | null }>;

export interface IndexerWorkerDeps {
  prisma: PrismaClient;
  client: TonCenterClient;
  log: pino.Logger;
}

