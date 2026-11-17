import type { FastifyInstance } from "fastify";
import { resolveWalletKind } from "../services/payout-wallet-kind.js";
import { CAMPAIGN_CATEGORIES, type CampaignCategory } from "../constants/campaign-categories.js";
import { KYC_CAMPAIGN_CREATE_LEVEL, campaignGoalMaxUsdFor } from "../constants/kyc-levels.js";
import { CATEGORY_LENIENCY_CODE, isLenientForCategory } from "../constants/image-screening-leniency.js";
import {
  campaignRateLimitsFor,
  isCampaignRateLimitWhitelisted,
} from "../constants/campaign-rate-limit.js";
import { CHANNEL_TRUST_MIN_SUBSCRIBERS, recalcUserTrustScore } from "../services/trust-score.js";
import {
  notifyCampaignModerators,
  recordAutoRejectEvent,
  recordAutoScreenerFlag,
} from "../services/campaign-moderation.js";
import {
  isAutoModerationEnabled,
  screenCampaign,
  type CampaignScreenerInput,
  type CampaignScreenerVerdict,
} from "../services/campaign-auto-screener.js";
import {
  checkUploadedPhotos,
  isHumanReviewOnlyImageCode,
  SCREENING_UNAVAILABLE_CODE,
} from "../services/nsfw-detector.js";
import { parseUploadUrl, resolveUploadsDir } from "../services/upload-cleanup.js";
import {
  CAMPAIGN_MAX_DEADLINE_DAYS,
  CAMPAIGN_MIN_DEADLINE_DAYS,
  checkCampaignDeadline,
} from "../services/campaign-deadline.js";
import {
  verifyChannelOwnership,
  checkChannelAvailability,
  upsertChannelBinding,
  ChannelVerificationError,
} from "../services/channel-verification.js";
import { fetchChannelAvatarUrl } from "./channels.js";
import { registerCampaignReadRoutes } from "./campaigns-read.js";
import { registerCampaignDeployRoutes } from "./campaigns-deploy.js";
import { registerCampaignDonationRoutes } from "./campaigns-donations.js";
import {
  CAMPAIGN_GOAL_MIN_USD,
  CAMPAIGN_PHOTOS_MAX,
  CAMPAIGN_PHOTOS_MIN,
  CAMPAIGN_STORY_MAX_LENGTH,
  CAMPAIGN_STORY_MIN_LENGTH,
  CAMPAIGN_TITLE_MAX_LENGTH,
  CAMPAIGN_TITLE_MIN_LENGTH,
} from "../constants/campaign-form.js";
import { checkPayoutAddress } from "../utils/ton-address.js";

type Category = CampaignCategory;

