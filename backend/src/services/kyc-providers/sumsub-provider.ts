import { getKycLevelDefinition } from "../../constants/kyc-levels.js";
import type { SumsubClient } from "../../plugins/sumsub.js";
import type { KycProviderClient } from "./types.js";

export function createSumsubProvider(client: SumsubClient): KycProviderClient {
  return {
    provider: "sumsub",
    async createVerificationSession({ userId, targetLevel }) {
      const target = getKycLevelDefinition(targetLevel);
      if (!target.availableInSumsub || !target.sumsubLevelName) {
        throw new Error(`KYC ${targetLevel} is not available via Sumsub`);
      }
      const applicant = await client.createApplicant(userId, target.sumsubLevelName);
      const { token } = await client.getAccessToken(userId, target.sumsubLevelName);
      return {
        provider: "sumsub",
        applicantId: applicant.id,
        accessToken: token,
        providerLevelName: target.sumsubLevelName,
        raw: { applicantId: applicant.id },
      };
    },
    getVerificationSteps: (providerApplicantId) => client.getVerificationSteps(providerApplicantId),
  };
}
