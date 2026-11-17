import type { FastifyInstance } from "fastify";

const LEADERBOARD_LIMIT = 50;

export async function leaderboardRoutes(app: FastifyInstance) {
  app.get(
    "/leaderboard",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              leaders: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    rank: { type: "integer" },
                    userId: { type: "string" },
                    firstName: { type: ["string", "null"] },
                    username: { type: ["string", "null"] },
                    photoUrl: { type: ["string", "null"] },
                    totalDonatedUsd: { type: "number" },
                    donationCount: { type: "integer" },
                    donorStatus: { type: ["string", "null"] },
                  },
                },
              },
              myEntry: {
                type: ["object", "null"],
                properties: {
                  rank: { type: "integer" },
                  userId: { type: "string" },
                  firstName: { type: ["string", "null"] },
                  username: { type: ["string", "null"] },
                  photoUrl: { type: ["string", "null"] },
                  totalDonatedUsd: { type: "number" },
                  donationCount: { type: "integer" },
                  donorStatus: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const currentUserId = request.user.id;

      const topUsers = await app.prisma.user.findMany({
        where: {
          isPublic: true,
          isBlocked: false,
          totalDonatedUsd: { gt: 0 },
        },
        orderBy: [
          { totalDonatedUsd: "desc" },
          { donationCount: "desc" },
        ],
        take: LEADERBOARD_LIMIT,
        select: {
          id: true,
          tgFirstName: true,
          tgUsername: true,
          tgPhotoUrl: true,
          totalDonatedUsd: true,
          donationCount: true,
          donorStatus: true,
        },
      });

      const leaders = topUsers.map((u, i) => ({
        rank: i + 1,
        userId: u.id,
        firstName: u.tgFirstName,
        username: u.tgUsername,
        photoUrl: u.tgPhotoUrl,
        totalDonatedUsd: Number(u.totalDonatedUsd),
        donationCount: u.donationCount,
        donorStatus: u.donorStatus,
      }));

      let myEntry: typeof leaders[number] | null = null;
      const inTop = leaders.findIndex((l) => l.userId === currentUserId);
      if (inTop >= 0) {
        myEntry = leaders[inTop]!;
      } else {
        const me = await app.prisma.user.findUnique({
          where: { id: currentUserId },
          select: {
            id: true,
            tgFirstName: true,
            tgUsername: true,
            tgPhotoUrl: true,
            totalDonatedUsd: true,
            donationCount: true,
            donorStatus: true,
            isPublic: true,
            isBlocked: true,
          },
        });
        if (me && !me.isBlocked && Number(me.totalDonatedUsd) > 0) {
          const ahead = await app.prisma.user.count({
            where: {
              isPublic: true,
              isBlocked: false,
              totalDonatedUsd: { gt: me.totalDonatedUsd },
            },
          });
          myEntry = {
            rank: ahead + 1,
            userId: me.id,
            firstName: me.tgFirstName,
            username: me.tgUsername,
            photoUrl: me.tgPhotoUrl,
            totalDonatedUsd: Number(me.totalDonatedUsd),
            donationCount: me.donationCount,
            donorStatus: me.donorStatus,
          };
        }
      }

      return { leaders, myEntry };
    },
  );
}
