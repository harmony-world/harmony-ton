export const CAMPAIGN_MIN_DEADLINE_DAYS = 3;
export const CAMPAIGN_MAX_DEADLINE_DAYS = 90;

export function deadlineDaysFromNow(deadline: Date, now: Date = new Date()): number {
  const deadlineDay = new Date(deadline.getTime());
  deadlineDay.setUTCHours(0, 0, 0, 0);
  const today = new Date(now.getTime());
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((deadlineDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export type DeadlineRejection = "deadline_invalid" | "deadline_too_soon" | "deadline_too_far";

export function checkCampaignDeadline(deadline: Date, now: Date = new Date()): DeadlineRejection | null {
  if (!Number.isFinite(deadline.getTime())) return "deadline_invalid";
  const days = deadlineDaysFromNow(deadline, now);
  if (days < CAMPAIGN_MIN_DEADLINE_DAYS) return "deadline_too_soon";
  if (days > CAMPAIGN_MAX_DEADLINE_DAYS) return "deadline_too_far";
  return null;
}
