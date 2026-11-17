import { calcRatingDelta } from "./expense-report-rating.js";
export { calcRatingDelta } from "./expense-report-rating.js";
import type { PrismaClient } from "@prisma/client";
import { expenseReportExpected } from "../constants/expense-report.js";
import { recalcUserTrustScore } from "./trust-score.js";

export type ExpenseReportStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "missing";

export type ModerationAction = "approve" | "reject" | "request_revision";

export interface CampaignTypeInfo {
  isPublic: boolean;
  channelId: bigint | null;
}

export function isPrivateCampaign(c: CampaignTypeInfo): boolean {
  return !c.isPublic;
}

export function isChannelCampaign(c: CampaignTypeInfo): boolean {
  return c.channelId != null;
}

export interface SubmitExpenseReportInput {
  campaignId: string;
  creatorId: string;
  photos: string[];
  comment?: string;
}

export async function submitExpenseReport(
  prisma: PrismaClient,
  input: SubmitExpenseReportInput,
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    select: {
      id: true,
      status: true,
      isPublic: true,
      channelId: true,
      creatorId: true,
      raisedAmountUsd: true,
      withdrawals: { where: { status: "confirmed" }, take: 1, select: { id: true } },
      expenseReport: { select: { id: true, status: true } },
    },
  });

  if (!campaign) return { error: "not_found" as const };
  if (campaign.creatorId !== input.creatorId) return { error: "forbidden" as const };
  if (isPrivateCampaign(campaign)) return { error: "private_campaign" as const };
  if (campaign.status !== "completed") return { error: "not_completed" as const };
  if (campaign.withdrawals.length === 0) return { error: "not_claimed" as const };

  const existing = campaign.expenseReport;
  if (!existing && !expenseReportExpected(campaign.raisedAmountUsd)) return { error: "not_required" as const };
  if (existing && existing.status === "approved") {
    return { error: "already_approved" as const };
  }

  if (existing && (existing.status === "rejected" || existing.status === "revision_requested" || existing.status === "missing")) {
    const updated = await prisma.expenseReport.update({
      where: { id: existing.id },
      data: {
        photos: input.photos,
        comment: input.comment ?? null,
        status: "pending_review",
        ratingDelta: 0,
        moderationNote: null,
        moderatedBy: null,
        reviewedAt: null,
        revision: { increment: 1 },
      },
      select: { id: true, status: true, revision: true },
    });
    await recalcUserTrustScore(prisma, input.creatorId);
    return { report: updated };
  }

  if (existing && existing.status === "pending_review") {
    return { error: "already_pending" as const };
  }

  const report = await prisma.expenseReport.create({
    data: {
      campaignId: input.campaignId,
      creatorId: input.creatorId,
      photos: input.photos,
      comment: input.comment ?? null,
    },
    select: { id: true, status: true, revision: true },
  });
  return { report };
}

export interface ModerateExpenseReportInput {
  campaignId: string;
  moderatorId: string;
  action: ModerationAction;
  note?: string;
}

export async function moderateExpenseReport(
  prisma: PrismaClient,
  input: ModerateExpenseReportInput,
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    select: {
      id: true,
      creatorId: true,
      isPublic: true,
      channelId: true,
      expenseReport: { select: { id: true, status: true } },
    },
  });

  if (!campaign) return { error: "not_found" as const };
  if (isPrivateCampaign(campaign)) return { error: "private_campaign" as const };

  const report = campaign.expenseReport;
  if (!report) return { error: "no_report" as const };
  if (report.status !== "pending_review") {
    return { error: "not_pending" as const };
  }

  const campaignType: CampaignTypeInfo = {
    isPublic: campaign.isPublic,
    channelId: campaign.channelId,
  };

  let newStatus: ExpenseReportStatus;
  switch (input.action) {
    case "approve":
      newStatus = "approved";
      break;
    case "reject":
      newStatus = "rejected";
      break;
    case "request_revision":
      newStatus = "revision_requested";
      break;
  }

  const ratingDelta = calcRatingDelta(input.action, campaignType);
  const now = new Date();

  const [updated] = await prisma.$transaction([
    prisma.expenseReport.update({
      where: { id: report.id },
      data: {
        status: newStatus,
        ratingDelta,
        moderatedBy: input.moderatorId,
        moderationNote: input.note ?? null,
        reviewedAt: input.action === "request_revision" ? null : now,
      },
      select: { id: true, status: true, ratingDelta: true, revision: true },
    }),
    prisma.moderationAction.create({
      data: {
        campaignId: input.campaignId,
        moderatorId: input.moderatorId,
        actionType: `expense_${input.action}`,
        reason: input.note ?? null,
      },
    }),
  ]);

  await recalcUserTrustScore(prisma, campaign.creatorId);

  return { report: updated };
}

export async function getExpenseReport(
  prisma: PrismaClient,
  campaignId: string,
  requesterId?: string,
  requesterRole?: string,
) {
  const report = await prisma.expenseReport.findUnique({
    where: { campaignId },
    select: {
      id: true,
      status: true,
      photos: true,
      comment: true,
      ratingDelta: true,
      revision: true,
      reviewedAt: true,
      moderationNote: true,
      creatorId: true,
      createdAt: true,
      updatedAt: true,
      aiDetectionResults: true,
    },
  });

  if (!report) return null;

  const isOwnerOrMod =
    requesterId === report.creatorId ||
    requesterRole === "moderator" ||
    requesterRole === "admin";

  const isMod = requesterRole === "moderator" || requesterRole === "admin";

  if (report.status === "rejected" && !isOwnerOrMod) {
    return {
      id: report.id,
      status: report.status,
      photos: [] as string[],
      comment: null,
      ratingDelta: 0,
      revision: report.revision,
      reviewedAt: report.reviewedAt,
      createdAt: report.createdAt,
      hasPhotos: report.photos.length > 0,
      moderationNote: undefined,
      aiDetectionResults: undefined,
    };
  }

  return {
    id: report.id,
    status: report.status,
    photos: report.photos,
    comment: report.comment,
    ratingDelta: report.ratingDelta,
    revision: report.revision,
    reviewedAt: report.reviewedAt,
    createdAt: report.createdAt,
    hasPhotos: report.photos.length > 0,
    moderationNote: isOwnerOrMod ? report.moderationNote : undefined,
    aiDetectionResults: isMod ? report.aiDetectionResults : undefined,
  };
}
