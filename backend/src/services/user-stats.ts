import type { Prisma, PrismaClient } from "@prisma/client";
import { tonAddressCandidates } from "../utils/ton-address.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export function donorStatusFor(totalUsd: number): string {
  if (totalUsd >= 1000) return "guardian";
  if (totalUsd >= 500) return "patron";
  if (totalUsd >= 200) return "benefactor";
  if (totalUsd >= 50) return "helper";
  if (totalUsd > 0) return "sprout";
  return "none";
}

export async function recomputeUserDonationStats(
  prisma: DbClient,
  userId: string
): Promise<{ totalDonatedUsd: number; donationCount: number; donorStatus: string }> {
  const aggregate = await prisma.donation.aggregate({
    where: {
      donorId: userId,
      status: "confirmed",
      campaign: { isPublic: true },
    },
    _sum: { amountUsd: true },
    _count: { _all: true },
  });

  const totalUsd = Number(aggregate._sum.amountUsd ?? 0);
  const count = aggregate._count._all;

  const donorStatus = donorStatusFor(totalUsd);

  await prisma.user.update({
    where: { id: userId },
    data: {
      totalDonatedUsd: totalUsd,
      donationCount: count,
      donorStatus,
    },
  });

  return { totalDonatedUsd: totalUsd, donationCount: count, donorStatus };
}

export async function linkExistingDonationsForWallet(
  prisma: DbClient,
  opts: {
    userId: string;
    tgUserId: bigint;
    walletAddress: string;
    walletFriendly: string;
  }
): Promise<{
  linkedCount: number;
  totalDonatedUsd: number;
  donationCount: number;
  donorStatus: string;
}> {
  const addressCandidates = [
    ...new Set([
      ...tonAddressCandidates(opts.walletAddress),
      ...tonAddressCandidates(opts.walletFriendly),
    ]),
  ];

  const result = await prisma.donation.updateMany({
    where: {
      donorId: null,
      donorAddress: { in: addressCandidates },
    },
    data: {
      donorId: opts.userId,
      donorTgUserId: opts.tgUserId,
    },
  });

  const stats = await recomputeUserDonationStats(prisma, opts.userId);
  return { linkedCount: result.count, ...stats };
}
