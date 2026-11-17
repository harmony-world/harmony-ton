import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { parseKycVerificationLevel } from "../../constants/kyc-levels.js";
import { verifyWebhookSignature } from "../../plugins/sumsub.js";
import { countSuccessfulCampaigns, validateKycTargetPrerequisites } from "./status.js";
import type { DiditWebhookPayload, PrismaLike, SumsubWebhookPayload } from "./types.js";
import { validateKyc4ProviderSteps } from "./provider-steps.js";
import { recalcUserTrustScore } from "../../services/trust-score.js";
import { DOC_HASH_ALGO, docFingerprint, redactDiditPayload } from "../../services/kyc-privacy.js";

export async function handleSumsubWebhook(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return reply.code(500).send({ error: "Webhook secret not configured" });
  }

  const ts = request.headers["x-app-access-ts"] as string;
  const sig = request.headers["x-app-access-sig"] as string;

  if (!ts || !sig) {
    return reply.code(401).send({ error: "Missing signature headers" });
  }

  const rawBody = request.rawBody;
  if (!rawBody) {
    return reply.code(400).send({ error: "Raw body unavailable" });
  }
  const sigBuf = Buffer.from(sig, "hex");

  if (sigBuf.length !== 32 || !verifyWebhookSignature(rawBody, ts, sig, webhookSecret)) {
    return reply.code(401).send({ error: "Invalid signature" });
  }

  const payload = request.body as SumsubWebhookPayload;
  const externalUserId = payload.externalUserId;
  if (!externalUserId) return reply.code(200).send({ ok: true });

  if (payload.type === "applicantReviewed") {
    const answer = payload.reviewResult?.reviewAnswer;
    if (answer === "GREEN") {
      await handleGreenReview(app, payload, externalUserId);
    } else if (answer === "RED") {
      await handleRedReview(app, payload, externalUserId);
    }
  }

  return reply.code(200).send({ ok: true });
}

export async function handleDiditWebhook(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return reply.code(500).send({ error: "Webhook secret not configured" });
  }

  const rawBody = request.rawBody;
  const sigV2 = request.headers["x-signature-v2"] as string | undefined;
  const sigRaw = request.headers["x-signature"] as string | undefined;
  const timestamp = request.headers["x-timestamp"] as string | undefined;
  if (!rawBody) {
    return reply.code(400).send({ error: "Raw body unavailable" });
  }

  const payload = request.body as DiditWebhookPayload;
  const v2SignatureValid = Boolean(sigV2 && verifyDiditWebhookSignature(payload, sigV2, timestamp, webhookSecret));
  const rawSignatureValid = Boolean(sigRaw && verifyDiditRawWebhookSignature(rawBody, sigRaw, timestamp, webhookSecret));
  const signatureValid = v2SignatureValid || rawSignatureValid;
  if (!signatureValid) {
    return reply.code(401).send({ error: "Invalid signature" });
  }
  if (sigV2 && !v2SignatureValid && rawSignatureValid) {
    app.log.warn({ eventId: payload.event_id }, "Didit v2 webhook signature mismatch; accepted raw-body fallback");
  }

  if (payload.webhook_type && !["status.updated", "data.updated"].includes(payload.webhook_type)) {
    return reply.code(200).send({ ok: true });
  }

  const externalUserId = payload.vendor_data;
  if (!externalUserId) return reply.code(200).send({ ok: true });

  await applyDiditDecision(app, payload, externalUserId);

  return reply.code(200).send({ ok: true });
}

