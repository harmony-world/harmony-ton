import type { CampaignCategory } from "../constants/campaign-categories.js";
import type { Locale } from "../i18n/index.js";

export const SCREENER_VERSION = "open-edition";

export type ScreenerDecision = "auto_reject" | "auto_approve" | "needs_human";

export type CampaignScreenerInput = {
  title: string;
  story: string;
  category: CampaignCategory;
  goalAmountUsd: number;
  deadline: Date;
  payoutAddress: string;
  photoCount: number;
  photosIllustrative: boolean;
  user: {
    id: string;
    kycLevel: number;
    isBlocked: boolean;
    role: string;
    walletFriendly: string | null;
    completedCampaigns: number;
    rejectedCampaigns: number;
    frozenActiveCampaigns: number;
    hasRecentRejectionOrFreeze: boolean;
  };
  now?: Date;
};

export type CampaignScreenerVerdict = {
  decision: ScreenerDecision;
  reasonCodes: string[];
  watchCodes: string[];
  confidence: number;
  screenerVersion: string;
  autoModerationEnabled: boolean;
  autoApproveEnabled: boolean;
  autoRejectEnabled: boolean;
  humanMessage: string | null;
};

export function isAutoModerationEnabled(): boolean {
  return false;
}

export function screenCampaign(_input: CampaignScreenerInput, _locale?: Locale): CampaignScreenerVerdict {
  return {
    decision: "needs_human",
    reasonCodes: [],
    watchCodes: [],
    confidence: 0,
    screenerVersion: SCREENER_VERSION,
    autoModerationEnabled: false,
    autoApproveEnabled: false,
    autoRejectEnabled: false,
    humanMessage: null,
  };
}

export function buildCampaignSnapshot(input: CampaignScreenerInput): Record<string, unknown> {
  return {
    version: SCREENER_VERSION,
    category: input.category,
    goalAmountUsd: input.goalAmountUsd,
    photoCount: input.photoCount,
  };
}
