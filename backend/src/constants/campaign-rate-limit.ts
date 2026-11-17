export interface CampaignRateLimit {
  windowMs: number;
  max: number;
  labelKey: string;
}

export const CAMPAIGN_RATE_LIMITS: readonly CampaignRateLimit[] = [
  { windowMs: 24 * 60 * 60 * 1000, max: 3, labelKey: "campaign.rateLimit.day" },
];

export const WHITELIST_CAMPAIGN_RATE_LIMITS: readonly CampaignRateLimit[] = [
  { windowMs: 24 * 60 * 60 * 1000, max: 30, labelKey: "campaign.rateLimit.day" },
];

function normalizeUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^@/, "").toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function getCampaignRateLimitWhitelist(): Set<string> {
  return new Set(
    (process.env.HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST ?? "")
      .split(",")
      .map((entry) => normalizeUsername(entry))
      .filter((entry): entry is string => entry !== null),
  );
}

export function isCampaignRateLimitWhitelisted(username: string | null | undefined): boolean {
  const normalized = normalizeUsername(username);
  return normalized !== null && getCampaignRateLimitWhitelist().has(normalized);
}

export function campaignRateLimitsFor(username: string | null | undefined): readonly CampaignRateLimit[] {
  return isCampaignRateLimitWhitelisted(username) ? WHITELIST_CAMPAIGN_RATE_LIMITS : CAMPAIGN_RATE_LIMITS;
}