export async function campaignRoutes(app: FastifyInstance) {
  registerCampaignReadRoutes(app);
  registerCampaignDeployRoutes(app);
  registerCampaignDonationRoutes(app);

  app.get("/campaigns/rate-limit", async (request, reply) => {
    const whitelisted = isCampaignRateLimitWhitelisted(request.user.username);
    const limits = await Promise.all(
      campaignRateLimitsFor(request.user.username).map(async (limit) => {
        const windowStart = new Date(Date.now() - limit.windowMs);
        const count = await app.prisma.campaign.count({
          where: { creatorId: request.user.id, createdAt: { gte: windowStart } },
        });
        return { max: limit.max, label: request.t(limit.labelKey), used: count, exceeded: count >= limit.max };
      }),
    );
    const blocked = limits.some((l) => l.exceeded);
    return reply.send({ whitelisted, blocked, limits });
  });

  app.post<{
    Body: {
      title: string;
      story: string;
      category: Category;
      goal_amount_usd: number;
      deadline: string;
      payout_address: string;
      photos: string[];
      organizer_type?: "personal" | "telegram_channel";
      channel_link?: string;
      channel_autopost?: boolean;
      is_public?: boolean;
      photos_illustrative: boolean;
    };
  }>(
    "/campaigns",
    {
      schema: {
        body: {
          type: "object",
          required: [
            "title",
            "story",
            "category",
            "goal_amount_usd",
            "deadline",
            "payout_address",
            "photos",
            "photos_illustrative",
          ],
          properties: {
            title: { type: "string", minLength: CAMPAIGN_TITLE_MIN_LENGTH, maxLength: CAMPAIGN_TITLE_MAX_LENGTH },
            story: { type: "string", minLength: CAMPAIGN_STORY_MIN_LENGTH, maxLength: CAMPAIGN_STORY_MAX_LENGTH },
            category: {
              type: "string",
              enum: CAMPAIGN_CATEGORIES,
            },
            goal_amount_usd: { type: "number", minimum: CAMPAIGN_GOAL_MIN_USD },
            deadline: { type: "string", minLength: 1, maxLength: 30 },
            payout_address: { type: "string", minLength: 10, maxLength: 70 },
            photos: {
              type: "array",
              items: { type: "string", minLength: 1, maxLength: 200 },
              minItems: CAMPAIGN_PHOTOS_MIN,
              maxItems: CAMPAIGN_PHOTOS_MAX,
            },
            organizer_type: { type: "string", enum: ["personal", "telegram_channel"], default: "personal" },
            channel_link: { type: "string", maxLength: 100 },
            channel_autopost: { type: "boolean", default: true },
            is_public: { type: "boolean", default: true },
            photos_illustrative: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.user.kycLevel < KYC_CAMPAIGN_CREATE_LEVEL) {
        return reply.code(403).send({ error: `KYC level ${KYC_CAMPAIGN_CREATE_LEVEL} required` });
      }

      for (const limit of campaignRateLimitsFor(request.user.username)) {
        const windowStart = new Date(Date.now() - limit.windowMs);
        const recentCount = await app.prisma.campaign.count({
          where: {
            creatorId: request.user.id,
            createdAt: { gte: windowStart },
          },
        });
        if (recentCount >= limit.max) {
          const label = request.t(limit.labelKey);
          return reply.code(429).send({
            error: "campaign_rate_limit",
            message: request.t("campaign.rateLimit", { max: limit.max, label }),
            limit: limit.max,
            window: label,
          });
        }
      }

      const {
        title, story, category, goal_amount_usd, deadline, payout_address, photos,
        organizer_type = "personal", channel_link, channel_autopost = true,
        is_public = true, photos_illustrative,
      } = request.body;

      const goalMaxUsd = campaignGoalMaxUsdFor(request.user.kycLevel, request.user.role);
      if (goal_amount_usd > goalMaxUsd) {
        return reply.code(400).send({
          error: "goal_exceeds_kyc_limit",
          message: request.t("campaign.goal_exceeds_kyc_limit", { max: goalMaxUsd }),
          max_goal_usd: goalMaxUsd,
        });
      }

      const payoutRejection = checkPayoutAddress(payout_address);
      if (payoutRejection) {
        return reply.code(400).send({
          error: payoutRejection,
          message: request.t(`campaign.${payoutRejection}`),
        });
      }

      if (photos.some((url) => parseUploadUrl(url) === null)) {
        return reply.code(400).send({
          error: "photo_not_uploaded",
          message: request.t("campaign.photo_not_uploaded"),
        });
      }

      let channelData: {
        channelId: bigint;
        channelUsername: string | null;
        channelName: string;
        channelSubscribers: number;
        channelAvatarUrl: string | null;
        channelBotIsAdmin: boolean;
        channelAutopost: boolean;
      } | null = null;

      if (organizer_type === "telegram_channel") {
        if (!channel_link) {
          return reply.code(400).send({ error: "channel_link is required for telegram_channel organizer type" });
        }
        const botToken = process.env.BOT_TOKEN;
        if (!botToken) throw new Error("BOT_TOKEN not set");

        try {
          const verification = await verifyChannelOwnership(botToken, channel_link, Number(request.user.tgUserId), request.locale);
          await checkChannelAvailability(app.prisma, verification.channelId, undefined, request.locale);
          await upsertChannelBinding(app.prisma, request.user.id, verification);
          let channelAvatarUrl: string | null = null;
          if (verification.channelUsername) {
            channelAvatarUrl = await fetchChannelAvatarUrl(botToken, verification.channelUsername.replace("@", ""));
          }
          channelData = {
            channelId: BigInt(verification.channelId),
            channelUsername: verification.channelUsername,
            channelName: verification.channelName,
            channelSubscribers: verification.channelSubscribers,
            channelAvatarUrl,
            channelBotIsAdmin: verification.botIsAdmin,
            channelAutopost: verification.botIsAdmin && channel_autopost,
          };
        } catch (err) {
          if (err instanceof ChannelVerificationError) {
            const statusCode = err.code === "NOT_CHANNEL_ADMIN" || err.code === "INSUFFICIENT_RIGHTS" ? 403 : 400;
            return reply.code(statusCode).send({ error: err.code, message: err.message });
          }
          throw err;
        }
      }

      const now = new Date();

      const deadlineDate = new Date(deadline);
      const deadlineRejection = checkCampaignDeadline(deadlineDate, now);
      if (deadlineRejection) {
        return reply.code(400).send({
          error: deadlineRejection,
          message: request.t(`campaign.${deadlineRejection}`, {
            min: CAMPAIGN_MIN_DEADLINE_DAYS,
            max: CAMPAIGN_MAX_DEADLINE_DAYS,
          }),
        });
      }

      let verdict: CampaignScreenerVerdict | null = null;
      let screenerInput: CampaignScreenerInput | null = null;

      if (isAutoModerationEnabled()) {
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        const [walletUser, completedCampaigns, rejectedCount, frozenActive] = await Promise.all([
          app.prisma.user.findUnique({
            where: { id: request.user.id },
            select: { walletFriendly: true, isBlocked: true },
          }),
          app.prisma.campaign.count({
            where: { creatorId: request.user.id, status: "completed" },
          }),
          app.prisma.campaignModerationEvent.count({
            where: {
              creatorId: request.user.id,
              actionType: "reject",
              decidedAt: { gte: ninetyDaysAgo },
            },
          }),
          app.prisma.campaign.count({
            where: { creatorId: request.user.id, status: { in: ["frozen", "freeze_pending"] } },
          }),
        ]);

        screenerInput = {
          title,
          story,
          category,
          goalAmountUsd: goal_amount_usd,
          deadline: deadlineDate,
          payoutAddress: payout_address,
          photoCount: photos.length,
          photosIllustrative: photos_illustrative,
          user: {
            id: request.user.id,
            kycLevel: request.user.kycLevel,
            isBlocked: walletUser?.isBlocked ?? false,
            role: request.user.role,
            walletFriendly: walletUser?.walletFriendly ?? null,
            completedCampaigns,
            rejectedCampaigns: rejectedCount,
            frozenActiveCampaigns: frozenActive,
            hasRecentRejectionOrFreeze: rejectedCount > 0 || frozenActive > 0,
          },
          now,
        };

        verdict = screenCampaign(screenerInput, request.locale);

        if (photos.length > 0 && verdict.decision !== "auto_reject") {
          const uploadsDir = resolveUploadsDir();
          const imageCheck = await checkUploadedPhotos(photos, uploadsDir, request.log);
          if (imageCheck.flagged) {
            const imageReasonCodes = imageCheck.reasonCodes;
            const decisiveCodes = imageReasonCodes.filter((code) => !isHumanReviewOnlyImageCode(code));
            const imageMessages = decisiveCodes
              .map((code) => {
              switch (code) {
                case "NSFW_CONTENT": return request.t("campaign.image.NSFW_CONTENT");
                case "WEAPONS_IMAGERY": return request.t("campaign.image.WEAPONS_IMAGERY");
                case "MILITARY_IMAGERY": return request.t("campaign.image.MILITARY_IMAGERY");
                case "DRUGS_IMAGERY": return request.t("campaign.image.DRUGS_IMAGERY");
                case "VIOLENCE_IMAGERY": return request.t("campaign.image.VIOLENCE_IMAGERY");
                case "MEDICAL_IMAGERY": return request.t("campaign.image.MEDICAL_IMAGERY");
                case "TOOLS_IMAGERY": return request.t("campaign.image.TOOLS_IMAGERY");
                default: return request.t("campaign.image.default");
              }
            });
            if (decisiveCodes.length === 0) {
              request.log.info(
                { category, reasonCodes: imageReasonCodes },
                "image flags require human review but do not reject",
              );
              verdict = {
                ...verdict,
                decision: "needs_human",
                reasonCodes: [...verdict.reasonCodes, ...imageReasonCodes],
              };
            } else if (isLenientForCategory(category, decisiveCodes)) {
              request.log.info(
                { category, reasonCodes: imageReasonCodes },
                "image flags softened by campaign category",
              );
              verdict = {
                ...verdict,
                decision: "needs_human",
                reasonCodes: [...verdict.reasonCodes, ...imageReasonCodes, CATEGORY_LENIENCY_CODE],
              };
            } else {
              verdict = {
                ...verdict,
                decision: "auto_reject",
                reasonCodes: [...verdict.reasonCodes, ...imageReasonCodes],
                confidence: 1,
                humanMessage: [verdict.humanMessage, ...imageMessages].filter(Boolean).join("\n\n"),
              };
            }
          } else if (imageCheck.screeningFailed) {
            verdict = {
              ...verdict,
              decision: "needs_human",
              reasonCodes: [...verdict.reasonCodes, SCREENING_UNAVAILABLE_CODE],
            };
          }
        }
      }

      const creatorTrustScore = (await app.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { trustScore: true },
      }))?.trustScore ?? 50;

      if (verdict && screenerInput && verdict.decision === "auto_reject") {
        const campaign = await app.prisma.campaign.create({
          data: {
            creatorId: request.user.id,
            trustScore: creatorTrustScore,
            title,
            story,
            language: request.locale,
            category,
            goalAmountUsd: goal_amount_usd,
            goalAmountToken: 0,
            deadline: deadlineDate,
            payoutAddress: payout_address,
            photos,
            status: "rejected",
            deployStatus: "not_started",
            deployError: null,
            deployAttempts: 0,
            lastDeployAttemptAt: null,
            approvedAt: null,
            moderatedBy: null,
            moderationNote: verdict.humanMessage,
            organizerType: organizer_type,
            isPublic: is_public,
            photosIllustrative: photos_illustrative,
            ...(channelData && {
              channelId: channelData.channelId,
              channelUsername: channelData.channelUsername,
              channelName: channelData.channelName,
              channelSubscribers: channelData.channelSubscribers,
              channelAvatarUrl: channelData.channelAvatarUrl,
              channelBotIsAdmin: channelData.channelBotIsAdmin,
              channelAutopost: channelData.channelAutopost,
            }),
          },
          select: {
            id: true,
            title: true,
            category: true,
            status: true,
            deployStatus: true,
            goalAmountUsd: true,
            deadline: true,
            isPublic: true,
            photosIllustrative: true,
            createdAt: true,
          },
        });

        await recordAutoRejectEvent(app, {
          campaignId: campaign.id,
          campaignCreatedAt: campaign.createdAt,
          screenerInput,
          verdict,
          creatorId: request.user.id,
          creatorTgUserId: request.user.tgUserId,
          creatorLanguageCode: request.user.languageCode,
          creatorFirstName: request.user.firstName,
          creatorUsername: request.user.username,
          photos,
        });
        request.log.info(
          {
            userId: request.user.id,
            campaignId: campaign.id,
            reasonCodes: verdict.reasonCodes,
            screenerVersion: verdict.screenerVersion,
          },
          "campaign auto-rejected",
        );
        return reply.code(201).send({
          id: campaign.id,
          title: campaign.title,
          category: campaign.category,
          status: campaign.status,
          deployStatus: campaign.deployStatus,
          goalAmountUsd: campaign.goalAmountUsd,
          isPublic: campaign.isPublic,
          photosIllustrative: campaign.photosIllustrative,
          deadline: campaign.deadline,
          createdAt: campaign.createdAt,
          autoModeration: {
            decision: "auto_reject",
            reasonCodes: verdict.reasonCodes,
            message: verdict.humanMessage,
          },
        });
      }

      const payoutWalletKind = await resolveWalletKind(app.prisma, payout_address, request.log);
      const campaign = await app.prisma.campaign.create({
        data: {
          creatorId: request.user.id,
          trustScore: creatorTrustScore,
          title,
          story,
          language: request.locale,
          category,
          goalAmountUsd: goal_amount_usd,
          goalAmountToken: 0,
          deadline: deadlineDate,
          payoutAddress: payout_address,
          payoutWalletKind,
          photos,
          status: "pending_moderation",
          deployStatus: "not_started",
          deployError: null,
          deployAttempts: 0,
          lastDeployAttemptAt: null,
          approvedAt: null,
          organizerType: organizer_type,
          isPublic: is_public,
          photosIllustrative: photos_illustrative,
          ...(channelData && {
            channelId: channelData.channelId,
            channelUsername: channelData.channelUsername,
            channelName: channelData.channelName,
            channelSubscribers: channelData.channelSubscribers,
            channelAvatarUrl: channelData.channelAvatarUrl,
            channelBotIsAdmin: channelData.channelBotIsAdmin,
            channelAutopost: channelData.channelAutopost,
          }),
        },
        select: {
          id: true,
          title: true,
          story: true,
          language: true,
          category: true,
          status: true,
          deployStatus: true,
          goalAmountUsd: true,
          deadline: true,
          payoutAddress: true,
          photos: true,
          isPublic: true,
          photosIllustrative: true,
          createdAt: true,
          creator: {
            select: { tgUserId: true, tgUsername: true, tgFirstName: true, kycLevel: true },
          },
        },
      });

      if (channelData && channelData.channelSubscribers >= CHANNEL_TRUST_MIN_SUBSCRIBERS) {
        await recalcUserTrustScore(app.prisma, request.user.id);
      }

      if (verdict && screenerInput) {
        await recordAutoScreenerFlag(app, {
          campaignId: campaign.id,
          screenerInput,
          verdict,
          creatorId: request.user.id,
          creatorTgUserId: request.user.tgUserId,
        });
      }

      await notifyCampaignModerators(app, campaign, verdict);

      return reply.code(201).send({
        id: campaign.id,
        title: campaign.title,
        category: campaign.category,
        status: campaign.status,
        deployStatus: campaign.deployStatus,
        goalAmountUsd: campaign.goalAmountUsd,
        isPublic: campaign.isPublic,
        photosIllustrative: campaign.photosIllustrative,
        deadline: campaign.deadline,
        createdAt: campaign.createdAt,
        autoModeration: verdict
          ? {
              decision: "needs_human",
              reasonCodes: verdict.reasonCodes,
              watchCodes: verdict.watchCodes,
            }
          : undefined,
      });
    }
  );

}
