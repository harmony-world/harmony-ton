import type { FastifyInstance } from "fastify";
import { Address } from "@ton/core";
import { normalizeTonAddress, tonAddressCandidates } from "../utils/ton-address.js";
import {
  CampaignContractGoneError,
  claimRefusal,
  readCampaignState,
  sameAddress,
} from "../services/onchain-owner-ops.js";
import { acceptsUsdt, resolveWalletKind } from "../services/payout-wallet-kind.js";

type DonationCurrency = "GRAM" | "USDT";
const DONATION_INTENT_TTL_MS = 30 * 60 * 1000;

const CLAIM_GAS_GRAM = "0.05";

function trimNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 100) : null;
}

function shortAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function donationDisplayName(donation: {
  isAnonymous: boolean;
  message: string | null;
  donorAddress: string | null;
  donor: { tgFirstName: string | null; tgUsername: string | null } | null;
}): string | null {
  if (donation.isAnonymous) return null;
  return (
    trimNullable(donation.message) ??
    trimNullable(donation.donor?.tgFirstName) ??
    trimNullable(donation.donor?.tgUsername) ??
    shortAddress(donation.donorAddress)
  );
}

export function registerCampaignDonationRoutes(app: FastifyInstance) {
  app.post<{
    Params: { id: string };
    Body: {
      walletAddress: string;
      amount: number;
      currency: DonationCurrency;
      donorName?: string | null;
      isAnonymous?: boolean;
    };
  }>(
    "/campaigns/:id/donation-intents",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            walletAddress: { type: "string", minLength: 1, maxLength: 120 },
            amount: { type: "number", exclusiveMinimum: 0 },
            currency: { type: "string", enum: ["GRAM", "USDT"] },
            donorName: { type: ["string", "null"], maxLength: 100 },
            isAnonymous: { type: "boolean", default: false },
          },
          required: ["walletAddress", "amount", "currency"],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { amount, currency, isAnonymous = false } = request.body;

      const campaign = await app.prisma.campaign.findUnique({
        where: { id },
        select: { id: true, status: true, deadline: true, onchainDeadline: true, payoutAddress: true, payoutWalletKind: true },
      });
      if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
      if (campaign.status === "suspended") return reply.code(403).send({ error: "Campaign is suspended" });

      if (currency === "USDT") {
        let kind = campaign.payoutWalletKind;
        if (kind === null) {
          kind = await resolveWalletKind(app.prisma, campaign.payoutAddress, request.log);
          if (kind !== null) {
            await app.prisma.campaign.update({ where: { id }, data: { payoutWalletKind: kind } });
          }
        }
        if (!acceptsUsdt(kind)) {
          return reply.code(409).send({ error: "usdt_not_accepted", message: request.t("campaign.usdt_not_accepted") });
        }
      }

      const effectiveDeadline = campaign.onchainDeadline ?? campaign.deadline;
      if (effectiveDeadline.getTime() <= Date.now()) {
        return reply.code(409).send({ error: "Campaign deadline has passed" });
      }

      let donorAddress: string;
      try {
        Address.parse(request.body.walletAddress);
        donorAddress = normalizeTonAddress(request.body.walletAddress);
      } catch {
        return reply.code(400).send({ error: "Invalid wallet address" });
      }

      const expiresAt = new Date(Date.now() + DONATION_INTENT_TTL_MS);
      const donorName = isAnonymous ? null : trimNullable(request.body.donorName);
      const intent = await app.prisma.donationIntent.create({
        data: {
          campaignId: id,
          donorId: request.user.id,
          donorTgUserId: request.user.tgUserId,
          donorAddress,
          amountToken: amount,
          token: currency,
          donorName,
          isAnonymous,
          expiresAt,
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });

      reply.code(201);
      return {
        id: intent.id,
        expiresAt: intent.expiresAt.toISOString(),
      };
    }
  );

  app.get<{
    Params: { id: string };
    Querystring: { limit?: number; offset?: number };
  }>(
    "/campaigns/:id/donations",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { limit = 20, offset = 0 } = request.query;

      const campaign = await app.prisma.campaign.findUnique({
        where: { id },
        select: { id: true, isPublic: true, hiddenAt: true },
      });
      if (!campaign || campaign.hiddenAt) return reply.code(404).send({ error: "Campaign not found" });
      const hideDonationAmounts = !campaign.isPublic;

      const donations = await app.prisma.donation.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          donorId: true,
          donorAddress: true,
          amountToken: true,
          amountUsd: true,
          tipAmountToken: true,
          tipAmountUsd: true,
          token: true,
          txHash: true,
          isAnonymous: true,
          message: true,
          createdAt: true,
          donor: {
            select: { tgUserId: true, tgFirstName: true, tgUsername: true, tgPhotoUrl: true },
          },
        },
      });

      return {
        data: donations.map((donation) => ({
          id: donation.id,
          campaignId: id,
          donorAddress: donation.isAnonymous ? null : donation.donorAddress,
          amount: hideDonationAmounts ? null : Number(donation.amountToken),
          amountUsd: hideDonationAmounts ? null : Number(donation.amountUsd),
          tipAmount: hideDonationAmounts ? null : Number(donation.tipAmountToken),
          tipAmountUsd: hideDonationAmounts ? null : Number(donation.tipAmountUsd),
          amountHidden: hideDonationAmounts,
          currency: donation.token,
          txHash: donation.txHash,
          createdAt: donation.createdAt.toISOString(),
          isAnonymous: donation.isAnonymous,
          donorName: donationDisplayName(donation),
          donorTelegramUsername: donation.isAnonymous ? null : donation.donor?.tgUsername ?? null,
          donorTelegramUserId: donation.isAnonymous ? null : donation.donor?.tgUserId?.toString() ?? null,
          donorPhotoUrl: donation.isAnonymous ? null : donation.donor?.tgPhotoUrl ?? null,
          donorUserId: donation.isAnonymous ? null : donation.donorId,
        })),
      };
    }
  );

  app.get<{
    Params: { id: string };
    Querystring: { wallet: string };
  }>(
    "/campaigns/:id/refund-eligibility",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        querystring: {
          type: "object",
          required: ["wallet"],
          properties: { wallet: { type: "string", minLength: 1, maxLength: 70 } },
        },
      },
    },
    async (request, reply) => {
      const campaign = await app.prisma.campaign.findUnique({
        where: { id: request.params.id },
        select: { id: true, status: true, onchainAddress: true },
      });
      if (!campaign) return reply.code(404).send({ error: "Campaign not found" });

      const refused = (reason: string) => ({
        eligible: false,
        reason,
        onchainAddress: campaign.onchainAddress,
        amountGram: 0,
        amountUsdt: 0,
        gasGram: null,
      });

      if (!campaign.onchainAddress) return refused("not_deployed");
      if (campaign.status !== "frozen") return refused("campaign_not_frozen");

      const donations = await app.prisma.donation.findMany({
        where: {
          campaignId: campaign.id,
          status: "confirmed",
          donorId: request.user.id,
          donorAddress: { in: tonAddressCandidates(request.query.wallet) },
        },
        select: { amountToken: true, token: true },
      });
      if (donations.length === 0) return refused("no_donation");

      const sumOf = (token: string) =>
        donations
          .filter((donation) => donation.token === token)
          .reduce((sum, donation) => sum + Number(donation.amountToken), 0);
      const amountUsdt = sumOf("USDT");

      return {
        eligible: true,
        reason: null,
        onchainAddress: campaign.onchainAddress,
        amountGram: sumOf("GRAM"),
        amountUsdt,
        gasGram: amountUsdt > 0 ? "0.1" : "0.05",
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/campaigns/:id/claim-eligibility",
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
        select: { id: true, creatorId: true, onchainAddress: true, payoutAddress: true },
      });
      if (!campaign) return reply.code(404).send({ error: "Campaign not found" });
      if (campaign.creatorId !== request.user.id) {
        const user = await app.prisma.user.findUnique({
          where: { id: request.user.id },
          select: { walletAddress: true },
        });
        if (!user?.walletAddress || !sameAddress(user.walletAddress, campaign.payoutAddress)) {
          return reply.code(403).send({ error: "Forbidden" });
        }
      }

      if (!campaign.onchainAddress) {
        return { eligible: false, reason: "not_deployed", checked: true, gasGram: CLAIM_GAS_GRAM };
      }

      try {
        const state = await readCampaignState(campaign.onchainAddress);
        const reason = claimRefusal(state, CLAIM_GAS_GRAM);
        return { eligible: reason === null, reason, checked: true, gasGram: CLAIM_GAS_GRAM };
      } catch (err) {
        if (err instanceof CampaignContractGoneError) {
          request.log.info(
            { campaignId: campaign.id, accountState: err.accountState },
            "Claim eligibility: campaign contract is gone from the chain",
          );
          return { eligible: false, reason: "campaign_refunded", checked: true, gasGram: CLAIM_GAS_GRAM };
        }
        request.log.warn({ err, campaignId: campaign.id }, "Claim eligibility: chain read failed");
        return { eligible: true, reason: null, checked: false, gasGram: CLAIM_GAS_GRAM };
      }
    }
  );
}
