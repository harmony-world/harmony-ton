import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export const DOC_HASH_ALGO = "hmac-sha256-v1";
const LEGACY_DOC_HASH_ALGO = "sha256";

function docHashKey(): string {
  const key = process.env.DOC_HASH_KEY?.trim();
  if (!key || key.length < 32) {
    throw new Error("DOC_HASH_KEY is not set or shorter than 32 characters");
  }
  return key;
}

function hmac(input: string): string {
  return crypto.createHmac("sha256", docHashKey()).update(input).digest("hex");
}

export function docFingerprint(docNumber: string): string {
  return hmac(crypto.createHash("sha256").update(docNumber).digest("hex"));
}

export function upgradeLegacyDocHash(legacyHex: string): string {
  return hmac(legacyHex);
}

type DocHashStore = Pick<PrismaClient, "user">;

export async function migrateLegacyDocHashes(prisma: DocHashStore): Promise<number> {
  const legacy = await prisma.user.findMany({
    where: { docHashAlgo: LEGACY_DOC_HASH_ALGO, docHash: { not: null } },
    select: { id: true, docHash: true },
  });
  for (const row of legacy) {
    if (!row.docHash) continue;
    await prisma.user.update({
      where: { id: row.id },
      data: { docHash: upgradeLegacyDocHash(row.docHash), docHashAlgo: DOC_HASH_ALGO },
    });
  }
  return legacy.length;
}

const SESSION_FIELDS = [
  "session_id",
  "session_number",
  "session_kind",
  "session_url",
  "url",
  "status",
  "workflow_id",
  "webhook_type",
  "event_id",
  "vendor_data",
  "created_at",
  "expires_at",
] as const;

const CHECK_FIELDS = [
  "id_verification",
  "id_verifications",
  "nfc_verification",
  "nfc_verifications",
  "liveness",
  "liveness_checks",
  "face_match",
  "face_matches",
  "poa",
  "poa_verification",
  "poa_verifications",
  "phone",
  "phone_verifications",
  "email",
  "email_verifications",
  "aml",
  "aml_screenings",
  "ip_analysis",
  "ip_analyses",
  "database_validations",
  "document_ai_documents",
  "questionnaire_responses",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkSummary(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const summary: Record<string, string> = {};
  if (typeof value.node_id === "string") summary.node_id = value.node_id;
  if (typeof value.status === "string") summary.status = value.status;
  return summary;
}

export function redactDiditPayload(payload: unknown): Prisma.InputJsonObject {
  if (!isRecord(payload)) return {};
  const out: Record<string, Prisma.InputJsonValue> = {};

  for (const field of SESSION_FIELDS) {
    const value = payload[field];
    if (typeof value === "string" || typeof value === "number") out[field] = value;
  }
  if (Array.isArray(payload.features) && payload.features.every((f) => typeof f === "string")) {
    out.features = payload.features as string[];
  }

  for (const field of CHECK_FIELDS) {
    const value = payload[field];
    if (Array.isArray(value)) {
      out[field] = value.map(checkSummary).filter((item) => item !== null);
    } else if (isRecord(value)) {
      const summary = checkSummary(value);
      if (summary) out[field] = summary;
    }
  }

  if (isRecord(payload.decision)) out.decision = redactDiditPayload(payload.decision);

  return out;
}
