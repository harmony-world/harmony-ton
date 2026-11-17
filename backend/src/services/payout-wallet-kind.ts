import type { PrismaClient } from "@prisma/client";
import { Address } from "@ton/core";
import { WALLET_TG_CODE_HASH } from "./ton-proof.js";
import { tonAddressCandidates } from "../utils/ton-address.js";

export type WalletKind = "wallet_tg" | "other";

const WALLET_TG_CODE_HASH_B64 = Buffer.from(WALLET_TG_CODE_HASH, "hex").toString("base64");

export function walletKindOfCodeHash(codeHashB64: string): WalletKind {
  return codeHashB64 === WALLET_TG_CODE_HASH_B64 ? "wallet_tg" : "other";
}

function toncenterBase(): string {
  return process.env.TON_NETWORK === "mainnet" ? "https://toncenter.com/api/v3" : "https://testnet.toncenter.com/api/v3";
}

export async function readWalletKindOnChain(address: string, fetchImpl: typeof fetch = fetch): Promise<WalletKind | null> {
  const headers: Record<string, string> = {};
  if (process.env.TON_CENTER_API_KEY) headers["X-API-Key"] = process.env.TON_CENTER_API_KEY;
  const url = `${toncenterBase()}/accountStates?address=${encodeURIComponent(address)}&include_boc=false`;
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`toncenter accountStates ${res.status}`);
  const body = (await res.json()) as { accounts?: Array<{ status?: string; code_hash?: string | null }> };
  const account = body.accounts?.[0];
  if (!account || account.status !== "active" || !account.code_hash) return null;
  return walletKindOfCodeHash(account.code_hash);
}

export async function resolveWalletKind(
  prisma: Pick<PrismaClient, "user">,
  address: string,
  log?: { warn: (obj: object, msg: string) => void },
  fetchImpl: typeof fetch = fetch,
): Promise<WalletKind | null> {
  let parsed: Address;
  try {
    parsed = Address.parse(address);
  } catch {
    return null;
  }
  try {
    const onChain = await readWalletKindOnChain(parsed.toRawString(), fetchImpl);
    if (onChain) return onChain;
  } catch (err) {
    log?.warn({ err, address }, "payout wallet kind: chain unreachable");
  }
  const candidates = tonAddressCandidates(address);
  const match = await prisma.user.findFirst({
    where: {
      walletKind: { not: null },
      OR: [{ walletAddress: { in: candidates } }, { walletFriendly: { in: candidates } }],
    },
    select: { walletKind: true },
  });
  return (match?.walletKind as WalletKind | undefined) ?? null;
}

export const acceptsUsdt = (kind: string | null | undefined): boolean => kind !== "wallet_tg";
