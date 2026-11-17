import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  campaignGoalMaxUsdFor,
  getKycLevelDefinition,
  getKycMaxVisibleLevel,
  isKycLevelVisible,
  parseKycVerificationLevel,
  type KycVerificationLevel,
} from "../constants/kyc-levels.js";
import { getKyc4RequiredSteps } from "./kyc/provider-steps.js";
import {
  buildKycStatusResponse,
  countSuccessfulCampaigns,
  getKyc4Eligibility,
  validateKycTargetPrerequisites,
} from "./kyc/status.js";
import { isMockKycEnabled, mockUpdateForResult } from "./kyc/mock.js";
import type { DiditWebhookPayload, MockKycResult } from "./kyc/types.js";
import { applyDiditDecision, handleDiditWebhook, handleSumsubWebhook } from "./kyc/webhook.js";
import { recalcUserTrustScore } from "../services/trust-score.js";
import { redactDiditPayload } from "../services/kyc-privacy.js";
import {
  getConfiguredKycProviderName,
  getDiditEnabledKycLevels,
  isDiditKycLevelEnabled,
  resolveKycProvider,
} from "../services/kyc-providers/index.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

function hiddenKycLevelError(targetLevel: KycVerificationLevel) {
  if (isKycLevelVisible(targetLevel)) return null;
  return {
    error: "KYC level is not available",
    message: `KYC ${targetLevel} is not available on this deployment`,
    code: "KYC_LEVEL_NOT_AVAILABLE",
    targetLevel,
    maxAvailableLevel: getKycMaxVisibleLevel(),
  };
}

