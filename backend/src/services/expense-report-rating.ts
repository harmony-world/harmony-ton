import type { CampaignTypeInfo, ModerationAction } from "./expense-report-moderation.js";

export function calcRatingDelta(
  _action: ModerationAction | "missing",
  _campaign: CampaignTypeInfo,
): number {
  return 0;
}
