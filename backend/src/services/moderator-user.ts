import type { FastifyInstance } from "fastify";
import type { ModeratorIdentity } from "./campaign-moderation-format.js";

const ROLES_ABOVE_MODERATOR = ["owner", "admin"];

export async function ensureModeratorUser(app: FastifyInstance, moderator: ModeratorIdentity) {
  const existing = await app.prisma.user.findUnique({
    where: { tgUserId: moderator.tgUserId },
    select: { role: true },
  });
  const keepRole = existing !== null && ROLES_ABOVE_MODERATOR.includes(existing.role);

  return app.prisma.user.upsert({
    where: { tgUserId: moderator.tgUserId },
    create: {
      tgUserId: moderator.tgUserId,
      tgUsername: moderator.username ?? null,
      tgFirstName: moderator.firstName ?? null,
      role: "moderator",
    },
    update: {
      tgUsername: moderator.username ?? null,
      tgFirstName: moderator.firstName ?? null,
      ...(keepRole ? {} : { role: "moderator" }),
    },
    select: { id: true },
  });
}