export const kycRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    req.rawBody = body as string;
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      (err as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  async function getDiditPendingAction(
    userId: string,
    targetLevel: KycVerificationLevel,
  ): Promise<{ type: "resume"; provider: "didit"; targetLevel: KycVerificationLevel; verificationUrl: string } | null> {
    const attempt = await app.prisma.kycAttempt.findFirst({
      where: { userId, targetLevel, provider: "didit", status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { providerSteps: true },
    });
    const providerSteps = attempt?.providerSteps;
    if (!providerSteps || typeof providerSteps !== "object" || Array.isArray(providerSteps)) return null;

    const status = typeof providerSteps.status === "string" ? providerSteps.status.toLowerCase() : "";
    const verificationUrl = typeof providerSteps.url === "string"
      ? providerSteps.url
      : typeof providerSteps.session_url === "string"
        ? providerSteps.session_url
        : null;
    if (status !== "not started" || !verificationUrl) return null;

    return { type: "resume", provider: "didit", targetLevel, verificationUrl };
  }

  async function reconcilePendingDiditSession(user: {
    kycStatus: string;
    kycProvider: string | null;
    sumsubApplicantId?: string | null;
  } | null, userId: string) {
    if (user?.kycStatus !== "pending" || user.kycProvider !== "didit" || !user.sumsubApplicantId) return;
    const provider = resolveKycProvider(app);
    if (provider?.provider !== "didit" || !provider.getVerificationSteps) return;

    try {
      const decision = await provider.getVerificationSteps(user.sumsubApplicantId);
      if (!decision || typeof decision !== "object" || Array.isArray(decision)) return;
      await applyDiditDecision(app, decision as DiditWebhookPayload, userId);
    } catch (error) {
      app.log.warn({ err: error, providerApplicantId: user.sumsubApplicantId }, "Didit decision reconcile failed");
    }
  }

  async function createMockKycSession(
    userId: string,
    currentLevel: number,
    requestedLevel: KycVerificationLevel,
  ) {
    const applicantId = `mock-${userId}`;
    const dbUser = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { kycLevel: true },
    });
    await app.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: "pending",
        kycLevel: dbUser?.kycLevel ?? currentLevel,
        kycProvider: "mock",
        kycTargetLevel: requestedLevel,
        sumsubApplicantId: applicantId,
      },
    });
    await app.prisma.kycAttempt.create({
      data: {
        userId,
        targetLevel: requestedLevel,
        provider: "mock",
        providerApplicantId: applicantId,
        providerLevelName: "mock",
        status: "pending",
        requiredSteps: requestedLevel === 4 ? getKyc4RequiredSteps() : undefined,
        successfulCampaignsCountAtStart: requestedLevel === 4
          ? await countSuccessfulCampaigns(app.prisma, userId)
          : undefined,
      },
    });
    return {
      accessToken: "mock",
      token: "mock",
      applicantId,
      provider: "mock",
      mock: true,
      targetLevel: requestedLevel,
      target: getKycLevelDefinition(requestedLevel),
    };
  }

  app.get("/kyc/status", async (request, reply) => {
    let user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        kycStatus: true,
        kycLevel: true,
        kycProvider: true,
        kycTargetLevel: true,
        kycVerifiedAt: true,
        sumsubApplicantId: true,
      },
    });
    await reconcilePendingDiditSession(user, request.user.id);
    user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        kycStatus: true,
        kycLevel: true,
        kycProvider: true,
        kycTargetLevel: true,
        kycVerifiedAt: true,
        sumsubApplicantId: true,
      },
    });
    const kyc4Eligibility = await getKyc4Eligibility(app.prisma, request.user.id, user?.kycLevel ?? 0, request.locale);
    const provider = getConfiguredKycProviderName();
    const pendingTargetLevel = parseKycVerificationLevel(user?.kycTargetLevel) ?? 2;
    const pendingAction = user?.kycStatus === "pending" && user.kycProvider === "didit"
      ? await getDiditPendingAction(request.user.id, pendingTargetLevel)
      : null;
    const goalMaxUsd = campaignGoalMaxUsdFor(user?.kycLevel ?? 0, request.user.role);
    return reply.send({
      ...buildKycStatusResponse(user, kyc4Eligibility, request.locale),
      campaignGoalMaxUsd: Number.isFinite(goalMaxUsd) ? goalMaxUsd : null,
      providerCapabilities: {
        provider,
        enabledLevels: (provider === "didit" ? getDiditEnabledKycLevels() : [2, 3, 4]).filter(
          isKycLevelVisible,
        ),
      },
      pendingAction,
    });
  });

  const handleKycSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const body = request.body as { targetLevel?: unknown } | undefined;
    const requestedLevel = parseKycVerificationLevel(body?.targetLevel) ?? 2;
    const hiddenLevelError = hiddenKycLevelError(requestedLevel);
    if (hiddenLevelError) {
      return reply.code(403).send(hiddenLevelError);
    }
    const currentUser = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { kycLevel: true },
    });
    const currentLevel = currentUser?.kycLevel ?? 0;
    const prerequisiteError = await validateKycTargetPrerequisites(app.prisma, userId, requestedLevel, currentLevel, request.locale);
    if (prerequisiteError) {
      return reply.code(403).send(prerequisiteError);
    }

    const configuredProviderName = getConfiguredKycProviderName();
    if (configuredProviderName === "didit") {
      if (!isDiditKycLevelEnabled(requestedLevel)) {
        return reply.code(409).send({
          error: "KYC level is temporarily unavailable",
          message: "This KYC level is temporarily unavailable for the current provider",
          code: "KYC_LEVEL_UNAVAILABLE",
          provider: "didit",
          targetLevel: requestedLevel,
          enabledLevels: getDiditEnabledKycLevels(),
        });
      }

      const provider = resolveKycProvider(app);
      if (!provider) {
        request.log.error("Didit is selected but DIDIT_API_KEY is not configured");
        return reply.code(503).send({ error: "KYC provider is not configured" });
      }

      const session = await provider.createVerificationSession({
        userId,
        targetLevel: requestedLevel,
        language: request.locale,
      });
      const dbUser = await app.prisma.user.findUnique({
        where: { id: userId },
        select: { kycLevel: true },
      });
      await app.prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: "pending",
          kycLevel: dbUser?.kycLevel ?? currentLevel,
          kycProvider: "didit",
          kycTargetLevel: requestedLevel,
          sumsubApplicantId: session.applicantId,
        },
      });
      await app.prisma.kycAttempt.create({
        data: {
          userId,
          targetLevel: requestedLevel,
          provider: "didit",
          providerApplicantId: session.applicantId,
          providerLevelName: session.providerLevelName,
          status: "pending",
          requiredSteps: requestedLevel === 4 ? getKyc4RequiredSteps() : undefined,
          providerSteps: redactDiditPayload(session.raw),
          successfulCampaignsCountAtStart: requestedLevel === 4
            ? await countSuccessfulCampaigns(app.prisma, userId)
            : undefined,
        },
      });
      return reply.send({
        accessToken: session.accessToken,
        token: session.accessToken,
        applicantId: session.applicantId,
        verificationUrl: session.verificationUrl,
        provider: "didit",
        mock: false,
        targetLevel: requestedLevel,
        target: getKycLevelDefinition(requestedLevel),
      });
    }

    if (configuredProviderName === "mock") {
      if (!isMockKycEnabled(Boolean(app.sumsub))) {
        request.log.error("KYC_PROVIDER=mock is selected but KYC mock is disabled");
        return reply.code(503).send({ error: "KYC mock provider is disabled" });
      }

      return reply.send(await createMockKycSession(userId, currentLevel, requestedLevel));
    }

    if (!app.sumsub) {
      if (!isMockKycEnabled(false)) {
        request.log.error("Sumsub is not configured and KYC mock is disabled");
        return reply.code(503).send({ error: "KYC provider is not configured" });
      }

      return reply.send(await createMockKycSession(userId, currentLevel, requestedLevel));
    }

    const target = getKycLevelDefinition(requestedLevel);
    if (!target.availableInSumsub || !target.sumsubLevelName) {
      return reply.code(400).send({ error: `KYC ${requestedLevel} is not available via Sumsub` });
    }

    const dbUser = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { sumsubApplicantId: true, kycStatus: true, kycLevel: true },
    });

    let applicantId = dbUser?.sumsubApplicantId;

    if (!applicantId) {
      const applicant = await app.sumsub.createApplicant(userId, target.sumsubLevelName);
      applicantId = applicant.id;
      await app.prisma.user.update({
        where: { id: userId },
        data: {
          sumsubApplicantId: applicantId,
          kycStatus: "pending",
          kycProvider: "sumsub",
          kycTargetLevel: requestedLevel,
        },
      });
    } else if (dbUser?.kycStatus === "not_started" || dbUser?.kycStatus === "rejected") {
      await app.prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: "pending",
          kycLevel: dbUser.kycLevel,
          kycProvider: "sumsub",
          kycTargetLevel: requestedLevel,
        },
      });
    } else {
      await app.prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: "pending",
          kycLevel: dbUser?.kycLevel ?? 0,
          kycProvider: "sumsub",
          kycTargetLevel: requestedLevel,
        },
      });
    }

    await app.prisma.kycAttempt.create({
      data: {
        userId,
        targetLevel: requestedLevel,
        provider: "sumsub",
        providerApplicantId: applicantId,
        providerLevelName: target.sumsubLevelName,
        status: "pending",
        requiredSteps: requestedLevel === 4 ? getKyc4RequiredSteps() : undefined,
        successfulCampaignsCountAtStart: requestedLevel === 4
          ? await countSuccessfulCampaigns(app.prisma, userId)
          : undefined,
      },
    });

    const { token } = await app.sumsub.getAccessToken(userId, target.sumsubLevelName);
    return reply.send({
      accessToken: token,
      token,
      applicantId,
      provider: "sumsub",
      mock: false,
      targetLevel: requestedLevel,
      target,
    });
  };

  app.post("/kyc/session/retry", async (request, reply) => {
    const userId = request.user.id;
    const body = request.body as { targetLevel?: unknown } | undefined;
    const currentUser = await app.prisma.user.findUnique({
      where: { id: userId },
      select: {
        kycLevel: true,
        kycStatus: true,
        kycProvider: true,
        kycTargetLevel: true,
      },
    });
    const requestedLevel = parseKycVerificationLevel(body?.targetLevel)
      ?? parseKycVerificationLevel(currentUser?.kycTargetLevel)
      ?? 2;

    const hiddenLevelError = hiddenKycLevelError(requestedLevel);
    if (hiddenLevelError) {
      return reply.code(403).send(hiddenLevelError);
    }

    if (currentUser?.kycProvider !== "didit" || currentUser.kycStatus !== "pending") {
      return reply.code(409).send({
        error: "No retryable KYC session",
        code: "KYC_RETRY_NOT_AVAILABLE",
      });
    }

    const attempt = await app.prisma.kycAttempt.findFirst({
      where: { userId, targetLevel: requestedLevel, provider: "didit", status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!attempt) {
      return reply.code(409).send({
        error: "No retryable KYC session",
        code: "KYC_RETRY_NOT_AVAILABLE",
      });
    }

    await app.prisma.$transaction(async (tx) => {
      await tx.kycAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "rejected",
          failureCode: "USER_ABORTED_DIDIT_NOT_STARTED",
          failureReason: "User restarted an abandoned Didit session before submitting documents",
          reviewedAt: new Date(),
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          kycStatus: (currentUser.kycLevel ?? 0) > 0 ? "approved" : "not_started",
          kycTargetLevel: null,
          sumsubApplicantId: null,
        },
      });
    });

    return reply.send({
      ok: true,
      provider: "didit",
      targetLevel: requestedLevel,
    });
  });

  app.post("/kyc/sumsub/token", handleKycSession);
  app.post("/kyc/session", handleKycSession);

  app.post("/kyc/mock/complete", async (request, reply) => {
    if (!isMockKycEnabled(Boolean(app.sumsub))) {
      return reply.code(404).send({ error: "KYC mock is disabled" });
    }

    const body = request.body as { result?: MockKycResult; targetLevel?: unknown } | undefined;
    const result = body?.result;
    if (!result || !["approved", "rejected_retry", "rejected_final"].includes(result)) {
      return reply.code(400).send({ error: "Invalid mock KYC result" });
    }
    const targetLevel = parseKycVerificationLevel(body.targetLevel) ?? 2;
    const hiddenLevelError = hiddenKycLevelError(targetLevel);
    if (hiddenLevelError) {
      return reply.code(403).send(hiddenLevelError);
    }
    const currentUser = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { kycLevel: true },
    });
    const currentLevel = currentUser?.kycLevel ?? 0;
    const prerequisiteError = await validateKycTargetPrerequisites(app.prisma, request.user.id, targetLevel, currentLevel, request.locale);
    if (prerequisiteError) {
      return reply.code(403).send(prerequisiteError);
    }

    const updated = await app.prisma.user.update({
      where: { id: request.user.id },
      data: mockUpdateForResult(result, currentLevel, targetLevel),
    });
    await app.prisma.kycAttempt.updateMany({
      where: { userId: request.user.id, targetLevel, provider: "mock", status: "pending" },
      data: {
        status: result === "approved" ? "approved" : "rejected",
        reviewedAt: new Date(),
      },
    });
    if (updated.kycLevel !== currentLevel) {
      await recalcUserTrustScore(app.prisma, request.user.id);
    }

    return reply.send(buildKycStatusResponse(
      {
        kycStatus: updated.kycStatus,
        kycLevel: updated.kycLevel,
        kycProvider: updated.kycProvider,
        kycVerifiedAt: updated.kycVerifiedAt,
        sumsubApplicantId: updated.sumsubApplicantId,
      },
      undefined,
      request.locale,
    ));
  });

  app.post(
    "/kyc/sumsub/webhook",
    { config: { skipAuth: true } },
    (request, reply) => handleSumsubWebhook(app, request, reply)
  );
  app.post(
    "/kyc/didit/webhook",
    { config: { skipAuth: true } },
    (request, reply) => handleDiditWebhook(app, request, reply)
  );
};
