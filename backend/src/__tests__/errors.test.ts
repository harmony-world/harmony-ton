import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { installErrorHandler } from "../plugins/errors.js";

describe("installErrorHandler", () => {
  async function appThrowing(error: Error & { code?: string; statusCode?: number }) {
    const app = Fastify({ logger: false });
    installErrorHandler(app);
    app.get("/x", async () => {
      throw error;
    });
    return app;
  }

  it("answers 400 to a malformed id that Postgres refused (Prisma P2023)", async () => {
    const app = await appThrowing(Object.assign(new Error("Inconsistent column data: Error creating UUID"), { code: "P2023" }));
    const res = await app.inject({ method: "GET", url: "/x" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid id" });
  });

  it("leaves every other error to Fastify as before", async () => {
    const app = await appThrowing(new Error("boom"));
    expect((await app.inject({ method: "GET", url: "/x" })).statusCode).toBe(500);
    const teapot = await appThrowing(Object.assign(new Error("teapot"), { statusCode: 418 }));
    expect((await teapot.inject({ method: "GET", url: "/x" })).statusCode).toBe(418);
  });
});
