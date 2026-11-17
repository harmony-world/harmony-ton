import type { FastifyInstance } from "fastify";
import { deriveDisplayStatus } from "../utils/campaign-status.js";
import { resolveLocale } from "../i18n/index.js";
import { localizeCampaignContent } from "../services/campaign-translation.js";

interface PublicViewQuery {
  view?: string;
  lang?: string;
}

function canReadPrivateUserData(requestUser: { id: string; role: string }, targetUserId: string, view?: string): boolean {
  if (view === "public") return false;
  return requestUser.id === targetUserId || requestUser.role === "admin" || requestUser.role === "moderator";
}

function publicCampaignWhere(targetUserId: string) {
  return { creatorId: targetUserId, hiddenAt: null, isPublic: true, deployStatus: "deployed", onchainAddress: { not: null }, status: { notIn: ["rejected", "refunding", "refunded"] } };
}

function ownerCampaignWhere(targetUserId: string) {
  return { creatorId: targetUserId, hiddenAt: null, status: { notIn: ["rejected", "refunding", "refunded"] } };
}

function publicDonatedCampaignWhere() {
  return { hiddenAt: null, isPublic: true, deployStatus: "deployed", onchainAddress: { not: null }, status: { notIn: ["rejected", "refunding", "refunded"] } };
}

function canInspectAllCampaigns(requestUser: { role: string }, view?: string): boolean {
  if (view === "public") return false;
  return requestUser.role === "admin" || requestUser.role === "moderator";
}

async function canReadTargetActivity(app: FastifyInstance, requestUser: { id: string; role: string }, targetUserId: string, view?: string): Promise<boolean | null> {
  const target = await app.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, isPublic: true } });
  if (!target) return null;
  const canReadPrivate = canReadPrivateUserData(requestUser, targetUserId, view);
  if (!target.isPublic && !canReadPrivate) return null;
  return canReadPrivate;
}