export async function applyDiditDecision(
  app: FastifyInstance,
  payload: DiditWebhookPayload,
  expectedUserId?: string,
): Promise<"approved" | "rejected" | "pending" | "ignored"> {
  const externalUserId = payload.vendor_data ?? (
    typeof payload.metadata?.harmony_user_id === "string" ? payload.metadata.harmony_user_id : undefined
  );
  if (!externalUserId) return "ignored";
  if (expectedUserId && externalUserId !== expectedUserId) return "ignored";
  const user = await app.prisma.user.findUnique({
    where: { id: externalUserId },
    select: { id: true },
  });
  if (!user) {
    app.log.warn({ externalUserId, eventId: payload.event_id }, "Ignoring Didit decision for unknown user");
    return "ignored";
  }

  if (payload.status === "Approved") {
    await handleDiditApproved(app, payload, externalUserId);
    return "approved";
  }

  if (
    payload.status === "Declined" ||
    payload.status === "Kyc Expired" ||
    payload.status === "Expired" ||
    payload.status === "Abandoned"
  ) {
    await handleDiditRejected(app, payload, externalUserId);
    return "rejected";
  }

  if (payload.status === "In Review") {
    await app.prisma.user.update({
      where: { id: externalUserId },
      data: { kycStatus: "pending", kycProvider: "didit" },
    });
    await updateLatestDiditPendingAttempts(app, payload, externalUserId);
    return "pending";
  }

  if (
    payload.status === "Not Started" ||
    payload.status === "In Progress" ||
    payload.status === "Awaiting User" ||
    payload.status === "Resubmitted"
  ) {
    await updateLatestDiditPendingAttempts(app, payload, externalUserId);
    return "pending";
  }

  return "ignored";
}

function isFreshDiditTimestamp(timestamp: string | undefined): boolean {
  const value = Number(timestamp);
  if (!Number.isInteger(value)) return false;
  return Math.abs(Math.floor(Date.now() / 1000) - value) <= 300;
}

function shortenFloats(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shortenFloats);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, shortenFloats(child)])
    );
  }
  if (typeof value === "number" && !Number.isInteger(value) && value % 1 === 0) {
    return Math.trunc(value);
  }
  return value;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeys((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
  }
  return value;
}

function timingSafeHexEqual(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "utf8");
  const actual = Buffer.from(actualHex, "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function verifyDiditWebhookSignature(body: unknown, sig: string, timestamp: string | undefined, secretKey: string): boolean {
  if (!isFreshDiditTimestamp(timestamp)) return false;
  const canonical = JSON.stringify(sortKeys(shortenFloats(body)));
  const expected = crypto.createHmac("sha256", secretKey).update(canonical, "utf8").digest("hex");
  return timingSafeHexEqual(expected, sig);
}

export function verifyDiditRawWebhookSignature(body: string, sig: string, timestamp: string | undefined, secretKey: string): boolean {
  if (!isFreshDiditTimestamp(timestamp)) return false;
  const expected = crypto.createHmac("sha256", secretKey).update(body).digest("hex");
  return timingSafeHexEqual(expected, sig);
}

