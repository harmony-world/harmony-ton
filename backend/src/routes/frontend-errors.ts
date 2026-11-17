import type { FastifyInstance } from "fastify";

export async function frontendErrorRoutes(app: FastifyInstance) {
  app.post(
    "/frontend-errors",
    {
      config: { skipAuth: true },
      schema: {
        body: {
          type: "object",
          properties: {
            message: { type: "string", maxLength: 500 },
            name: { type: "string", maxLength: 100 },
            stack: { type: "string", maxLength: 2000 },
            componentStack: { type: "string", maxLength: 2000 },
            url: { type: "string", maxLength: 500 },
            userAgent: { type: "string", maxLength: 500 },
            timestamp: { type: "string" },
            source: { type: "string", maxLength: 200 },
          },
          required: ["message"],
        },
        response: { 204: { type: "null" } },
      },
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      request.log.error({ frontendError: body }, "Frontend error reported");
      return reply.code(204).send();
    }
  );
}
