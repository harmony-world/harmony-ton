import type { FastifyInstance } from "fastify";
import { Address } from "@ton/core";
import { acceptsUsdt, resolveWalletKind } from "../services/payout-wallet-kind.js";

function tonApiBaseUrl(): string {
  if (process.env.TON_API_BASE_URL) return process.env.TON_API_BASE_URL.replace(/\/+$/, "");
  return process.env.TON_NETWORK === "mainnet" ? "https://tonapi.io" : "https://testnet.tonapi.io";
}

export async function walletRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { address: string } }>(
    "/wallets/kind",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["address"],
          additionalProperties: false,
          properties: { address: { type: "string", minLength: 1, maxLength: 120 } },
        },
      },
    },
    async (request, reply) => {
      try {
        Address.parse(request.query.address);
      } catch {
        return reply.code(400).send({ error: "Invalid TON address" });
      }
      const kind = await resolveWalletKind(app.prisma, request.query.address, request.log);
      return { kind, acceptsUsdt: acceptsUsdt(kind) };
    }
  );

  app.get<{
    Querystring: { walletAddress: string; jettonMaster: string };
  }>(
    "/wallets/jetton-address",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["walletAddress", "jettonMaster"],
          additionalProperties: false,
          properties: {
            walletAddress: { type: "string", minLength: 1, maxLength: 120 },
            jettonMaster: { type: "string", minLength: 1, maxLength: 120 },
          },
        },
      },
    },
    async (request, reply) => {
      let walletAddress: string;
      let jettonMaster: string;
      try {
        walletAddress = Address.parse(request.query.walletAddress).toString({
          testOnly: process.env.TON_NETWORK !== "mainnet",
        });
        jettonMaster = Address.parse(request.query.jettonMaster).toString({
          testOnly: process.env.TON_NETWORK !== "mainnet",
        });
      } catch {
        return reply.code(400).send({ error: "Invalid TON address" });
      }

      const url = `${tonApiBaseUrl()}/v2/accounts/${encodeURIComponent(walletAddress)}/jettons/${encodeURIComponent(jettonMaster)}`;
      const res = await fetch(url);
      if (!res.ok) {
        return reply.code(404).send({ error: "Jetton wallet not found" });
      }
      const data = (await res.json()) as {
        wallet_address?: { address?: string };
      };
      const rawAddr = data.wallet_address?.address;
      if (!rawAddr) {
        return reply.code(404).send({ error: "Jetton wallet not found" });
      }
      const friendly = Address.parse(rawAddr).toString({
        testOnly: process.env.TON_NETWORK !== "mainnet",
        bounceable: true,
        urlSafe: true,
      });
      return { address: friendly };
    }
  );
}