async function handleGreenReview(
  app: FastifyInstance,
  payload: SumsubWebhookPayload,
  externalUserId: string,
) {
  let docHash: string | undefined;
  const docNumber = payload.info?.idDocs?.find((d) => d.number)?.number;
  if (docNumber) {
    docHash = docFingerprint(docNumber);
  }

  const shouldRecalc = await app.prisma.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({
      where: { id: externalUserId },
      select: { kycLevel: true, kycTargetLevel: true, sumsubApplicantId: true },
    });
    const targetLevel = parseKycVerificationLevel(currentUser?.kycTargetLevel) ?? 2;
    if (docHash) {
      const existing = await tx.user.findFirst({
        where: { docHash, NOT: { id: externalUserId } },
        select: { id: true },
      });
      if (existing) {
        await tx.user.update({
          where: { id: externalUserId },
          data: { kycStatus: "rejected_duplicate", kycTargetLevel: null },
        });
        await tx.kycAttempt.updateMany({
          where: { userId: externalUserId, targetLevel, status: "pending" },
          data: {
            status: "rejected",
            failureCode: "DUPLICATE_DOCUMENT",
            failureReason: "This document is already used by another account",
            reviewedAt: new Date(),
          },
        });
        return false;
      }
    }
    const prerequisiteError = await validateKycTargetPrerequisites(
      tx as unknown as PrismaLike,
      externalUserId,
      targetLevel,
      currentUser?.kycLevel ?? 0
    );
    if (prerequisiteError) {
      await tx.user.update({
        where: { id: externalUserId },
        data: {
          kycStatus: "rejected",
          kycTargetLevel: null,
        },
      });
      await tx.kycAttempt.updateMany({
        where: { userId: externalUserId, targetLevel, status: "pending" },
        data: {
          status: "rejected",
          successfulCampaignsCountAtReview: prerequisiteError.successfulCampaigns,
          failureCode: prerequisiteError.code,
          failureReason: prerequisiteError.error,
          reviewedAt: new Date(),
        },
      });
      return false;
    }

    if (targetLevel === 4) {
      const kyc4Handled = await handleKyc4ProviderSteps(app, tx as unknown as PrismaLike, {
        externalUserId,
        providerApplicantId: payload.applicantId ?? currentUser?.sumsubApplicantId ?? null,
      });
      if (kyc4Handled === "pending") return false;
    } else {
      await tx.kycAttempt.updateMany({
        where: { userId: externalUserId, targetLevel, status: "pending" },
        data: {
          status: "approved",
          reviewedAt: new Date(),
        },
      });
    }

    const nextLevel = Math.max(currentUser?.kycLevel ?? 0, targetLevel);
    await tx.user.update({
      where: { id: externalUserId },
      data: {
        kycStatus: "approved",
        kycLevel: nextLevel,
        kycProvider: "sumsub",
        kycVerifiedAt: new Date(),
        kycTargetLevel: null,
        ...(docHash ? { docHash, docHashAlgo: DOC_HASH_ALGO } : {}),
      },
    });
    return nextLevel !== (currentUser?.kycLevel ?? 0);
  });
  if (shouldRecalc) {
    await recalcUserTrustScore(app.prisma, externalUserId);
  }
}

