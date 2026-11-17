import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { sendCampaignRejected } from "../bot/notifications.js";
import type {
  CampaignScreenerInput,
  CampaignScreenerVerdict,
} from "./campaign-auto-screener.js";
import { buildCampaignSnapshot } from "./campaign-auto-screener.js";
import {
  isAllowedModerator,
  notifyAutoRejectModerators,
  notifyCampaignModerators,
  sendCampaignModerationRequest,
  getModeratorTgIds,
} from "./campaign-moderation-notifications.js";

export type { ModeratorIdentity, ModerationCampaignCard } from "./campaign-moderation-format.js";
export {
  getModeratorTgIds,
  isAllowedModerator,
  notifyCampaignModerators,
  sendCampaignModerationRequest,
};
export {
  approveCampaignFromModeration,
  rejectCampaignFromModeration,
} from "./campaign-moderation-actions.js";

export async function recordAutoRejectEvent(
  app: FastifyInstance,
  input: {
    screenerInput: CampaignScreenerInput;
    verdict: CampaignScreenerVerdict;
    creatorId: string;
    creatorTgUserId: bigint;
    creatorLanguageCode?: string | null;
    creatorFirstName?: string | null;
    creatorUsername?: string | null;
    photos?: string[];
    campaignId?: string;
    campaignCreatedAt?: Date | null;
  },
): Promise<{ campaignId: string }> {
  const now = new Date();
  const campaignId = input.campaignId ?? crypto.randomUUID();
  await app.prisma.campaignModerationEvent.create({
    data: {
      campaignId,
      creatorId: input.creatorId,
      creatorTgUserId: input.creatorTgUserId,
      moderatorTgUserId: null,
      actor: "auto_screener",
      actionType: "reject",
      reason: input.verdict.humanMessage,
      reasonCodes: input.verdict.reasonCodes,
      screenerVersion: input.verdict.screenerVersion,
      snapshot: buildCampaignSnapshot(input.screenerInput) as unknown as object,
      title: input.screenerInput.title.slice(0, 100),
      category: input.screenerInput.category,
      goalAmountUsd: input.screenerInput.goalAmountUsd,
      campaignCreatedAt: input.campaignCreatedAt ?? null,
      decidedAt: now,
    },
  });

  if (app.bot) {
    try {
      await sendCampaignRejected(
        app.bot.api,
        input.creatorTgUserId,
        input.screenerInput.title,
        input.verdict.humanMessage,
        input.creatorLanguageCode,
      );
    } catch (err) {
      app.log.warn({ err }, "failed to notify author about auto-reject");
    }
  }

  await notifyAutoRejectModerators(app, { ...input, photos: input.photos }, campaignId);

  return { campaignId };
}

export function mergeFlaggedReasonCodes(verdict: CampaignScreenerVerdict): string[] {
  const merged: string[] = [];
  for (const code of [...verdict.reasonCodes, ...verdict.watchCodes]) {
    if (!merged.includes(code)) merged.push(code);
  }
  return merged;
}

export async function recordAutoScreenerFlag(
  app: FastifyInstance,
  input: {
    campaignId: string;
    screenerInput: CampaignScreenerInput;
    verdict: CampaignScreenerVerdict;
    creatorId: string;
    creatorTgUserId: bigint;
  },
): Promise<void> {
  const now = new Date();
  await app.prisma.campaignModerationEvent.create({
    data: {
      campaignId: input.campaignId,
      creatorId: input.creatorId,
      creatorTgUserId: input.creatorTgUserId,
      moderatorTgUserId: null,
      actor: "auto_screener",
      actionType: "flagged",
      reason: null,
      reasonCodes: mergeFlaggedReasonCodes(input.verdict),
      screenerVersion: input.verdict.screenerVersion,
      snapshot: buildCampaignSnapshot(input.screenerInput) as unknown as object,
      title: input.screenerInput.title.slice(0, 100),
      category: input.screenerInput.category,
      goalAmountUsd: input.screenerInput.goalAmountUsd,
      campaignCreatedAt: now,
      decidedAt: now,
    },
  });
}

export type ModeratorFeedback = "correct" | "incorrect";

export async function recordModeratorFeedback(
  app: FastifyInstance,
  campaignId: string,
  feedback: ModeratorFeedback,
): Promise<{ status: "recorded" | "no_auto_event" }> {
  const latest = await app.prisma.campaignModerationEvent.findFirst({
    where: { campaignId, actor: "auto_screener" },
    orderBy: { decidedAt: "desc" },
    select: { id: true },
  });
  if (!latest) return { status: "no_auto_event" };
  await app.prisma.campaignModerationEvent.update({
    where: { id: latest.id },
    data: {
      moderatorFeedback: feedback,
      moderatorFeedbackAt: new Date(),
    },
  });
  return { status: "recorded" };
}
