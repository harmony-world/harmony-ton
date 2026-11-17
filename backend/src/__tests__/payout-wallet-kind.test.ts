import { describe, expect, it, vi } from "vitest";
import { acceptsUsdt, resolveWalletKind } from "../services/payout-wallet-kind.js";

const TG = "kUmuUcHkaJcQzr94MCl7Fqz7rbNjqSClN4k+f/7sp2g=";
const V5R1 = "IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8=";
const ADDRESS = "EQDHo6P-imEpPwW_QhEdWZBXgz634bAXaat4kkLuTW7EZncr";

const chain = (account: object | null) =>
  vi.fn(async () => new Response(JSON.stringify({ accounts: account ? [account] : [] }), { status: 200 })) as unknown as typeof fetch;
const prismaWith = (walletKind: string | null) => {
  const findFirst = vi.fn(async () => (walletKind ? { walletKind } : null));
  return { prisma: { user: { findFirst } } as never, findFirst };
};

describe("resolveWalletKind", () => {
  it("recognises Telegram's built-in wallet by its code", async () => {
    const { prisma } = prismaWith(null);
    expect(await resolveWalletKind(prisma, ADDRESS, undefined, chain({ status: "active", code_hash: TG }))).toBe("wallet_tg");
  });

  it("calls any other deployed wallet other, without asking the database", async () => {
    const { prisma, findFirst } = prismaWith("wallet_tg");
    expect(await resolveWalletKind(prisma, ADDRESS, undefined, chain({ status: "active", code_hash: V5R1 }))).toBe("other");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the ton_proof of a linked wallet that has no code on-chain yet", async () => {
    const { prisma } = prismaWith("wallet_tg");
    expect(await resolveWalletKind(prisma, ADDRESS, undefined, chain({ status: "uninit", code_hash: null }))).toBe("wallet_tg");
  });

  it("does not know an undeployed wallet nobody linked", async () => {
    const { prisma } = prismaWith(null);
    expect(await resolveWalletKind(prisma, ADDRESS, undefined, chain(null))).toBeNull();
  });

  it("treats an unreachable chain as not known, and says so in the log", async () => {
    const { prisma } = prismaWith(null);
    const warn = vi.fn();
    const down = vi.fn(async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
    expect(await resolveWalletKind(prisma, ADDRESS, { warn }, down)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("answers null for something that is not an address", async () => {
    const { prisma } = prismaWith("wallet_tg");
    expect(await resolveWalletKind(prisma, "not-an-address", undefined, chain(null))).toBeNull();
  });
});

describe("acceptsUsdt", () => {
  it("is false only for Telegram's built-in wallet", () => {
    expect(acceptsUsdt("wallet_tg")).toBe(false);
    expect(acceptsUsdt("other")).toBe(true);
    expect(acceptsUsdt(null)).toBe(true);
  });
});