function extractDiditDocumentNumber(payload: DiditWebhookPayload): string | undefined {
  const decision = payload.decision ?? payload;
  const idChecks = decision?.id_verifications;
  if (!Array.isArray(idChecks)) return undefined;
  for (const item of idChecks) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const value = record.document_number ?? record.personal_number;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

async function updateLatestDiditPendingAttempts(
  app: FastifyInstance,
  payload: DiditWebhookPayload,
  externalUserId: string,
) {
  const currentUser = await app.prisma.user.findUnique({
    where: { id: externalUserId },
    select: { kycTargetLevel: true },
  });
  const targetLevel = parseKycVerificationLevel(currentUser?.kycTargetLevel) ?? 2;
  await app.prisma.kycAttempt.updateMany({
    where: { userId: externalUserId, targetLevel, provider: "didit", status: "pending" },
    data: {
      providerApplicantId: payload.session_id ?? undefined,
      providerSteps: redactDiditPayload(payload),
      rawWebhookEventId: payload.event_id ?? null,
    },
  });
}

async function handleDiditApproved(
  app: FastifyInstance,
  payload: DiditWebhookPayload,
  externalUserId: string,
) {
  let docHash: string | undefined;
  const docNumber = extractDiditDocumentNumber(payload);
  if (docNumber) {
    docHash = docFingerprint(docNumber);
  }

  const shouldRecalc = await app.prisma.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({
      where: { id: externalUserId },
      select: { kycLevel: true, kycTargetLevel: true, sumsubApplicantId: true },
    });
    const targetLevel = parseKycVerificationLevel(currentUser?.kycTargetLevel) ?? 2;
    if (docHash) {
      const existing = await tx.user.findFirst({
        where: { docHash, NOT: { id: externalUserId } },
        select: { id: true },
      });
      if (existing) {
        await tx.user.update({
          where: { id: externalUserId },
          data: { kycStatus: "rejected_duplicate", kycProvider: "didit", kycTargetLevel: null },
        });
        await tx.kycAttempt.updateMany({
          where: { userId: externalUserId, targetLevel, provider: "didit", status: "pending" },
          data: {
            status: "rejected",
            failureCode: "DUPLICATE_DOCUMENT",
            failureReason: "This document is already used by another account",
            providerSteps: redactDiditPayload(payload.decision ?? payload),
            rawWebhookEventId: payload.event_id ?? null,
            reviewedAt: new Date(),
          },
        });
        return false;
      }
    }
    const prerequisiteError = await validateKycTargetPrerequisites(
      tx as unknown as PrismaLike,
      externalUserId,
      targetLevel,
      currentUser?.kycLevel ?? 0
    );
    if (prerequisiteError) {
      await tx.user.update({
        where: { id: externalUserId },
        data: {
          kycStatus: "rejected",
          kycTargetLevel: null,
        },
      });
      await tx.kycAttempt.updateMany({
        where: { userId: externalUserId, targetLevel, provider: "didit", status: "pending" },
        data: {
          status: "rejected",
          successfulCampaignsCountAtReview: prerequisiteError.successfulCampaigns,
          failureCode: prerequisiteError.code,
          failureReason: prerequisiteError.error,
          rawWebhookEventId: payload.event_id ?? null,
          reviewedAt: new Date(),
        },
      });
      return false;
    }

    const successfulCampaignsAtReview = targetLevel === 4
      ? await countSuccessfulCampaigns(tx as unknown as PrismaLike, externalUserId)
      : undefined;
    const stepValidation = targetLevel === 4
      ? validateKyc4ProviderSteps(payload.decision ?? {})
      : { valid: true, requiredSteps: undefined, missingSteps: [] };

    await tx.kycAttempt.updateMany({
      where: { userId: externalUserId, targetLevel, provider: "didit", status: "pending" },
      data: {
        providerApplicantId: payload.session_id ?? currentUser?.sumsubApplicantId ?? null,
        providerSteps: redactDiditPayload(payload.decision ?? payload),
        requiredSteps: stepValidation.requiredSteps,
        successfulCampaignsCountAtReview: successfulCampaignsAtReview,
        status: stepValidation.valid ? "approved" : "pending",
        failureCode: stepValidation.valid ? null : "KYC4_PROVIDER_STEPS_INCOMPLETE",
        failureReason: stepValidation.valid
          ? null
          : `Provider steps incomplete: ${stepValidation.missingSteps.join(", ")}`,
        rawWebhookEventId: payload.event_id ?? null,
        reviewedAt: stepValidation.valid ? new Date() : null,
      },
    });

    if (!stepValidation.valid) {
      await tx.user.update({
        where: { id: externalUserId },
        data: {
          kycStatus: "pending",
          kycProvider: "didit",
          kycTargetLevel: 4,
        },
      });
      return false;
    }

    const nextLevel = Math.max(currentUser?.kycLevel ?? 0, targetLevel);
    await tx.user.update({
      where: { id: externalUserId },
      data: {
        kycStatus: "approved",
        kycLevel: nextLevel,
        kycProvider: "didit",
        kycVerifiedAt: new Date(),
        kycTargetLevel: null,
        ...(docHash ? { docHash, docHashAlgo: DOC_HASH_ALGO } : {}),
      },
    });
    return nextLevel !== (currentUser?.kycLevel ?? 0);
  });
  if (shouldRecalc) {
    await recalcUserTrustScore(app.prisma, externalUserId);
  }
}

async function handleDiditRejected(
  app: FastifyInstance,
  payload: DiditWebhookPayload,
  externalUserId: string,
) {
  const currentUser = await app.prisma.user.findUnique({
    where: { id: externalUserId },
    select: { kycTargetLevel: true },
  });
  const targetLevel = parseKycVerificationLevel(currentUser?.kycTargetLevel) ?? 2;
  await app.prisma.user.update({
    where: { id: externalUserId },
    data: { kycStatus: "rejected", kycProvider: "didit", kycTargetLevel: null },
  });
  await app.prisma.kycAttempt.updateMany({
    where: { userId: externalUserId, targetLevel, provider: "didit", status: "pending" },
    data: {
      status: "rejected",
      failureCode: `DIDIT_${String(payload.status ?? "DECLINED").toUpperCase().replace(/\s+/g, "_")}`,
      failureReason: "Didit rejected verification session",
      providerSteps: redactDiditPayload(payload.decision ?? payload),
      rawWebhookEventId: payload.event_id ?? null,
      reviewedAt: new Date(),
    },
  });
}

