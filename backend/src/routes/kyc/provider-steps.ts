interface ProviderStep {
  key: string;
  status: string;
  reviewAnswer?: string;
}

const KYC4_DEFAULT_REQUIRED_STEPS = ["IDENTITY", "SELFIE", "PROOF_OF_RESIDENCE", "SELFIE2"];
const KYC4_STEP_ALIASES: Record<string, string[]> = {
  IDENTITY: ["IDENTITY", "OCR", "ID_DOC", "ID_DOCUMENT", "ID_VERIFICATION", "ID_VERIFICATIONS", "IDENTITY_VERIFICATION", "DOCUMENT", "PASSPORT"],
  SELFIE: ["SELFIE", "LIVENESS", "LIVENESS_CHECK", "LIVENESS_CHECKS", "FACE_MATCH", "FACE_MATCHES", "SELFIE_LIVENESS"],
  PROOF_OF_RESIDENCE: ["PROOF_OF_RESIDENCE", "PROOF_OF_ADDRESS", "POA", "POA_VERIFICATION", "POA_VERIFICATIONS", "ADDRESS", "RESIDENCE"],
  SELFIE2: ["SELFIE2", "SECOND_SELFIE", "VIDEO", "VIDEO_IDENTIFICATION", "QUESTIONNAIRE_VIDEO"],
  AML: ["AML", "AML_SCREENING", "AML_SCREENINGS", "SCREENING", "WATCHLIST", "SANCTIONS"],
};

export function getKyc4RequiredSteps(): string[] {
  const raw = process.env.KYC4_REQUIRED_SUMSUB_STEPS;
  if (!raw) return KYC4_DEFAULT_REQUIRED_STEPS;
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeProviderSteps(input: unknown): ProviderStep[] {
  if (!input || typeof input !== "object") return [];
  const steps: ProviderStep[] = [];

  const walk = (value: unknown, fallbackKey?: string) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, fallbackKey);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const key = String(
      record.idDocType ??
      record.step ??
      record.node_id ??
      record.name ??
      record.type ??
      record.idDocSetType ??
      fallbackKey ??
      ""
    ).toUpperCase();
    const status = String(
      record.reviewStatus ??
      record.status ??
      record.imageReviewResult ??
      record.videoReviewResult ??
      record.reviewResult ??
      ""
    ).toUpperCase();
    const answerValue = record.reviewAnswer ?? (record.reviewResult as { reviewAnswer?: unknown } | undefined)?.reviewAnswer;
    const reviewAnswer = answerValue ? String(answerValue).toUpperCase() : undefined;

    if (key || status || reviewAnswer) {
      steps.push({ key, status, reviewAnswer });
    }

    for (const [childKey, childValue] of Object.entries(record)) {
      if (childValue && typeof childValue === "object") walk(childValue, childKey);
    }
  };

  walk(input);
  return steps;
}

function isCompletedProviderStep(step: ProviderStep): boolean {
  return ["GREEN", "APPROVED", "COMPLETED", "VALID", "SUCCESS"].includes(step.status) ||
    ["GREEN", "APPROVED"].includes(step.reviewAnswer ?? "");
}

export function validateKyc4ProviderSteps(providerStepsPayload: unknown) {
  const requiredSteps = getKyc4RequiredSteps();
  const providerSteps = normalizeProviderSteps(providerStepsPayload);
  const missingSteps = requiredSteps.filter((required) => {
    const aliases = KYC4_STEP_ALIASES[required] ?? [required];
    return !providerSteps.some((step) =>
      aliases.some((alias) => step.key === alias) && isCompletedProviderStep(step)
    );
  });

  return {
    valid: missingSteps.length === 0,
    requiredSteps,
    providerSteps,
    missingSteps,
  };
}
