import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { walletRoutes } from "../routes/wallets.js";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = {
  TON_NETWORK: process.env.TON_NETWORK,
  TON_API_BASE_URL: process.env.TON_API_BASE_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("walletRoutes", () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    restoreEnv();
  });

  it("proxies jetton wallet lookup through configured TonAPI base URL", async () => {
    process.env.TON_NETWORK = "testnet";
    process.env.TON_API_BASE_URL = "https://tonapi-proxy.example";
    const rawAddr = "0:6909b1849854f84c39b11dd64ab4b958b8f549c3e43c0b7bd95bc1b5be7c1fb0";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        wallet_address: { address: rawAddr },
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const app = Fastify({ logger: false });
    await app.register(walletRoutes);

    const walletAddress = "kQBpAbGEmFT4TDmxHdZKtLlYuPVJw-Q8C3vZW8G1vnwfsKHt";
    const jettonMaster = "kQBpAbGEmFT4TDmxHdZKtLlYuPVJw-Q8C3vZW8G1vnwfsKHt";
    const res = await app.inject({
      method: "GET",
      url: `/wallets/jetton-address?walletAddress=${encodeURIComponent(walletAddress)}&jettonMaster=${encodeURIComponent(jettonMaster)}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { address: string };
    expect(body.address).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("https://tonapi-proxy.example/v2/accounts/");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/address");
  });
});
