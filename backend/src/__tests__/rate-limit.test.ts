import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import rateLimitPlugin from "../plugins/rate-limit.js";
import { clearRateLimits } from "../services/rate-limit.js";

const ORIGINAL_ENV = {
  RATE_LIMIT_CAMPAIGN_CREATE_MAX: process.env.RATE_LIMIT_CAMPAIGN_CREATE_MAX,
  RATE_LIMIT_CAMPAIGN_CREATE_WINDOW_MS: process.env.RATE_LIMIT_CAMPAIGN_CREATE_WINDOW_MS,
  RATE_LIMIT_WALLET_BIND_MAX: process.env.RATE_LIMIT_WALLET_BIND_MAX,
  RATE_LIMIT_WHITELIST_MULTIPLIER: process.env.RATE_LIMIT_WHITELIST_MULTIPLIER,
  RATE_LIMIT_CHANNEL_INFO_MAX: process.env.RATE_LIMIT_CHANNEL_INFO_MAX,
  RATE_LIMIT_CHANNEL_INFO_WINDOW_MS: process.env.RATE_LIMIT_CHANNEL_INFO_WINDOW_MS,
  RATE_LIMIT_WEBHOOK_MAX: process.env.RATE_LIMIT_WEBHOOK_MAX,
  RATE_LIMIT_WEBHOOK_WINDOW_MS: process.env.RATE_LIMIT_WEBHOOK_WINDOW_MS,
  RATE_LIMIT_ADMIN_LOGIN_MAX: process.env.RATE_LIMIT_ADMIN_LOGIN_MAX,
  RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS: process.env.RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS,
  HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST: process.env.HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST,
};

const WHITELISTED = "whitelisted_author";

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("rateLimitPlugin", () => {
  afterEach(() => {
    restoreEnv();
    clearRateLimits();
  });

  it("rate limits configured sensitive routes", async () => {
    process.env.RATE_LIMIT_CHANNEL_INFO_MAX = "1";
    process.env.RATE_LIMIT_CHANNEL_INFO_WINDOW_MS = "60000";
    const app = Fastify({ logger: false });
    await app.register(rateLimitPlugin);
    app.get("/channels/info", async () => ({ ok: true }));

    const first = await app.inject({ method: "GET", url: "/channels/info?link=@test" });
    const second = await app.inject({ method: "GET", url: "/channels/info?link=@test" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBeDefined();
    expect(second.json()).toEqual(expect.objectContaining({ error: "rate_limited" }));
  });

  it("rate limits KYC webhook routes", async () => {
    process.env.RATE_LIMIT_WEBHOOK_MAX = "1";
    process.env.RATE_LIMIT_WEBHOOK_WINDOW_MS = "60000";
    const app = Fastify({ logger: false });
    await app.register(rateLimitPlugin);
    app.post("/kyc/didit/webhook", async () => ({ ok: true }));

    const first = await app.inject({ method: "POST", url: "/kyc/didit/webhook", payload: {} });
    const second = await app.inject({ method: "POST", url: "/kyc/didit/webhook", payload: {} });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual(expect.objectContaining({ error: "rate_limited" }));
  });

  it("rate limits admin bot login start", async () => {
    process.env.RATE_LIMIT_ADMIN_LOGIN_MAX = "1";
    process.env.RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS = "60000";
    const app = Fastify({ logger: false });
    await app.register(rateLimitPlugin);
    app.post("/admin/auth/bot/start", async () => ({ ok: true }));

    const first = await app.inject({ method: "POST", url: "/admin/auth/bot/start" });
    const second = await app.inject({ method: "POST", url: "/admin/auth/bot/start" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual(expect.objectContaining({ error: "rate_limited" }));
  });
});

describe("rateLimitPlugin and the whitelist", () => {
  afterEach(() => {
    restoreEnv();
    clearRateLimits();
  });

  async function appAs(username: string | null, userId: string) {
    const app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => {
      (request as unknown as { user: unknown }).user = { id: userId, username };
    });
    await app.register(rateLimitPlugin);
    app.post("/campaigns", async () => ({ ok: true }));
    app.put("/users/me/wallet", async () => ({ ok: true }));
    return app;
  }

  const createCampaign = (app: Awaited<ReturnType<typeof appAs>>) =>
    app.inject({ method: "POST", url: "/campaigns", payload: {} });

  it("gives a whitelisted author a higher ceiling on campaign creation", async () => {
    process.env.RATE_LIMIT_CAMPAIGN_CREATE_MAX = "1";
    process.env.RATE_LIMIT_CAMPAIGN_CREATE_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_WHITELIST_MULTIPLIER = "3";
    process.env.HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST = WHITELISTED;
    const app = await appAs(WHITELISTED, "user-whitelisted");

    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await createCampaign(app)).statusCode);

    expect(codes).toEqual([200, 200, 200]);
  });

  it("still stops a whitelisted author — the pass is a raised ceiling, not a bypass", async () => {
    process.env.RATE_LIMIT_CAMPAIGN_CREATE_MAX = "1";
    process.env.RATE_LIMIT_CAMPAIGN_CREATE_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_WHITELIST_MULTIPLIER = "3";
    process.env.HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST = WHITELISTED;
    const app = await appAs("@Whitelisted_Author", "user-whitelisted-cased");

    for (let i = 0; i < 3; i++) await createCampaign(app);
    const overflow = await createCampaign(app);

    expect(overflow.statusCode).toBe(429);
    expect(overflow.headers["retry-after"]).toBeDefined();
  });

  it("leaves everyone else on the common limit", async () => {
    process.env.RATE_LIMIT_CAMPAIGN_CREATE_MAX = "1";
    process.env.RATE_LIMIT_CAMPAIGN_CREATE_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_WHITELIST_MULTIPLIER = "3";
    process.env.HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST = WHITELISTED;
    const app = await appAs("someone-else", "user-regular");

    expect((await createCampaign(app)).statusCode).toBe(200);
    expect((await createCampaign(app)).statusCode).toBe(429);
  });

  it("does not widen routes the whitelist has no business in", async () => {
    process.env.RATE_LIMIT_WALLET_BIND_MAX = "1";
    process.env.RATE_LIMIT_WHITELIST_MULTIPLIER = "3";
    process.env.HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST = WHITELISTED;
    const app = await appAs(WHITELISTED, "user-whitelisted-wallet");

    const bind = () => app.inject({ method: "PUT", url: "/users/me/wallet", payload: {} });
    expect((await bind()).statusCode).toBe(200);
    expect((await bind()).statusCode).toBe(429);
  });

  it("ignores an unauthenticated caller with no username to check", async () => {
    process.env.RATE_LIMIT_CAMPAIGN_CREATE_MAX = "1";
    process.env.RATE_LIMIT_WHITELIST_MULTIPLIER = "3";
    process.env.HARMONY_CAMPAIGN_RATE_LIMIT_WHITELIST = WHITELISTED;
    const app = await appAs(null, "user-anonymous");

    expect((await createCampaign(app)).statusCode).toBe(200);
    expect((await createCampaign(app)).statusCode).toBe(429);
  });
});
