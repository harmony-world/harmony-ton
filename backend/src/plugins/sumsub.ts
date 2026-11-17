import fp from "fastify-plugin";
import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

const BASE_URL = "https://api.sumsub.com";
const DEFAULT_LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME ?? "basic-kyc-level";

function sign(method: string, path: string, body: string, secretKey: string): { ts: string; sig: string } {
  const ts = String(Math.floor(Date.now() / 1000));
  const data = ts + method.toUpperCase() + path + body;
  const sig = crypto.createHmac("sha256", secretKey).update(data).digest("hex");
  return { ts, sig };
}

async function sumsubRequest(
  method: string,
  path: string,
  body: unknown,
  appToken: string,
  secretKey: string
): Promise<unknown> {
  const bodyStr = body ? JSON.stringify(body) : "";
  const { ts, sig } = sign(method, path, bodyStr, secretKey);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": appToken,
      "X-App-Access-Ts": ts,
      "X-App-Access-Sig": sig,
    },
    body: bodyStr || undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sumsub API error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface SumsubClient {
  createApplicant(externalUserId: string, levelName?: string): Promise<{ id: string }>;
  getAccessToken(externalUserId: string, levelName?: string): Promise<{ token: string }>;
  getApplicantStatus(applicantId: string): Promise<{ review: { reviewAnswer?: string }; info?: { idDocs?: Array<{ number?: string }> } }>;
  getVerificationSteps(applicantId: string): Promise<unknown>;
}

export function createSumsubClient(appToken: string, secretKey: string): SumsubClient {
  return {
    async createApplicant(externalUserId, levelName = DEFAULT_LEVEL_NAME) {
      const data = await sumsubRequest(
        "POST",
        `/resources/applicants?levelName=${encodeURIComponent(levelName)}`,
        { externalUserId },
        appToken,
        secretKey
      ) as { id: string };
      return { id: data.id };
    },

    async getAccessToken(externalUserId, levelName = DEFAULT_LEVEL_NAME) {
      const data = await sumsubRequest(
        "POST",
        `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}`,
        undefined,
        appToken,
        secretKey
      ) as { token: string };
      return { token: data.token };
    },

    async getApplicantStatus(applicantId) {
      const data = await sumsubRequest(
        "GET",
        `/resources/applicants/${applicantId}/status`,
        undefined,
        appToken,
        secretKey
      );
      return data as { review: { reviewAnswer?: string }; info?: { idDocs?: Array<{ number?: string }> } };
    },

    async getVerificationSteps(applicantId) {
      return sumsubRequest(
        "GET",
        `/resources/applicants/${applicantId}/requiredIdDocsStatus`,
        undefined,
        appToken,
        secretKey
      );
    },
  };
}

export function verifyWebhookSignature(
  body: string,
  ts: string,
  sig: string,
  secretKey: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(ts + body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}

declare module "fastify" {
  interface FastifyInstance {
    sumsub: SumsubClient;
  }
}

const sumsubPlugin: FastifyPluginAsync = fp(async (app) => {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  if (!appToken || !secretKey) {
    app.log.warn("SUMSUB_APP_TOKEN / SUMSUB_SECRET_KEY not set — KYC disabled");
    return;
  }
  app.decorate("sumsub", createSumsubClient(appToken, secretKey));
});

export default sumsubPlugin;
