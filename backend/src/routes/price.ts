import type { FastifyInstance } from "fastify";
import { getTonPrice, getLastFetchedAt } from "../services/price.js";

export async function priceRoutes(app: FastifyInstance) {
  app.get(
    "/price/ton",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              usd: { type: "number" },
              fetchedAt: { type: ["number", "null"] },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const fetchedAt = getLastFetchedAt();
      return reply.send({
        usd: getTonPrice(),
        fetchedAt: fetchedAt > 0 ? fetchedAt : null,
      });
    }
  );
}
