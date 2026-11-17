import type { FastifyInstance } from "fastify";
import { startCampaignDeploy } from "../services/campaign-deploy.js";
import { approveCampaignFromModeration, rejectCampaignFromModeration } from "../services/campaign-moderation.js";
import { isOwnerUser } from "../constants/owner.js";

type CampaignStatus =
  | "pending_moderation"
  | "approved"
  | "active"
  | "completed"
  | "frozen"
  | "freeze_pending"
  | "refunding"
  | "refunded"
  | "rejected";
type ModerationAction = "approve" | "reject" | "freeze" | "unfreeze";

const STATUS_TRANSITIONS: Record<ModerationAction, { from: CampaignStatus[]; to: CampaignStatus }> = {
  approve: { from: ["pending_moderation"], to: "approved" },
  reject: { from: ["pending_moderation"], to: "rejected" },
  freeze: { from: ["approved", "active"], to: "freeze_pending" },
  unfreeze: { from: ["frozen", "freeze_pending"], to: "active" },
};

const DEPLOY_RETRY_BLOCKED_STATUSES: CampaignStatus[] = [
  "completed",
  "frozen",
  "freeze_pending",
  "refunding",
  "refunded",
  "rejected",
];

export function registerCampaignDeployRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    "/campaigns/:id/retry-deploy",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const campaign = await app.prisma.campaign.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          title: true,
          creatorId: true,
          status: true,
          deployStatus: true,
          payoutAddress: true,
          goalAmountUsd: true,
          deadline: true,
          onchainAddress: true,
        },
      });

      if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
      if (campaign.creatorId !== request.user.id) {
        return reply.code(403).send({ error: "Only campaign creator can retry deploy" });
      }
      if (campaign.onchainAddress) {
        return reply.code(409).send({ error: "Campaign is already deployed" });
      }
      if (campaign.deployStatus === "deploying") {
        return reply.code(409).send({ error: "Campaign deploy is already in progress" });
      }
      if (DEPLOY_RETRY_BLOCKED_STATUSES.includes(campaign.status as CampaignStatus)) {
        return reply
          .code(422)
          .send({ error: `Cannot retry deploy for campaign in status '${campaign.status}'` });
      }

      const updated = await app.prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          deployStatus: "deploying",
          deployError: null,
          deployAttempts: { increment: 1 },
          lastDeployAttemptAt: new Date(),
        },
        select: {
          id: true,
          deployStatus: true,
          deployError: true,
          deployAttempts: true,
          lastDeployAttemptAt: true,
        },
      });

      startCampaignDeploy(app, campaign);
      return reply.code(202).send(updated);
    }
  );

  app.patch<{
    Params: { id: string };
    Body: { action: ModerationAction; reason?: string };
  }>(
    "/campaigns/:id/status",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["action"],
          properties: {
            action: { type: "string", enum: ["approve", "reject", "freeze", "unfreeze"] },
            reason: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { action, reason } = request.body;

      if (action === "freeze" || action === "unfreeze") {
        if (request.user.role !== "owner" && !isOwnerUser(request.user.tgUserId)) {
          return reply.code(403).send({ error: "Owner role required" });
        }
      } else if (request.user.role !== "moderator") {
        return reply.code(403).send({ error: "Moderator role required" });
      }

      if (action === "approve") {
        const result = await approveCampaignFromModeration(app, id, {
          tgUserId: request.user.tgUserId,
          username: request.user.username,
          firstName: request.user.firstName,
        });
        if (result.status === "not_found") return reply.code(404).send({ error: "Campaign not found" });
        if (result.status === "already_decided") {
          return reply
            .code(422)
            .send({ error: `Cannot approve campaign in status '${result.campaignStatus}'` });
        }
        return result.campaign;
      }

      if (action === "reject") {
        const result = await rejectCampaignFromModeration(app, id, {
          tgUserId: request.user.tgUserId,
          username: request.user.username,
          firstName: request.user.firstName,
        }, reason ?? null);
        if (result.status === "not_found") return reply.code(404).send({ error: "Campaign not found" });
        if (result.status === "already_decided") {
          return reply
            .code(422)
            .send({ error: `Cannot reject campaign in status '${result.campaignStatus}'` });
        }
        return { id, status: "rejected", deleted: true, moderationNote: reason ?? null };
      }

      const campaign = await app.prisma.campaign.findUnique({
        where: { id },
        select: { status: true, onchainAddress: true },
      });

      if (!campaign) return reply.code(404).send({ error: "Campaign not found" });

      const transition = STATUS_TRANSITIONS[action];
      const target: CampaignStatus =
        action === "freeze" && !campaign.onchainAddress ? "frozen" : transition.to;
      if (!transition.from.includes(campaign.status as CampaignStatus)) {
        return reply
          .code(422)
          .send({ error: `Cannot ${action} campaign in status '${campaign.status}'` });
      }

      const [updated] = await app.prisma.$transaction([
        app.prisma.campaign.update({
          where: { id },
          data: {
            status: target,
            moderatedBy: request.user.id,
            moderationNote: reason ?? null,
          },
          select: { id: true, status: true, moderationNote: true, approvedAt: true },
        }),
        app.prisma.moderationAction.create({
          data: {
            campaignId: id,
            moderatorId: request.user.id,
            actionType: action,
            reason: reason ?? null,
          },
        }),
      ]);

      return updated;
    }
  );
}
