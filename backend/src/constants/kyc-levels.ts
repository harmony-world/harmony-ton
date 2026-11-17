export const KYC_MIN_LEVEL = 0;
export const KYC_MAX_LEVEL = 5;
export const KYC_CAMPAIGN_CREATE_LEVEL = 2;

export const KYC_CAMPAIGN_GOAL_MAX_USD: Record<number, number> = {
  0: 0,
  1: 0,
  2: 1_000,
  3: 10_000,
  4: Number.POSITIVE_INFINITY,
  5: Number.POSITIVE_INFINITY,
};

export function campaignGoalMaxUsd(level: number): number {
  const clamped = Math.max(KYC_MIN_LEVEL, Math.min(KYC_MAX_LEVEL, Math.trunc(level)));
  return KYC_CAMPAIGN_GOAL_MAX_USD[clamped] ?? 0;
}

export const OWNER_CAMPAIGN_GOAL_MAX_USD = 10_000;

export function campaignGoalMaxUsdFor(level: number, role: string | null | undefined): number {
  const byLevel = campaignGoalMaxUsd(level);
  return role === "owner" ? Math.max(byLevel, OWNER_CAMPAIGN_GOAL_MAX_USD) : byLevel;
}

export function getKycMaxVisibleLevel(): number {
  const parsed = Number(process.env.KYC_MAX_VISIBLE_LEVEL);
  if (!Number.isFinite(parsed)) return KYC_CAMPAIGN_CREATE_LEVEL;
  if (parsed < KYC_CAMPAIGN_CREATE_LEVEL) return KYC_CAMPAIGN_CREATE_LEVEL;
  if (parsed > KYC_MAX_LEVEL) return KYC_MAX_LEVEL;
  return Math.floor(parsed);
}

export type KycLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type KycVerificationLevel = 2 | 3 | 4 | 5;
export type KycNextLevel = 1 | 2 | 3 | 4;

export interface KycLevelDefinition {
  level: KycLevel;
  code: string;
  title: string;
  requirement: string;
  limit: string;
  sumsubLevelName: string | null;
  route: string | null;
  availableInMock: boolean;
  availableInSumsub: boolean;
}

export const KYC_LEVELS: KycLevelDefinition[] = [
  {
    level: 0,
    code: "guest",
    title: "Guest",
    requirement: "Telegram account",
    limit: "View and share",
    sumsubLevelName: null,
    route: null,
    availableInMock: false,
    availableInSumsub: false,
  },
  {
    level: 1,
    code: "donor",
    title: "Donor",
    requirement: "TON Connect wallet",
    limit: "Unlimited donations",
    sumsubLevelName: null,
    route: null,
    availableInMock: false,
    availableInSumsub: false,
  },
  {
    level: 2,
    code: "recipient_start",
    title: "Recipient",
    requirement: "ID document, selfie, and liveness",
    limit: "Campaigns up to $1,000",
    sumsubLevelName: process.env.SUMSUB_BASIC_LEVEL_NAME ?? "basic-kyc-level",
    route: "/kyc/level/2",
    availableInMock: true,
    availableInSumsub: true,
  },
  {
    level: 3,
    code: "recipient_verified",
    title: "Recipient+",
    requirement: "Document, liveness, and proof of address",
    limit: "Campaigns up to $10,000",
    sumsubLevelName: process.env.SUMSUB_EXTENDED_LEVEL_NAME ?? "extended-kyc-level",
    route: "/kyc/level/3",
    availableInMock: true,
    availableInSumsub: true,
  },
  {
    level: 4,
    code: "recipient_full",
    title: "Full KYC",
    requirement: "Proof of address, 2 videos, and 2+ successful campaigns",
    limit: "Unlimited",
    sumsubLevelName: process.env.SUMSUB_FULL_LEVEL_NAME ?? "full-kyc-level",
    route: "/kyc/level/4",
    availableInMock: true,
    availableInSumsub: true,
  },
  {
    level: 5,
    code: "organization",
    title: "NGO / Organization",
    requirement: "On-chain/multisig organization verification",
    limit: "Unlimited",
    sumsubLevelName: null,
    route: "/kyc/level/5",
    availableInMock: true,
    availableInSumsub: false,
  },
];

export function getVisibleKycLevels(): KycLevelDefinition[] {
  const max = getKycMaxVisibleLevel();
  return KYC_LEVELS.filter((item) => item.level <= max);
}

export function isKycLevelVisible(level: number): boolean {
  return level <= getKycMaxVisibleLevel();
}

export function clampKycLevel(level: number): KycLevel {
  if (level <= KYC_MIN_LEVEL) return 0;
  if (level >= KYC_MAX_LEVEL) return 5;
  return level as KycLevel;
}

export function parseKycVerificationLevel(value: unknown): KycVerificationLevel | null {
  const level = typeof value === "string" ? Number(value) : value;
  if (level === 2 || level === 3 || level === 4 || level === 5) return level;
  return null;
}

export function getKycLevelDefinition(level: number): KycLevelDefinition {
  return KYC_LEVELS.find((item) => item.level === clampKycLevel(level)) ?? KYC_LEVELS[0];
}

export function getNextKycLevel(currentLevel: number): KycNextLevel | null {
  const next = clampKycLevel(currentLevel) + 1;
  if (next < 1 || next > 4) return null;
  return next as KycNextLevel;
}

export function getNextVisibleKycLevel(currentLevel: number): KycNextLevel | null {
  const next = getNextKycLevel(currentLevel);
  return next !== null && isKycLevelVisible(next) ? next : null;
}

export function isKyc4Reachable(): boolean {
  return isKycLevelVisible(4);
}
