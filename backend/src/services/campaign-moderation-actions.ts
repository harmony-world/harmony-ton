import type { FastifyInstance } from "fastify";
import { sendCampaignApproved, sendCampaignRejected } from "../bot/notifications.js";
import { startCampaignDeploy } from "./campaign-deploy.js";
import type { ModeratorIdentity } from "./campaign-moderation-format.js";
import { postCampaignOpened } from "./channel-autopost.js";
import { ensureModeratorUser } from "./moderator-user.js";
import { CHANNEL_TRUST_MIN_SUBSCRIBERS, recalcUserTrustScore } from "./trust-score.js";

export async function approveCampaignFromModeration(
  app: FastifyInstance,
  campaignId: string,
  moderator: ModeratorIdentity,
) {
  const campaign = await app.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      title: true,
      category: true,
      goalAmountUsd: true,
      creatorId: true,
      createdAt: true,
      status: true,
      channelId: true,
      channelSubscribers: true,
      payoutAddress: true,
      deadline: true,
      creator: { select: { tgUserId: true, languageCode: true } },
    },
  });

  if (!campaign) return { status: "not_found" as const };
  if (campaign.status !== "pending_moderation") {
    return { status: "already_decided" as const, campaignStatus: campaign.status };
  }

  const moderatorUser = await ensureModeratorUser(app, moderator);
  const now = new Date();
  const [updated] = await app.prisma.$transaction([
    app.prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "approved",
        deployStatus: "deploying",
        deployError: null,
        deployAttempts: { increment: 1 },
        lastDeployAttemptAt: now,
        moderatedBy: moderatorUser.id,
        moderationNote: null,
        approvedAt: now,
      },
      select: { id: true, status: true, deployStatus: true, approvedAt: true },
    }),
    app.prisma.moderationAction.create({
      data: {
        campaignId: campaign.id,
        moderatorId: moderatorUser.id,
        actionType: "approve",
      },
    }),
    app.prisma.campaignModerationEvent.create({
      data: {
        campaignId: campaign.id,
        creatorId: campaign.creatorId,
        creatorTgUserId: campaign.creator.tgUserId,
        moderatorTgUserId: moderator.tgUserId,
        actor: "human_moderator",
        actionType: "approve",
        title: campaign.title,
        category: campaign.category,
        goalAmountUsd: campaign.goalAmountUsd,
        campaignCreatedAt: campaign.createdAt,
        decidedAt: now,
      },
    }),
  ]);

  if (campaign.channelId && (campaign.channelSubscribers ?? 0) >= CHANNEL_TRUST_MIN_SUBSCRIBERS) {
    await recalcUserTrustScore(app.prisma, campaign.creatorId);
  }

  startCampaignDeploy(app, campaign);
  if (app.bot) {
    try {
      await sendCampaignApproved(app.bot.api, campaign.creator.tgUserId, campaign.title, campaign.creator.languageCode);
    } catch (err) {
      app.log.error({ err, campaignId: campaign.id }, "failed to notify creator about approval");
    }
  }

  const fullCampaign = await app.prisma.campaign.findUnique({
    where: { id: campaign.id },
    select: {
      id: true, title: true, channelId: true, channelUsername: true,
      channelAutopost: true, channelBotIsAdmin: true,
      goalAmountUsd: true, raisedAmountUsd: true, deadline: true,
    },
  });
  if (fullCampaign?.channelAutopost && fullCampaign.channelBotIsAdmin && fullCampaign.channelId) {
    const botToken = process.env.BOT_TOKEN;
    if (botToken) {
      postCampaignOpened(app.prisma, botToken, fullCampaign).catch((err) => {
        app.log.error({ err, campaignId: campaign.id }, "failed to autopost opened campaign");
      });
    }
  }

  return { status: "approved" as const, campaign: updated };
}

export async function rejectCampaignFromModeration(
  app: FastifyInstance,
  campaignId: string,
  moderator: ModeratorIdentity,
  reason?: string | null,
) {
  const normalizedReason = reason?.trim() || null;
  const campaign = await app.prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      title: true,
      category: true,
      goalAmountUsd: true,
      creatorId: true,
      createdAt: true,
      status: true,
      creator: { select: { tgUserId: true, languageCode: true } },
    },
  });

  if (!campaign) return { status: "not_found" as const };
  if (campaign.status !== "pending_moderation") {
    return { status: "already_decided" as const, campaignStatus: campaign.status };
  }

  const moderatorUser = await ensureModeratorUser(app, moderator);
  const now = new Date();
  await app.prisma.$transaction([
    app.prisma.campaignModerationEvent.create({
      data: {
        campaignId: campaign.id,
        creatorId: campaign.creatorId,
        creatorTgUserId: campaign.creator.tgUserId,
        moderatorTgUserId: moderator.tgUserId,
        actor: "human_moderator",
        actionType: "reject",
        reason: normalizedReason,
        title: campaign.title,
        category: campaign.category,
        goalAmountUsd: campaign.goalAmountUsd,
        campaignCreatedAt: campaign.createdAt,
        decidedAt: now,
      },
    }),
    app.prisma.moderationAction.create({
      data: {
        campaignId: null,
        userId: campaign.creatorId,
        moderatorId: moderatorUser.id,
        actionType: "reject",
        reason: normalizedReason,
      },
    }),
    app.prisma.campaign.delete({ where: { id: campaign.id } }),
  ]);

  if (app.bot) {
    try {
      await sendCampaignRejected(app.bot.api, campaign.creator.tgUserId, campaign.title, normalizedReason, campaign.creator.languageCode);
    } catch (err) {
      app.log.error({ err, campaignId: campaign.id }, "failed to notify creator about rejection");
    }
  }

  return { status: "rejected" as const };
}
