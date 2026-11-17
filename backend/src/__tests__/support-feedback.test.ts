import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import { supportRoutes } from "../routes/support.js";

function buildApp(send: () => Promise<unknown>, moderatorIds = "1,2") {
  process.env.MODERATOR_TG_IDS = moderatorIds;
  const app = Fastify({ logger: false });
  app.register(
    fp(async (instance) => {
      instance.decorate("moderationBot", {
        api: {
          sendMessage: send,
          sendPhoto: send,
          sendMediaGroup: send,
        },
      } as never);
      instance.addHook("onRequest", async (request) => {
        request.user = { id: "u1", tgUserId: 7n, username: "someone", firstName: "Some" } as never;
        request.t = ((key: string) => key) as never;
      });
    }),
  );
  app.register(supportRoutes);
  return app;
}

const body = { message: "the lift broke and I cannot reach the pharmacy" };

describe("support feedback reports delivery, not intent", () => {
  it("accepts the message when a moderator received it", async () => {
    const app = buildApp(async () => ({}));
    const res = await app.inject({ method: "POST", url: "/support/feedback", payload: body });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("refuses when the message reached nobody", async () => {
    const app = buildApp(async () => {
      throw new Error("bot api is down");
    });
    const res = await app.inject({ method: "POST", url: "/support/feedback", payload: body });
    await app.close();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toHaveProperty("error");
  });

  it("accepts when one moderator of two is unreachable — one pair of eyes is enough", async () => {
    let call = 0;
    const app = buildApp(async () => {
      call += 1;
      if (call === 1) throw new Error("blocked the bot");
      return {};
    });
    const res = await app.inject({ method: "POST", url: "/support/feedback", payload: body });
    await app.close();
    expect(res.statusCode).toBe(200);
  });

  it("rejects a message too short to act on", async () => {
    const app = buildApp(async () => ({}));
    const res = await app.inject({ method: "POST", url: "/support/feedback", payload: { message: "hi" } });
    await app.close();
    expect(res.statusCode).toBe(400);
  });
});
