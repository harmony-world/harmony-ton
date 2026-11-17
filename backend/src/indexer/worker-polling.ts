import type { PrismaClient } from "@prisma/client";
import type pino from "pino";
import { parseOpCode, opToEventType } from "./parser.js";
import type { TonCenterClient, TonTransaction } from "./ton-api.js";
import { transactionExecution } from "./tx-execution.js";
import type { ApplyIndexerEvent, ProcessTxResult } from "./worker-types.js";

interface PollingDeps {
  prisma: PrismaClient;
  client: TonCenterClient;
  log: pino.Logger;
  applyEvent: ApplyIndexerEvent;
  onDonorDonationApplied?: (userId: string) => void;
}

export async function pollIndexerContract(
  deps: PollingDeps,
  addr: string,
): Promise<void> {
  const cursor = await deps.prisma.indexerCursor.findUnique({
    where: { contractAddr: addr },
  });
  const cursorLt = cursor ? BigInt(cursor.lastLt) : 0n;

  const txs = await deps.client.getTransactions(addr, { startLt: cursorLt, limit: 100 });
  if (txs.length === 0) return;

  const freshTxs = txs.filter((tx) => BigInt(tx.lt) > cursorLt);
  const skippedOldCursorCount = txs.length - freshTxs.length;
  if (freshTxs.length === 0) {
    deps.log.debug(
      {
        addr,
        fetchedCount: txs.length,
        skippedOldCursorCount,
        cursorLt: cursorLt.toString(),
      },
      "No new transactions after cursor"
    );
    return;
  }

  const stats = {
    fetchedCount: txs.length,
    newEventsCount: 0,
    skippedExistingCount: 0,
    skippedOldCursorCount,
    appliedDonationsCount: 0,
    linkedDonorCount: 0,
  };

  for (const tx of freshTxs) {
    const result = await processIndexerTx(deps, addr, tx);
    if (result.eventCreated) stats.newEventsCount += 1;
    if (result.skippedExisting) stats.skippedExistingCount += 1;
    if (result.donationApplied) stats.appliedDonationsCount += 1;
    if (result.donorLinked) stats.linkedDonorCount += 1;
  }

  const lastTx = freshTxs.reduce((max, tx) => BigInt(tx.lt) > BigInt(max.lt) ? tx : max);
  await deps.prisma.indexerCursor.upsert({
    where: { contractAddr: addr },
    create: {
      contractAddr: addr,
      lastLt: BigInt(lastTx.lt),
      lastTxHash: lastTx.hash,
    },
    update: {
      lastLt: BigInt(lastTx.lt),
      lastTxHash: lastTx.hash,
    },
  });

  if (txs.length >= 100) {
    deps.log.warn(
      { addr, fetchedCount: txs.length },
      "Full page returned — more transactions may be pending; next poll will continue from cursor",
    );
  }

  deps.log.info({ addr, ...stats, lastLt: lastTx.lt }, "Processed transactions");
}

export async function processIndexerTx(
  deps: PollingDeps,
  addr: string,
  tx: TonTransaction,
): Promise<ProcessTxResult> {
  const skipped: ProcessTxResult = {
    eventCreated: false,
    skippedExisting: false,
    donationApplied: false,
    donorLinked: false,
  };
  const body = tx.in_msg?.message_content?.body ?? tx.in_msg?.body;
  if (!body) return skipped;

  const parsed = parseOpCode(body);
  if (!parsed) return skipped;

  const eventType = opToEventType(parsed.op);
  if (!eventType) return skipped;

  if (transactionExecution(tx) === "unknown") {
    deps.log.warn(
      { addr, eventType, txHash: tx.hash, lt: tx.lt },
      "transaction outcome missing from payload — deferred to recovery polling",
    );
    return skipped;
  }

  const alreadyExists = await deps.prisma.onchainEvent.findUnique({
    where: { txHash_lt: { txHash: tx.hash, lt: BigInt(tx.lt) } },
  });
  if (alreadyExists) return { ...skipped, skippedExisting: true };

  let applyStats: {
    donationApplied: boolean;
    donorLinked: boolean;
    donorUserId?: string | null;
  } = { donationApplied: false, donorLinked: false, donorUserId: null };
  await deps.prisma.$transaction(async (tx_) => {
    await tx_.onchainEvent.create({
      data: {
        contractAddr: addr,
        eventType,
        txHash: tx.hash,
        lt: BigInt(tx.lt),
        blockSeqno: BigInt(tx.mc_block_seqno),
        payload: {
          op: parsed.op,
          opName: parsed.opName,
          from: tx.in_msg?.source ?? null,
          value: tx.in_msg?.value ?? "0",
          timestamp: tx.now,
        },
      },
    });

    applyStats = await deps.applyEvent(tx_, addr, parsed.op, tx);
  });

  if (applyStats.donationApplied && applyStats.donorUserId && deps.onDonorDonationApplied) {
    try {
      deps.onDonorDonationApplied(applyStats.donorUserId);
    } catch (err) {
      deps.log.error({ err, userId: applyStats.donorUserId }, "onDonorDonationApplied hook threw");
    }
  }

  deps.log.debug({ addr, eventType, txHash: tx.hash, lt: tx.lt }, "Event processed");
  return { eventCreated: true, skippedExisting: false, ...applyStats };
}

