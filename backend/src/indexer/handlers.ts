import { type Prisma, type PrismaClient } from "@prisma/client";
import type pino from "pino";
import { parseDonateBody, parseTransferNotificationBody, OP } from "./parser.js";
import { revertExitCode, transactionExecution } from "./tx-execution.js";
import type { TonTransaction } from "./ton-api.js";
import { getTonPrice } from "../services/price.js";
import { donorStatusFor, recomputeUserDonationStats } from "../services/user-stats.js";
import { checkMilestone, postMilestone } from "../services/channel-autopost.js";
import { tonAddressCandidates } from "../utils/ton-address.js";

export interface ApplyEventDeps {
  prisma: PrismaClient;
  log: pino.Logger;
  testnet: boolean;
  toFriendly: (addr: string) => string;
}

export type ApplyEventResult = {
  donationApplied: boolean;
  donorLinked: boolean;
  donorUserId?: string | null;
};

const NO_DONATION: ApplyEventResult = { donationApplied: false, donorLinked: false, donorUserId: null };
const GRAM_DONATION_MATCH_TOLERANCE = 0.000000001;
const JETTON_DONATION_MATCH_TOLERANCE = 0.000001;
const BASIS_POINTS_DENOMINATOR = 10_000n;

function donationReverted(deps: ApplyEventDeps, raw: TonTransaction, token: string): boolean {
  if (transactionExecution(raw) !== "reverted") return false;
  deps.log.warn(
    { txHash: raw.hash, lt: raw.lt, token, exitCode: revertExitCode(raw) },
    "transaction reverted on chain — donation not recorded",
  );
  return true;
}

const STATUS_MAP: Record<number, string> = {
  [OP.Freeze]: "frozen",
  [OP.Unfreeze]: "active",
};

type DonationIntentMatch = {
  id: string;
  donorId: string | null;
  donorTgUserId: bigint | null;
  donorName: string | null;
  isAnonymous: boolean;
};