async function handleKyc4ProviderSteps(
  app: FastifyInstance,
  tx: PrismaLike,
  input: { externalUserId: string; providerApplicantId: string | null },
): Promise<"approved" | "pending"> {
  if (!input.providerApplicantId) {
    await tx.kycAttempt.updateMany({
      where: { userId: input.externalUserId, targetLevel: 4, status: "pending" },
      data: {
        status: "pending",
        failureCode: "KYC4_APPLICANT_ID_MISSING",
        failureReason: "Sumsub webhook did not include applicantId and user has no stored applicant",
      },
    });
    return "pending";
  }

  let providerStepsPayload: unknown;
  try {
    providerStepsPayload = await app.sumsub.getVerificationSteps(input.providerApplicantId);
  } catch (error) {
    await tx.kycAttempt.updateMany({
      where: { userId: input.externalUserId, targetLevel: 4, status: "pending" },
      data: {
        providerApplicantId: input.providerApplicantId,
        status: "pending",
        failureCode: "KYC4_PROVIDER_STEPS_UNAVAILABLE",
        failureReason: error instanceof Error ? error.message : "Cannot load Sumsub verification steps",
      },
    });
    await tx.user.update({
      where: { id: input.externalUserId },
      data: {
        kycStatus: "pending",
        kycProvider: "sumsub",
        kycTargetLevel: 4,
      },
    });
    return "pending";
  }

  const stepValidation = validateKyc4ProviderSteps(providerStepsPayload);
  const successfulCampaignsAtReview = await countSuccessfulCampaigns(tx, input.externalUserId);
  await tx.kycAttempt.updateMany({
    where: { userId: input.externalUserId, targetLevel: 4, status: "pending" },
    data: {
      providerApplicantId: input.providerApplicantId,
      providerSteps: providerStepsPayload as object,
      requiredSteps: stepValidation.requiredSteps,
      successfulCampaignsCountAtReview: successfulCampaignsAtReview,
      status: stepValidation.valid ? "approved" : "pending",
      failureCode: stepValidation.valid ? null : "KYC4_PROVIDER_STEPS_INCOMPLETE",
      failureReason: stepValidation.valid
        ? null
        : `Provider steps incomplete: ${stepValidation.missingSteps.join(", ")}`,
      reviewedAt: stepValidation.valid ? new Date() : null,
    },
  });

  if (!stepValidation.valid) {
    await tx.user.update({
      where: { id: input.externalUserId },
      data: {
        kycStatus: "pending",
        kycProvider: "sumsub",
        kycTargetLevel: 4,
      },
    });
    return "pending";
  }

  return "approved";
}

async function handleRedReview(
  app: FastifyInstance,
  payload: SumsubWebhookPayload,
  externalUserId: string,
) {
  const currentUser = await app.prisma.user.findUnique({
    where: { id: externalUserId },
    select: { kycTargetLevel: true },
  });
  const targetLevel = parseKycVerificationLevel(currentUser?.kycTargetLevel) ?? 2;
  await app.prisma.user.update({
    where: { id: externalUserId },
    data: { kycStatus: "rejected", kycTargetLevel: null },
  });
  await app.prisma.kycAttempt.updateMany({
    where: { userId: externalUserId, targetLevel, status: "pending" },
    data: {
      status: "rejected",
      failureCode: "SUMSUB_RED",
      failureReason: payload.moderationComment ?? "Sumsub rejected applicant",
      reviewedAt: new Date(),
    },
  });
}