export function registerPublicUserRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: PublicViewQuery }>("/users/:id", async (request, reply) => {
    const canReadPrivate = canReadPrivateUserData(request.user, request.params.id, request.query.view);
    const user = await app.prisma.user.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        tgUsername: true,
        tgFirstName: true,
        tgLastName: true,
        tgPhotoUrl: true,
        tgIsPremium: true,
        donorStatus: true,
        totalDonatedUsd: true,
        donationCount: true,
        kycLevel: true,
        role: true,
        trustScore: true,
        isPublic: true,
        createdAt: true,
        ...(canReadPrivate
          ? {
              tgUserId: true,
              walletAddress: true,
              walletFriendly: true,
              walletConnected: true,
              kycStatus: true,
            }
          : {}),
      },
    });

    if (!user || (!user.isPublic && !canReadPrivate)) {
      return reply.code(404).send({ error: "User not found" });
    }

    return {
      id: user.id,
      username: user.tgUsername,
      firstName: user.tgFirstName,
      lastName: user.tgLastName,
      photoUrl: user.tgPhotoUrl,
      isPremium: user.tgIsPremium,
      donorStatus: user.donorStatus,
      totalDonatedUsd: Number(user.totalDonatedUsd),
      donationCount: user.donationCount,
      kycLevel: user.kycLevel,
      role: user.role,
      trustScore: user.trustScore,
      isPublic: user.isPublic,
      createdAt: user.createdAt,
      ...(canReadPrivate
        ? {
            tgUserId: user.tgUserId?.toString(),
            walletAddress: user.walletAddress,
            walletFriendly: user.walletFriendly,
            walletConnected: user.walletConnected,
            kycStatus: user.kycStatus,
          }
        : {}),
    };
  });

  app.get<{ Params: { id: string }; Querystring: PublicViewQuery }>("/users/:id/campaigns", async (request, reply) => {
    const canReadPrivate = await canReadTargetActivity(app, request.user, request.params.id, request.query.view);
    if (canReadPrivate === null) return reply.code(404).send({ error: "User not found" });
    const canInspectAll = canReadPrivate && canInspectAllCampaigns(request.user, request.query.view);
    const responseLocale = resolveLocale(request.query.lang ?? request.locale);

    const campaigns = await app.prisma.campaign.findMany({
      where: canInspectAll
        ? { creatorId: request.params.id }
        : canReadPrivate
          ? ownerCampaignWhere(request.params.id)
          : publicCampaignWhere(request.params.id),
      select: {
        id: true,
        title: true,
        story: true,
        language: true,
        category: true,
        status: true,
        deployStatus: true,
        onchainAddress: true,
        goalAmountUsd: true,
        raisedAmountUsd: true,
        raisedAmountToken: true,
        donorCount: true,
        deadline: true,
        photos: true,
        isPublic: true,
        createdAt: true,
        withdrawals: { where: { status: "confirmed" }, take: 1, select: { id: true } },
        expenseReport: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(campaigns.map(async (c) => {
      const isClaimed = c.withdrawals.length > 0;
      const localized = await localizeCampaignContent(app.prisma, c, responseLocale, request.log);
      return {
        ...c,
        title: localized.title,
        story: localized.story,
        translation: localized.translation,
        withdrawals: undefined,
        displayStatus: deriveDisplayStatus(c.status, c.deadline, c.raisedAmountUsd, c.raisedAmountToken),
        claimStatus: isClaimed ? "claimed" as const : (c.status === "completed" ? "claimable" as const : "unavailable" as const),
        expenseReportStatus: c.expenseReport?.status ?? null,
      };
    }));
  });

  app.get<{ Params: { id: string }; Querystring: PublicViewQuery }>("/users/:id/donations", async (request, reply) => {
    const canReadPrivate = await canReadTargetActivity(app, request.user, request.params.id, request.query.view);
    if (canReadPrivate === null) return reply.code(404).send({ error: "User not found" });
    const canSeeNonPublicCampaigns = canReadPrivate;
    const responseLocale = resolveLocale(request.query.lang ?? request.locale);

    const donations = await app.prisma.donation.findMany({
      where: canReadPrivate
        ? {
            donorId: request.params.id,
            ...(canSeeNonPublicCampaigns ? { campaign: { hiddenAt: null } } : { campaign: publicDonatedCampaignWhere() }),
          }
        : {
            donorId: request.params.id,
            isAnonymous: false,
            status: "confirmed",
            campaign: publicDonatedCampaignWhere(),
          },
      select: {
        id: true,
        campaignId: true,
        isAnonymous: true,
        campaign: {
          select: {
            id: true,
            title: true,
            story: true,
            language: true,
            category: true,
            status: true,
            deployStatus: true,
            onchainAddress: true,
            goalAmountUsd: true,
            raisedAmountUsd: true,
            raisedAmountToken: true,
            donorCount: true,
            deadline: true,
            photos: true,
            isPublic: true,
          },
        },
        donorAddress: true,
        amountToken: true,
        amountUsd: true,
        token: true,
        txHash: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(donations.map(async (d) => {
      const localized = await localizeCampaignContent(app.prisma, d.campaign, responseLocale, request.log);
      return {
        id: d.id,
        campaignId: d.campaignId,
        campaign: {
          ...d.campaign,
          title: localized.title,
          story: localized.story,
          translation: localized.translation,
          displayStatus: deriveDisplayStatus(d.campaign.status, d.campaign.deadline, d.campaign.raisedAmountUsd, d.campaign.raisedAmountToken),
        },
        campaignTitle: localized.title,
        isAnonymous: d.isAnonymous,
        donorAddress: canReadPrivate ? d.donorAddress : null,
        amount: d.campaign.isPublic ? Number(d.amountToken) : null,
        amountUsd: d.campaign.isPublic ? Number(d.amountUsd) : null,
        amountHidden: !d.campaign.isPublic,
        currency: d.token,
        txHash: canReadPrivate ? d.txHash : null,
        createdAt: d.createdAt,
      };
    }));
  });
}
