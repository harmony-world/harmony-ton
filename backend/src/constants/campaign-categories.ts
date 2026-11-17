export const CAMPAIGN_CATEGORIES = [
  "project",
  "channel",
  "health",
  "education",
  "disaster",
  "housing",
  "family",
  "social",
  "animals",
  "birthday",
  "other",
] as const;

export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];
