import type pino from "pino";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { TonCenterClient } from "./ton-api.js";

export async function loadWatchedAddresses(input: {
  prisma: PrismaClient;
  watchSet: Set<string>;
  toFriendly: (addr: string) => string;
  log: pino.Logger;
}): Promise<void> {
  const [cursors, campaigns] = await Promise.all([
    input.prisma.indexerCursor.findMany({
      select: { contractAddr: true },
    }),
    input.prisma.campaign.findMany({
      where: {
        deployStatus: "deployed",
        onchainAddress: { not: null },
      },
      select: { onchainAddress: true },
    }),
  ]);
  for (const c of cursors) {
    input.watchSet.add(input.toFriendly(c.contractAddr));
  }
  for (const c of campaigns) {
    if (c.onchainAddress) input.watchSet.add(input.toFriendly(c.onchainAddress));
  }
  input.log.info(
    { count: input.watchSet.size, cursorCount: cursors.length, deployedCampaignCount: campaigns.length },
    "Loaded watched addresses",
  );
}

export async function reconcileOnchain(input: {
  prisma: PrismaClient;
  client: TonCenterClient;
  log: pino.Logger;
}): Promise<void> {
  try {
    const campaigns = await input.prisma.campaign.findMany({
      where: {
        onchainAddress: { not: null },
        deployStatus: "deployed",
        status: { in: ["active", "approved", "completed"] },
      },
      select: {
        id: true,
        onchainAddress: true,
        raisedAmountToken: true,
        raisedAmountUsd: true,
        donorCount: true,
        status: true,
        onchainDeadline: true,
        onchainDriftAt: true,
      },
    });

    let checked = 0;
    let drifted = 0;
    for (const c of campaigns) {
      if (!c.onchainAddress) continue;
      try {
        const result = await input.client.runGetMethod(c.onchainAddress, "get_status");
        if (result.exit_code !== 0 || !result.stack || result.stack.length < 7) continue;

        type StackEntry = { type: string; value: string };
        const stack = result.stack as StackEntry[];
        const raisedTonOnchain = Number(BigInt(stack[2].value)) / 1e9;
        const raisedUsdtOnchain = Number(BigInt(stack[3].value)) / 1e6;
        const donorCountOnchain = Number(BigInt(stack[6].value));
        const dbDonorCount = c.donorCount;

        if (!c.onchainDeadline) {
          const onchainDeadline = new Date(Number(BigInt(stack[4].value)) * 1000);
          await input.prisma.campaign.update({
            where: { id: c.id },
            data: { onchainDeadline },
          });
          input.log.info(
            { campaignId: c.id, onchainDeadline: onchainDeadline.toISOString() },
            "Backfilled on-chain deadline",
          );
        }

        const [tonAgg, usdtAgg] = await Promise.all([
          input.prisma.donation.aggregate({
            where: { campaignId: c.id, token: "GRAM", status: "confirmed" },
            _sum: { amountToken: true },
          }),
          input.prisma.donation.aggregate({
            where: { campaignId: c.id, token: "USDT", status: "confirmed" },
            _sum: { amountToken: true },
          }),
        ]);
        const dbRaisedTon = Number(tonAgg._sum.amountToken ?? 0);
        const dbRaisedUsdt = Number(usdtAgg._sum.amountToken ?? 0);
        const tonDrift = Math.abs(raisedTonOnchain - dbRaisedTon);
        const usdtDrift = Math.abs(raisedUsdtOnchain - dbRaisedUsdt);
        const donorDrift = Math.abs(donorCountOnchain - dbDonorCount);

        const db = { raisedTon: dbRaisedTon, raisedUsdt: dbRaisedUsdt, donorCount: dbDonorCount };
        const onchain = {
          raisedTon: raisedTonOnchain,
          raisedUsdt: raisedUsdtOnchain,
          donorCount: donorCountOnchain,
        };

        if (tonDrift > 0.001 || usdtDrift > 0.01 || donorDrift > 0) {
          drifted++;
          input.log.warn(
            { campaignId: c.id, addr: c.onchainAddress, db, onchain },
            "Reconciliation drift detected",
          );
          await input.prisma.campaign.update({
            where: { id: c.id },
            data: {
              onchainDriftAt: new Date(),
              onchainDriftDetail: {
                db,
                onchain,
                diff: { raisedTon: tonDrift, raisedUsdt: usdtDrift, donorCount: donorDrift },
              },
            },
          });
        } else if (c.onchainDriftAt) {
          await input.prisma.campaign.update({
            where: { id: c.id },
            data: { onchainDriftAt: null, onchainDriftDetail: Prisma.DbNull },
          });
          input.log.info({ campaignId: c.id }, "Reconciliation drift cleared");
        }
        checked++;
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        input.log.debug({ campaignId: c.id, err }, "Reconciliation: getter call failed");
      }
    }
    if (checked > 0) {
      input.log.info({ checked, drifted }, "Reconciliation completed");
    }
  } catch (err) {
    input.log.error({ err }, "Reconciliation failed");
  }
}

export async function closeExpiredCampaigns(prisma: PrismaClient, log: pino.Logger): Promise<void> {
  try {
    const result = await prisma.campaign.updateMany({
      where: {
        status: { in: ["active", "approved", "pending_moderation"] },
        deadline: { lte: new Date() },
      },
      data: { status: "completed" },
    });
    if (result.count > 0) {
      log.info({ count: result.count }, "Expired campaigns marked completed");
    }
  } catch (err) {
    log.error({ err }, "Failed to close expired campaigns");
  }
}

export async function closeGoalReachedCampaigns(prisma: PrismaClient, log: pino.Logger): Promise<void> {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { in: ["active", "approved", "pending_moderation"] },
        goalAmountUsd: { gt: 0 },
      },
      select: { id: true, raisedAmountUsd: true, goalAmountUsd: true },
    });
    for (const c of campaigns) {
      if (Number(c.raisedAmountUsd) >= Number(c.goalAmountUsd)) {
        await prisma.campaign.update({
          where: { id: c.id },
          data: { status: "completed", completedAt: new Date() },
        });
        log.info({ campaignId: c.id }, "Goal-reached campaign marked completed on startup");
      }
    }
  } catch (err) {
    log.error({ err }, "Failed to close goal-reached campaigns");
  }
}

