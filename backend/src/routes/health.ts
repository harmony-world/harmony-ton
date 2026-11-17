import type { FastifyInstance } from "fastify";
import { getScreeningProbeState } from "../services/screening-probe.js";
import { getClockSkewMs, getClockSkewCheckedAt } from "../services/clock-skew.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              uptime: { type: "number" },
              timestamp: { type: "string" },
              screening: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  lastCheckedAt: { type: ["string", "null"] },
                  lastSuccessAt: { type: ["string", "null"] },
                },
              },
              clock: {
                type: "object",
                properties: {
                  skewMs: { type: ["number", "null"] },
                  checkedAt: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const probe = getScreeningProbeState();
      const clockCheckedAt = getClockSkewCheckedAt();
      return reply.send({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        screening: {
          status: probe.status,
          lastCheckedAt: probe.lastCheckedAt,
          lastSuccessAt: probe.lastSuccessAt,
        },
        clock: {
          skewMs: getClockSkewMs(),
          checkedAt: clockCheckedAt > 0 ? new Date(clockCheckedAt).toISOString() : null,
        },
      });
    }
  );
}
