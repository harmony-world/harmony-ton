import type { KycVerificationLevel } from "../../constants/kyc-levels.js";

export type KycProviderName = "sumsub" | "didit" | "mock";

export interface KycProviderSession {
  provider: KycProviderName;
  applicantId: string;
  accessToken: string;
  verificationUrl?: string;
  providerLevelName: string;
  raw: unknown;
}

export interface KycProviderClient {
  provider: KycProviderName;
  createVerificationSession(input: {
    userId: string;
    targetLevel: KycVerificationLevel;
    language?: string;
  }): Promise<KycProviderSession>;
  getVerificationSteps?(providerApplicantId: string): Promise<unknown>;
}
