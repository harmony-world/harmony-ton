import type { FastifyInstance } from "fastify";
import {
  submitExpenseReport,
  moderateExpenseReport,
  getExpenseReport,
  calcRatingDelta,
  type ModerationAction,
} from "../services/expense-report-moderation.js";
import { sendExpenseReportToModerators } from "../bot/expense-report-moderation.js";
import { checkPhotos } from "../services/ai-image-detector.js";
import { absoluteUrl } from "../services/campaign-moderation-format.js";
import { recalcUserTrustScore } from "../services/trust-score.js";

export async function expenseReportRoutes(app: FastifyInstance) {
  app.post<{
    Params: { id: string };
    Body: { photos: string[]; comment?: string };
  }>(
    "/campaigns/:id/expense-report",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["photos"],
          additionalProperties: false,
          properties: {
            photos: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                pattern: "^\\/uploads\\/[a-zA-Z0-9_\\-]+\\.(jpg|jpeg|png)$",
              },
            },
            comment: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await submitExpenseReport(app.prisma, {
        campaignId: request.params.id,
        creatorId: request.user.id,
        photos: request.body.photos,
        comment: request.body.comment,
      });

      if ("error" in result) {
        const statusMap: Record<string, number> = {
          not_found: 404,
          forbidden: 403,
          private_campaign: 403,
          not_required: 409,
          not_completed: 400,
          not_claimed: 400,
          already_approved: 409,
          already_pending: 409,
        };
        const code = statusMap[result.error as string] ?? 400;
        return reply.code(code).send({ error: result.error });
      }

      const campaignId = request.params.id;
      const reportId = result.report.id;

      void (async () => {
        try {
          const photoUrls = request.body.photos.map((p) => absoluteUrl(p));
          const aiSummary = await checkPhotos(photoUrls, app.log as never);

          if (aiSummary) {
            await app.prisma.expenseReport.update({
              where: { id: reportId },
              data: { aiDetectionResults: aiSummary.results as unknown as import("@prisma/client").Prisma.InputJsonValue },
            });

            if (aiSummary.autoReject) {
              const campaign = await app.prisma.campaign.findUnique({
                where: { id: campaignId },
                select: { creatorId: true, isPublic: true, channelId: true },
              });
              if (campaign) {
                const ratingDelta = calcRatingDelta("reject", {
                  isPublic: campaign.isPublic,
                  channelId: campaign.channelId,
                });
                await app.prisma.expenseReport.update({
                  where: { id: reportId },
                  data: {
                    status: "rejected",
                    ratingDelta,
                    moderationNote: request.t("expense.aiRejectNote"),
                    reviewedAt: new Date(),
                  },
                });
                await recalcUserTrustScore(app.prisma, campaign.creatorId);
                app.log.info({ campaignId, reportId }, "Expense report auto-rejected by AI detection");
                return;
              }
            }
          }

          await sendExpenseReportToModerators(app, campaignId);
        } catch (err) {
          app.log.error({ err, campaignId }, "AI detection or bot notification failed");
          void sendExpenseReportToModerators(app, campaignId).catch((e) => {
            app.log.error({ err: e, campaignId }, "expense report bot notification failed after AI error");
          });
        }
      })();

      return reply.code(201).send(result.report);
    },
  );

  app.get<{
    Params: { id: string };
  }>(
    "/campaigns/:id/expense-report",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const report = await getExpenseReport(
        app.prisma,
        request.params.id,
        request.user?.id,
        request.user?.role,
      );

      if (!report) return reply.code(404).send({ error: "not_found" });
      return report;
    },
  );

  app.post<{
    Params: { id: string };
    Body: { action: ModerationAction; note?: string };
  }>(
    "/campaigns/:id/expense-report/moderate",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["action"],
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["approve", "reject", "request_revision"] },
            note: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.user.role !== "moderator" && request.user.role !== "admin") {
        return reply.code(403).send({ error: "forbidden" });
      }

      const result = await moderateExpenseReport(app.prisma, {
        campaignId: request.params.id,
        moderatorId: request.user.id,
        action: request.body.action,
        note: request.body.note,
      });

      if ("error" in result) {
        const statusMap: Record<string, number> = {
          not_found: 404,
          private_campaign: 403,
          no_report: 404,
          not_pending: 409,
        };
        const code = statusMap[result.error as string] ?? 400;
        return reply.code(code).send({ error: result.error });
      }

      return result.report;
    },
  );
}
