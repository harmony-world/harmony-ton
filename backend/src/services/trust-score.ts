import type { PrismaClient } from "@prisma/client";

export const TRUST_SCORE_INITIAL = 50;
export const TRUST_SCORE_MIN = 0;
export const TRUST_SCORE_MAX = 100;
export const TRUST_SCORE_GREEN_MIN = 70;
export const TRUST_SCORE_RED_MAX = 30;
export const CHANNEL_TRUST_BONUS = 0;
export const CHANNEL_TRUST_MIN_SUBSCRIBERS = Number.MAX_SAFE_INTEGER;
export const KYC_TRUST_BONUS_START_LEVEL = Number.MAX_SAFE_INTEGER;
export const KYC_TRUST_BONUS_PER_LEVEL = 0;
export const PREMIUM_TRUST_BONUS = 0;

export type TrustScoreZone = "red" | "yellow" | "green";

export interface CalculateTrustScoreInput {
  reportDelta?: number | null;
  approvedChannelCampaigns1000Plus?: number | null;
  kycLevel?: number | null;
  tgIsPremium?: boolean | null;
}

export function calculateKycTrustBonus(_kycLevel: number | null | undefined): number {
  return 0;
}

export function calculateTrustScore(input: CalculateTrustScoreInput): number {
  return Math.min(TRUST_SCORE_MAX, Math.max(TRUST_SCORE_MIN, TRUST_SCORE_INITIAL + (input.reportDelta ?? 0)));
}

export function getTrustScoreZone(score: number): TrustScoreZone {
  if (score >= TRUST_SCORE_GREEN_MIN) return "green";
  if (score <= TRUST_SCORE_RED_MAX) return "red";
  return "yellow";
}

export async function recalcUserTrustScore(prisma: PrismaClient, userId: string): Promise<number> {
  const reportDelta = await prisma.expenseReport.aggregate({
    _sum: { ratingDelta: true },
    where: { campaign: { creatorId: userId }, ratingDelta: { not: 0 } },
  });
  const score = calculateTrustScore({ reportDelta: reportDelta._sum.ratingDelta });
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { trustScore: score } }),
    prisma.campaign.updateMany({
      where: { creatorId: userId, status: { notIn: ["rejected", "refunding", "refunded"] } },
      data: { trustScore: score },
    }),
  ]);
  return score;
}
