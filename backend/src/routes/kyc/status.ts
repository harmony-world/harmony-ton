import {
  clampKycLevel,
  getKycLevelDefinition,
  getNextVisibleKycLevel,
  getVisibleKycLevels,
  isKyc4Reachable,
  type KycVerificationLevel,
} from "../../constants/kyc-levels.js";
import type { Kyc4Eligibility, KycStatus, KycUserState, PrismaLike } from "./types.js";
import { t, type Locale } from "../../i18n/index.js";

export const KYC4_REQUIRED_SUCCESSFUL_CAMPAIGNS = 2;

function normalizeKycStatus(status: string | null | undefined): KycStatus {
  if (
    status === "pending" ||
    status === "approved" ||
    status === "rejected" ||
    status === "rejected_duplicate"
  ) {
    return status;
  }
  return "not_started";
}

export function buildKycStatusResponse(user: KycUserState | null, kyc4Eligibility?: Kyc4Eligibility, locale?: Locale) {
  const status = normalizeKycStatus(user?.kycStatus);
  const kycLevel = clampKycLevel(user?.kycLevel ?? 0);
  const provider = user?.kycProvider ?? null;
  const verifiedAt = user?.kycVerifiedAt?.toISOString() ?? null;
  const applicantId = user?.sumsubApplicantId ?? null;
  const currentLevel = getKycLevelDefinition(kycLevel);
  const nextLevelValue = getNextVisibleKycLevel(kycLevel);
  const nextLevel = nextLevelValue ? getKycLevelDefinition(nextLevelValue) : null;
  const rejection = status.startsWith("rejected")
    ? {
        type: status === "rejected_duplicate" ? "duplicate" : "unknown",
        message: status === "rejected_duplicate"
          ? t(locale, "kyc.duplicate")
          : t(locale, "kyc.rejected"),
        labels: [] as string[],
      }
    : null;

  return {
    status,
    kycStatus: status,
    kycLevel,
    kyc_level: kycLevel,
    provider,
    kycProvider: provider,
    verifiedAt,
    kycVerifiedAt: verifiedAt,
    applicantId,
    currentLevel,
    nextLevel,
    levels: getVisibleKycLevels(),
    kyc4Eligibility: isKyc4Reachable() ? (kyc4Eligibility ?? null) : null,
    rejection,
    rejection_reason: rejection?.message ?? null,
  };
}

export async function countSuccessfulCampaigns(prisma: PrismaLike, userId: string): Promise<number> {
  return prisma.campaign.count({
    where: {
      creatorId: userId,
      status: "completed",
      onchainAddress: { not: null },
    },
  });
}

export async function getKyc4Eligibility(
  prisma: PrismaLike,
  userId: string,
  currentLevel: number,
  locale?: Locale,
): Promise<Kyc4Eligibility> {
  const successfulCampaigns = await countSuccessfulCampaigns(prisma, userId);
  const blockingReasons: string[] = [];
  if (currentLevel < 3) blockingReasons.push(t(locale, "kyc.block.level3"));
  if (successfulCampaigns < KYC4_REQUIRED_SUCCESSFUL_CAMPAIGNS) {
    blockingReasons.push(t(locale, "kyc.block.successfulCampaigns"));
  }

  return {
    eligible: blockingReasons.length === 0,
    requiredSuccessfulCampaigns: KYC4_REQUIRED_SUCCESSFUL_CAMPAIGNS,
    successfulCampaigns,
    blockingReasons,
  };
}

export async function validateKycTargetPrerequisites(
  prisma: PrismaLike,
  userId: string,
  targetLevel: KycVerificationLevel,
  currentLevel: number,
  locale?: Locale,
) {
  if (targetLevel !== 4) return null;

  const eligibility = await getKyc4Eligibility(prisma, userId, currentLevel, locale);
  if (eligibility.eligible) return null;

  return {
    error: eligibility.blockingReasons[0] ?? "KYC 4 prerequisites are not met",
    code: currentLevel < 3 ? "KYC4_LEVEL_3_REQUIRED" : "KYC4_SUCCESSFUL_CAMPAIGNS_REQUIRED",
    ...eligibility,
  };
}
