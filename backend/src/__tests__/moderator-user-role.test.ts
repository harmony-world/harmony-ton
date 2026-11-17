import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { ensureModeratorUser } from "../services/moderator-user.js";

function appWithRole(role: string | null) {
  const upsert = vi.fn().mockResolvedValue({ id: "user-1" });
  const findUnique = vi.fn().mockResolvedValue(role === null ? null : { role });
  return {
    app: { prisma: { user: { findUnique, upsert } } } as unknown as FastifyInstance,
    upsert,
  };
}

const moderator = { tgUserId: 100200300n, username: "test_owner", firstName: "test_owner" };

describe("ensureModeratorUser", () => {
  it("leaves the owner role alone when the owner moderates a campaign", async () => {
    const { app, upsert } = appWithRole("owner");

    await ensureModeratorUser(app, moderator);

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("role");
  });

  it("leaves the admin role alone", async () => {
    const { app, upsert } = appWithRole("admin");

    await ensureModeratorUser(app, moderator);

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("role");
  });

  it("raises a donor to moderator", async () => {
    const { app, upsert } = appWithRole("donor");

    await ensureModeratorUser(app, moderator);

    expect(upsert.mock.calls[0][0].update.role).toBe("moderator");
  });

  it("creates a missing user as moderator", async () => {
    const { app, upsert } = appWithRole(null);

    await ensureModeratorUser(app, moderator);

    expect(upsert.mock.calls[0][0].create.role).toBe("moderator");
  });
});
