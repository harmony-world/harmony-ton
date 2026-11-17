import type { FastifyInstance } from "fastify";
import { ownerUserWhere } from "../constants/owner.js";
import { acceptsUsdt } from "../services/payout-wallet-kind.js";
import { CAMPAIGN_CATEGORIES, type CampaignCategory } from "../constants/campaign-categories.js";
import { deriveDisplayStatus } from "../utils/campaign-status.js";
import { resolveLocale } from "../i18n/index.js";
import { localizeCampaignContent } from "../services/campaign-translation.js";

type Category = CampaignCategory;
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

export function registerCampaignReadRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      category?: Category;
      status?: CampaignStatus;
      sort?: "createdAt" | "trustScore";
      limit?: number;
      offset?: number;
      cursor?: string;
      lang?: string;
    };
  }>(
    "/campaigns",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: CAMPAIGN_CATEGORIES,
            },
            status: {
              type: "string",
              enum: [
                "pending_moderation",
                "approved",
                "active",
                "completed",
                "frozen",
                "freeze_pending",
                "refunding",
                "refunded",
                "rejected",
              ],
            },
            sort: { type: "string", enum: ["createdAt", "trustScore"] },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
            cursor: { type: "string" },
            lang: { type: "string", maxLength: 35 },
          },
        },
      },
    },
    async (request) => {
      const {
        category,
        status,
        sort = "createdAt",
        limit = 20,
        offset = 0,
        cursor,
        lang,
      } = request.query;
      const responseLocale = resolveLocale(lang ?? request.locale);

      const where: Record<string, unknown> = {};
      if (category) where.category = category;
      if (status) {
        where.status = status;
      } else {
        where.deployStatus = "deployed";
        where.onchainAddress = { not: null };
        where.status = { notIn: ["rejected", "refunding", "refunded", "suspended"] };
      }
      where.isPublic = true;
      where.hiddenAt = null;

      const orderBy =
        sort === "trustScore"
          ? [{ trustScore: "desc" as const }, { createdAt: "desc" as const }]
          : [{ createdAt: "desc" as const }];

      let pinned: Awaited<ReturnType<typeof findFeed>> = [];
      if (!status) {
        const owners = await app.prisma.user.findMany({ where: ownerUserWhere(), select: { id: true } });
        if (owners.length > 0) {
          pinned = await findFeed({
            where: {
              ...where,
              creatorId: { in: owners.map((o) => o.id) },
              status: { in: ["active", "approved"] },
              deadline: { gt: new Date() },
            },
            orderBy,
          });
          if (pinned.length > 0) where.id = { notIn: pinned.map((c) => c.id) };
        }
      }
      const isFirstPage = !cursor && offset === 0;

      const campaigns = await findFeed({
        where,
        orderBy,
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : { skip: offset }),
      });

      function findFeed(args: { where: Record<string, unknown>; orderBy: typeof orderBy; take?: number; skip?: number; cursor?: { id: string } }) {
        return app.prisma.campaign.findMany({
        ...args,
        select: {
          id: true,
          title: true,
          story: true,
          language: true,
          category: true,
          status: true,
          deployStatus: true,
          goalAmountUsd: true,
          raisedAmountUsd: true,
          raisedAmountToken: true,
          trustScore: true,
          donorCount: true,
          deadline: true,
          photos: true,
          createdAt: true,
          organizerType: true,
          channelId: true,
          channelUsername: true,
          channelAvatarUrl: true,
          isPublic: true,
          photosIllustrative: true,
          creator: {
            select: { id: true, tgFirstName: true, tgUsername: true, tgPhotoUrl: true },
          },
        },
        });
      }

      const nextCursor =
        campaigns.length === limit
          ? (campaigns[campaigns.length - 1]?.id ?? null)
          : null;

      const pinnedIds = new Set(pinned.map((c) => c.id));
      const page = isFirstPage ? [...pinned, ...campaigns] : campaigns;
      const enriched = await Promise.all(page.map(async (c) => {
        const localized = await localizeCampaignContent(app.prisma, c, responseLocale, request.log);
        const { story: _story, ...rest } = c;
        return {
          ...rest,
          title: localized.title,
          language: c.language,
          translation: localized.translation,
          channelId: c.channelId != null ? c.channelId.toString() : null,
          pinned: pinnedIds.has(c.id),
          displayStatus: deriveDisplayStatus(
            c.status,
            c.deadline,
            c.raisedAmountUsd,
            c.raisedAmountToken,
          ),
        };
      }));

      return { data: enriched, nextCursor };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { lang?: string } }>(
    "/campaigns/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: { lang: { type: "string", maxLength: 35 } },
        },
      },
    },
    async (request, reply) => {
      const responseLocale = resolveLocale(request.query.lang ?? request.locale);
      let campaign;
      try {
        campaign = await app.prisma.campaign.findUnique({
          where: { id: request.params.id },
          select: {
            id: true,
            title: true,
            story: true,
            language: true,
            category: true,
            status: true,
            deployStatus: true,
            deployError: true,
            goalAmountUsd: true,
            raisedAmountUsd: true,
            raisedAmountToken: true,
            goalToken: true,
            trustScore: true,
            donorCount: true,
            viewCount: true,
            deadline: true,
            payoutAddress: true,
            payoutWalletKind: true,
            onchainAddress: true,
            photos: true,
            moderationNote: true,
            organizerType: true,
            channelId: true,
            channelUsername: true,
            channelAvatarUrl: true,
            channelBotIsAdmin: true,
            channelAutopost: true,
            isPublic: true,
            photosIllustrative: true,
            createdAt: true,
            approvedAt: true,
            hiddenAt: true,
            withdrawals: {
              where: { status: "confirmed" },
              orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: {
                txHash: true,
                confirmedAt: true,
              },
            },
            creator: {
              select: { id: true, tgFirstName: true, tgUsername: true, tgPhotoUrl: true, tgUserId: true },
            },
          },
        });
      } catch {
        return reply.code(400).send({ error: "Invalid campaign ID" });
      }

      if (!campaign || campaign.hiddenAt) return reply.code(404).send({ error: "Campaign not found" });
      const localized = await localizeCampaignContent(app.prisma, campaign, responseLocale, request.log);
      const [confirmedWithdrawal] = campaign.withdrawals ?? [];
      const hasRaised =
        Number(campaign.raisedAmountUsd) > 0 ||
        (campaign.raisedAmountToken != null && BigInt(String(campaign.raisedAmountToken)) > 0n);
      const claimStatus = confirmedWithdrawal
        ? "claimed"
        : campaign.status === "completed" && campaign.onchainAddress && hasRaised
          ? "claimable"
          : "unavailable";
      return {
        ...campaign,
        title: localized.title,
        story: localized.story,
        translation: localized.translation,
        channelId: campaign.channelId != null ? campaign.channelId.toString() : null,
        withdrawals: undefined,
        hiddenAt: undefined,
        payoutWalletKind: undefined,
        acceptsUsdt: acceptsUsdt(campaign.payoutWalletKind),
        displayStatus: deriveDisplayStatus(
          campaign.status,
          campaign.deadline,
          campaign.raisedAmountUsd,
          campaign.raisedAmountToken,
        ),
        claimStatus,
        claimedAt: confirmedWithdrawal?.confirmedAt ?? null,
        withdrawalTxHash: confirmedWithdrawal?.txHash ?? null,
        creator: {
          ...campaign.creator,
          tgUserId: campaign.creator.tgUserId.toString(),
        },
      };
    }
  );
}