async function matchDonationIntent(
  tx: Prisma.TransactionClient,
  testnet: boolean,
  opts: {
    campaignId: string;
    donorAddress: string;
    amountToken: number;
    token: string;
    donationAt: Date;
  },
): Promise<DonationIntentMatch | null> {
  const donationIntent = (
    tx as Prisma.TransactionClient & {
      donationIntent?: Prisma.TransactionClient["donationIntent"];
    }
  ).donationIntent;
  if (!donationIntent) return null;

  const amountTolerance = opts.token === "GRAM"
    ? GRAM_DONATION_MATCH_TOLERANCE
    : JETTON_DONATION_MATCH_TOLERANCE;
  const donorAddresses = tonAddressCandidates(opts.donorAddress, testnet);
  const intent = await donationIntent.findFirst({
    where: {
      campaignId: opts.campaignId,
      donorAddress: { in: donorAddresses },
      token: opts.token,
      matchedAt: null,
      createdAt: { lte: opts.donationAt },
      expiresAt: { gte: opts.donationAt },
      amountToken: {
        gte: Math.max(0, opts.amountToken - amountTolerance),
        lte: opts.amountToken + amountTolerance,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      donorId: true,
      donorTgUserId: true,
      donorName: true,
      isAnonymous: true,
    },
  });

  if (!intent) return null;

  await donationIntent.update({
    where: { id: intent.id },
    data: { matchedAt: opts.donationAt },
  });

  return intent;
}

export async function handleDonate(
  tx: Prisma.TransactionClient,
  deps: ApplyEventDeps,
  contractAddr: string,
  raw: TonTransaction,
): Promise<ApplyEventResult> {
  if (donationReverted(deps, raw, "GRAM")) return NO_DONATION;

  const friendlyAddr = deps.toFriendly(contractAddr);
  const campaign = await tx.campaign.findUnique({
    where: { onchainAddress: friendlyAddr },
    select: { id: true, isPublic: true },
  });
  if (!campaign) return NO_DONATION;

  const donorAddr = raw.in_msg?.source ?? "";
  const friendlyDonorAddr = deps.toFriendly(donorAddr);
  const totalNano = BigInt(raw.in_msg?.value ?? "0");
  const body = raw.in_msg?.message_content?.body ?? raw.in_msg?.body;
  const donateBody = body ? parseDonateBody(body) : null;
  const tipBps = donateBody?.tipBps ?? 0;
  const tipNano = totalNano * BigInt(tipBps) / BASIS_POINTS_DENOMINATOR;
  const netNano = totalNano - tipNano;
  const amountTon = Number(netNano) / 1e9;
  const tipAmountTon = Number(tipNano) / 1e9;
  const totalTon = Number(totalNano) / 1e9;
  const tonPrice = getTonPrice();
  if (tonPrice <= 0) {
    deps.log.warn(
      { txHash: raw.hash, amountTon },
      "TON price is 0 — USD values will be recorded as 0; reconciliation will backfill",
    );
  }
  const amountUsd = amountTon * tonPrice;
  const tipAmountUsd = tipAmountTon * tonPrice;
  const donationAt = new Date(raw.now * 1000);
  const existingDonation = await tx.donation.findUnique({
    where: { txHash_lt: { txHash: raw.hash, lt: BigInt(raw.lt) } },
    select: { id: true },
  });
  if (existingDonation) return NO_DONATION;

  const donor = donorAddr
    ? await tx.user.findFirst({
        where: {
          OR: [
            { walletAddress: { in: tonAddressCandidates(donorAddr, deps.testnet) } },
            { walletFriendly: { in: tonAddressCandidates(friendlyDonorAddr, deps.testnet) } },
          ],
        },
        select: { id: true, tgUserId: true, totalDonatedUsd: true },
      })
    : null;
  const intent = await matchDonationIntent(tx, deps.testnet, {
    campaignId: campaign.id,
    donorAddress: friendlyDonorAddr || donorAddr,
    amountToken: totalTon,
    token: "GRAM",
    donationAt,
  });

  const resolvedDonor = donor ?? (intent?.donorId
    ? await tx.user.findUnique({
        where: { id: intent.donorId },
        select: { id: true, tgUserId: true, totalDonatedUsd: true },
      })
    : null);

  await tx.donation.create({
    data: {
      campaignId: campaign.id,
      donorId: resolvedDonor?.id ?? null,
      donorTgUserId: resolvedDonor?.tgUserId ?? null,
      donorAddress: friendlyDonorAddr || donorAddr,
      amountToken: amountTon,
      amountUsd,
      tipAmountToken: tipAmountTon,
      tipAmountUsd,
      token: "GRAM",
      txHash: raw.hash,
      lt: BigInt(raw.lt),
      blockSeqno: BigInt(raw.mc_block_seqno),
      status: "confirmed",
      isAnonymous: intent?.isAnonymous ?? false,
      message: intent?.isAnonymous ? null : intent?.donorName ?? null,
    },
  });

  return applyPostDonation(tx, deps, campaign, resolvedDonor, amountTon, amountUsd, raw);
}

export async function handleTransferNotification(
  tx: Prisma.TransactionClient,
  deps: ApplyEventDeps,
  contractAddr: string,
  raw: TonTransaction,
): Promise<ApplyEventResult> {
  if (donationReverted(deps, raw, "USDT")) return NO_DONATION;

  const friendlyAddr = deps.toFriendly(contractAddr);
  const campaign = await tx.campaign.findUnique({
    where: { onchainAddress: friendlyAddr },
    select: { id: true, isPublic: true },
  });
  if (!campaign) return NO_DONATION;

  const body = raw.in_msg?.message_content?.body ?? raw.in_msg?.body;
  const transferBody = body ? parseTransferNotificationBody(body) : null;
  if (!transferBody) return NO_DONATION;

  const senderAddr = transferBody.sender;
  const friendlySenderAddr = deps.toFriendly(senderAddr);
  const totalUnits = transferBody.amount;
  const tipBps = transferBody.tipBps ?? 0;
  const tipUnits = totalUnits * BigInt(tipBps) / BASIS_POINTS_DENOMINATOR;
  const netUnits = totalUnits - tipUnits;
  const amountUsdt = Number(netUnits) / 1e6;
  const tipAmountUsdt = Number(tipUnits) / 1e6;
  const totalUsdt = Number(totalUnits) / 1e6;
  const amountUsd = amountUsdt;
  const tipAmountUsd = tipAmountUsdt;
  const donationAt = new Date(raw.now * 1000);
  const existingDonation = await tx.donation.findUnique({
    where: { txHash_lt: { txHash: raw.hash, lt: BigInt(raw.lt) } },
    select: { id: true },
  });
  if (existingDonation) return NO_DONATION;

  const donor = senderAddr
    ? await tx.user.findFirst({
        where: {
          OR: [
            { walletAddress: { in: tonAddressCandidates(senderAddr, deps.testnet) } },
            { walletFriendly: { in: tonAddressCandidates(friendlySenderAddr, deps.testnet) } },
          ],
        },
        select: { id: true, tgUserId: true, totalDonatedUsd: true },
      })
    : null;
  const intent = await matchDonationIntent(tx, deps.testnet, {
    campaignId: campaign.id,
    donorAddress: friendlySenderAddr || senderAddr,
    amountToken: totalUsdt,
    token: "USDT",
    donationAt,
  });

  const resolvedDonor = donor ?? (intent?.donorId
    ? await tx.user.findUnique({
        where: { id: intent.donorId },
        select: { id: true, tgUserId: true, totalDonatedUsd: true },
      })
    : null);

  await tx.donation.create({
    data: {
      campaignId: campaign.id,
      donorId: resolvedDonor?.id ?? null,
      donorTgUserId: resolvedDonor?.tgUserId ?? null,
      donorAddress: friendlySenderAddr || senderAddr,
      amountToken: amountUsdt,
      amountUsd,
      tipAmountToken: tipAmountUsdt,
      tipAmountUsd,
      token: "USDT",
      txHash: raw.hash,
      lt: BigInt(raw.lt),
      blockSeqno: BigInt(raw.mc_block_seqno),
      status: "confirmed",
      isAnonymous: intent?.isAnonymous ?? false,
      message: intent?.isAnonymous ? null : intent?.donorName ?? null,
    },
  });

  return applyPostDonation(tx, deps, campaign, resolvedDonor, amountUsdt, amountUsd, raw);
}

async function applyPostDonation(
  tx: Prisma.TransactionClient,
  deps: ApplyEventDeps,
  campaign: { id: string; isPublic: boolean },
  donor: { id: string; tgUserId: bigint; totalDonatedUsd: Prisma.Decimal | number } | null,
  amountToken: number,
  amountUsd: number,
  raw: TonTransaction,
): Promise<ApplyEventResult> {
  const updated = await tx.campaign.update({
    where: { id: campaign.id },
    data: {
      raisedAmountToken: { increment: amountToken },
      raisedAmountUsd: { increment: amountUsd },
      donorCount: { increment: 1 },
    },
    select: {
      id: true, title: true, raisedAmountUsd: true, goalAmountUsd: true, status: true,
      channelId: true, channelUsername: true, channelAutopost: true, channelBotIsAdmin: true, deadline: true,
    },
  });

  if (
    updated.status !== "completed" &&
    Number(updated.raisedAmountUsd) >= Number(updated.goalAmountUsd) &&
    Number(updated.goalAmountUsd) > 0
  ) {
    await tx.campaign.update({
      where: { id: updated.id },
      data: { status: "completed", completedAt: new Date(raw.now * 1000) },
    });
    deps.log.info({ campaignId: updated.id }, "Campaign goal reached — marked completed");
  }

  if (updated.channelAutopost && updated.channelBotIsAdmin && updated.channelId) {
    const prevRaised = Number(updated.raisedAmountUsd) - amountUsd;
    const milestone = checkMilestone(prevRaised, Number(updated.raisedAmountUsd), Number(updated.goalAmountUsd));
    if (milestone !== null) {
      const botToken = process.env.BOT_TOKEN;
      if (botToken) {
        postMilestone(deps.prisma, botToken, updated as Parameters<typeof postMilestone>[2], milestone)
          .catch((err) => deps.log.error({ err, campaignId: updated.id, milestone }, "autopost milestone failed"));
      }
    }
  }

  if (donor && campaign.isPublic !== false) {
    const nextTotalUsd = Number(donor.totalDonatedUsd) + amountUsd;
    await tx.user.update({
      where: { id: donor.id },
      data: {
        totalDonatedUsd: { increment: amountUsd },
        donationCount: { increment: 1 },
        donorStatus: donorStatusFor(nextTotalUsd),
      },
    });
  }
  return { donationApplied: true, donorLinked: Boolean(donor), donorUserId: donor?.id ?? null };
}

export async function handleClaimFreezeUnfreeze(
  tx: Prisma.TransactionClient,
  deps: ApplyEventDeps,
  contractAddr: string,
  op: number,
  raw: TonTransaction,
): Promise<ApplyEventResult> {
  const friendlyAddr = deps.toFriendly(contractAddr);
  const campaign = await tx.campaign.findUnique({
    where: { onchainAddress: friendlyAddr },
    select: {
      id: true,
      creatorId: true,
      payoutAddress: true,
      raisedAmountToken: true,
      raisedAmountUsd: true,
      goalToken: true,
    },
  });
  if (!campaign) return NO_DONATION;

  if (op === OP.Claim) {
    const recipient = await tx.user.findFirst({
      where: {
        OR: [
          { walletAddress: { in: tonAddressCandidates(campaign.payoutAddress, deps.testnet) } },
          { walletFriendly: { in: tonAddressCandidates(campaign.payoutAddress, deps.testnet) } },
        ],
      },
      select: { id: true },
    });
    const confirmedAt = new Date(raw.now * 1000);
    await tx.withdrawal.upsert({
      where: { txHash: raw.hash },
      create: {
        campaignId: campaign.id,
        recipientId: recipient?.id ?? campaign.creatorId,
        amountToken: campaign.raisedAmountToken,
        amountUsd: campaign.raisedAmountUsd,
        token: campaign.goalToken,
        destinationAddr: campaign.payoutAddress,
        txHash: raw.hash,
        status: "confirmed",
        confirmedAt,
      },
      update: {
        status: "confirmed",
        confirmedAt,
      },
    });
    await tx.campaign.update({
      where: { id: campaign.id },
      data: { completedAt: confirmedAt },
    });
  } else {
    const newStatus = STATUS_MAP[op];
    if (newStatus) {
      await tx.campaign.update({
        where: { id: campaign.id },
        data: { status: newStatus },
      });
    }
  }
  return NO_DONATION;
}

export async function handleRefundEvent(
  tx: Prisma.TransactionClient,
  deps: ApplyEventDeps,
  contractAddr: string,
  op: number,
  raw: TonTransaction,
): Promise<ApplyEventResult> {
  const campaignAddr =
    op === OP.CampaignRefunded ? raw.in_msg?.source ?? null : contractAddr;
  if (!campaignAddr) return NO_DONATION;

  const campaign = await tx.campaign.findUnique({
    where: { onchainAddress: deps.toFriendly(campaignAddr) },
    select: { id: true, status: true },
  });
  if (!campaign) return NO_DONATION;

  if (op === OP.RefundBatch) {
    if (campaign.status !== "refunding" && campaign.status !== "refunded") {
      await tx.campaign.update({
        where: { id: campaign.id },
        data: { status: "refunding" },
      });
    }
    return NO_DONATION;
  }

  await tx.campaign.update({
    where: { id: campaign.id },
    data: { status: "refunded" },
  });

  const refunded = await tx.donation.findMany({
    where: { campaignId: campaign.id, status: "confirmed" },
    select: { id: true, donorId: true },
  });
  if (refunded.length === 0) return NO_DONATION;

  await tx.donation.updateMany({
    where: { campaignId: campaign.id, status: "confirmed" },
    data: { status: "refunded" },
  });

  const donorIds = [...new Set(refunded.map((d) => d.donorId).filter((id): id is string => !!id))];
  for (const donorId of donorIds) {
    await recomputeUserDonationStats(tx, donorId);
  }

  deps.log.info(
    { campaignId: campaign.id, donations: refunded.length, donors: donorIds.length },
    "campaign refunded, donations released",
  );
  return NO_DONATION;
}

export async function handleCampaignGasReturn(
  tx: Prisma.TransactionClient,
  deps: ApplyEventDeps,
  contractAddr: string,
  raw: TonTransaction,
): Promise<ApplyEventResult> {
  const campaignAddr = raw.in_msg?.source ?? null;
  if (!campaignAddr) return NO_DONATION;

  const campaign = await tx.campaign.findUnique({
    where: { onchainAddress: deps.toFriendly(campaignAddr) },
    select: {
      id: true,
      deployStatus: true,
      donorCount: true,
      raisedAmountToken: true,
      raisedAmountUsd: true,
    },
  });
  if (!campaign) return NO_DONATION;
  if (campaign.deployStatus === "closed") return NO_DONATION;

  const booksEmpty =
    campaign.donorCount === 0 &&
    Number(campaign.raisedAmountToken) === 0 &&
    Number(campaign.raisedAmountUsd) === 0;
  if (!booksEmpty) return NO_DONATION;

  await tx.campaign.update({
    where: { id: campaign.id },
    data: { deployStatus: "closed" },
  });

  deps.log.info(
    { campaignId: campaign.id, campaignAddr, master: contractAddr, txHash: raw.hash },
    "empty campaign closed on chain, contract destroyed",
  );
  return NO_DONATION;
}
