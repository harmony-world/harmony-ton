import type { FastifyInstance } from "fastify";
import { linkExistingDonationsForWallet } from "../services/user-stats.js";
import { normalizeTonAddress } from "../utils/ton-address.js";
import {
  type TonProofPayload,
  consumeWalletProofChallenge,
  createWalletProofChallenge,
  isWalletTgStateInit,
  readWalletTgPublicKey,
  verifyTonProof,
} from "../services/ton-proof.js";
import { TonCenterClient } from "../indexer/ton-api.js";
import { refreshEmojiStatusForUser } from "../services/emoji-status.js";
import { recalcUserTrustScore } from "../services/trust-score.js";

interface UpdateWalletBody {
  walletAddress: string;
  proof?: TonProofPayload;
  walletStateInit?: string;
}

let chainClient: TonCenterClient | undefined;

function walletProofChainClient(): TonCenterClient {
  chainClient ??= new TonCenterClient({ testnet: !isMainnet(), apiKey: process.env.TON_CENTER_API_KEY || undefined });
  return chainClient;
}

function isMainnet(): boolean {
  return process.env.TON_NETWORK === "mainnet";
}

function expectedWalletProofDomain(): string {
  if (process.env.WALLET_PROOF_DOMAIN) return process.env.WALLET_PROOF_DOMAIN;
  const miniAppUrl = process.env.MINI_APP_URL;
  if (miniAppUrl) {
    try {
      return new URL(miniAppUrl).hostname;
    } catch (err) {
      void err;
    }
  }
  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin?.startsWith("http")) {
    try {
      return new URL(corsOrigin).hostname;
    } catch (err) {
      void err;
    }
  }
  return "ton.harmonymarket.click";
}

export function registerUserWalletRoutes(app: FastifyInstance) {
  app.put<{ Body: UpdateWalletBody }>(
    "/users/me/wallet",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            walletAddress: { type: "string", minLength: 1 },
            walletStateInit: { type: "string", minLength: 1 },
            proof: {
              type: "object",
              required: ["timestamp", "domain", "signature", "payload"],
              properties: {
                timestamp: { type: "integer" },
                domain: {
                  type: "object",
                  required: ["value"],
                  properties: {
                    lengthBytes: { type: "integer", minimum: 0 },
                    value: { type: "string", minLength: 1 },
                  },
                  additionalProperties: false,
                },
                signature: { type: "string", minLength: 1 },
                payload: { type: "string", minLength: 1 },
              },
              additionalProperties: false,
            },
          },
          required: ["walletAddress"],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const walletAddress = request.body.walletAddress.trim();
      const walletFriendly = normalizeTonAddress(walletAddress);
      const hasProof = Boolean(request.body.proof && request.body.walletStateInit);
      if (isMainnet() && !hasProof) {
        return reply.code(400).send({ error: "Wallet proof required" });
      }
      if (hasProof) {
        const proof = request.body.proof!;
        const payloadAccepted = consumeWalletProofChallenge(request.user.id, proof.payload);
        if (!payloadAccepted) {
          return reply.code(400).send({ error: "Invalid wallet proof challenge" });
        }
        const walletStateInit = request.body.walletStateInit!;
        let currentPublicKey: Buffer | undefined;
        if (isWalletTgStateInit(walletStateInit)) {
          try {
            currentPublicKey = (await readWalletTgPublicKey(walletProofChainClient(), walletAddress)) ?? undefined;
          } catch (err) {
            request.log.warn({ err }, "wallet proof: WalletTg get_public_key unavailable");
            return reply.code(503).send({ error: "Wallet proof check unavailable, try again" });
          }
        }
        const verified = verifyTonProof({
          address: walletAddress,
          proof,
          walletStateInit,
          expectedPayload: proof.payload,
          expectedDomain: expectedWalletProofDomain(),
          currentPublicKey,
        });
        if (!verified.ok) {
          request.log.warn({ reason: verified.error, walletTg: isWalletTgStateInit(walletStateInit) }, "wallet proof rejected");
          return reply.code(400).send({ error: "Invalid wallet proof", reason: verified.error });
        }
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const currentUser = await tx.user.findUnique({
          where: { id: request.user.id },
          select: {
            kycLevel: true,
            kycStatus: true,
            walletAddress: true,
            walletFriendly: true,
          },
        });
        const shouldGrantWalletKyc =
          !currentUser || currentUser.kycLevel < 1 || currentUser.kycStatus === "not_started";

        const previousAddress = currentUser?.walletAddress ?? null;
        const previousFriendly = currentUser?.walletFriendly ?? null;
        const isRebind = Boolean(
          (previousFriendly && previousFriendly !== walletFriendly) ||
            (previousAddress && previousAddress !== walletAddress)
        );

        await tx.user.update({
          where: { id: request.user.id },
          data: {
            walletAddress,
            walletFriendly,
            walletConnected: true,
            walletKind: hasProof ? (isWalletTgStateInit(request.body.walletStateInit!) ? "wallet_tg" : "other") : null,
            ...(shouldGrantWalletKyc
              ? {
                  kycLevel: 1,
                  kycStatus: "approved",
                  kycProvider: "ton_connect",
                  kycVerifiedAt: new Date(),
                }
              : {}),
          },
        });

        const repair = await linkExistingDonationsForWallet(tx, {
          userId: request.user.id,
          tgUserId: request.user.tgUserId,
          walletAddress,
          walletFriendly,
        });

        return { repair, isRebind, previousAddress, previousFriendly, shouldGrantWalletKyc };
      });

      if (result.isRebind) {
        app.log.info(
          {
            userId: request.user.id,
            previousAddress: result.previousAddress,
            previousFriendly: result.previousFriendly,
            walletAddress,
            walletFriendly,
          },
          "[wallet-binding] wallet rebound to a different address"
        );
      }

      if (result.shouldGrantWalletKyc) {
        await recalcUserTrustScore(app.prisma, request.user.id);
      }

      void refreshEmojiStatusForUser(app, request.user.id);

      return {
        walletAddress,
        walletFriendly,
        walletConnected: true,
        rebind: result.isRebind,
        repair: result.repair,
      };
    }
  );

  app.post("/users/me/wallet/challenge", async (request) => {
    const challenge = createWalletProofChallenge(request.user.id);
    return {
      payload: challenge.payload,
      expiresAt: challenge.expiresAt.toISOString(),
      domain: expectedWalletProofDomain(),
      required: isMainnet(),
    };
  });

  app.post("/users/me/repair-donations", async (request, reply) => {
    const result = await app.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: request.user.id },
        select: {
          id: true,
          tgUserId: true,
          walletAddress: true,
          walletFriendly: true,
        },
      });

      if (!user) return null;

      const walletAddress = user.walletAddress ?? user.walletFriendly;
      const walletFriendly = user.walletFriendly ?? user.walletAddress;
      if (!walletAddress || !walletFriendly) {
        return { error: "Wallet is not bound" as const };
      }

      return linkExistingDonationsForWallet(tx, {
        userId: user.id,
        tgUserId: user.tgUserId,
        walletAddress,
        walletFriendly,
      });
    });

    if (!result) return reply.code(404).send({ error: "User not found" });
    if ("error" in result) return reply.code(400).send({ error: result.error });
    void refreshEmojiStatusForUser(app, request.user.id);
    return result;
  });
}
