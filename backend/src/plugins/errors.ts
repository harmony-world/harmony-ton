import type { FastifyInstance } from "fastify";

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if ((error as { code?: string }).code === "P2023") {
      request.log.info({ url: request.url }, "malformed id in request");
      return reply.code(400).send({ error: "Invalid id" });
    }
    return reply.send(error);
  });
}
