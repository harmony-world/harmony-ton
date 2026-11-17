import type { KycVerificationLevel } from "../../constants/kyc-levels.js";
import { getToggle } from "../admin/runtime-toggles.js";
import type { MockKycResult } from "./types.js";

export function isMockKycEnabled(appHasSumsub: boolean): boolean {
  if (process.env.TON_NETWORK === "mainnet") return false;

  const runtimeEnabled = getToggle("kyc_mock_enabled");
  const runtimeProductionOverride = getToggle("kyc_mock_allow_production");
  const mockEnabled = typeof runtimeEnabled === "boolean"
    ? runtimeEnabled
    : process.env.KYC_MOCK_ENABLED === "true"
      ? true
      : process.env.KYC_MOCK_ENABLED === "false"
        ? false
        : undefined;
  const productionOverride = typeof runtimeProductionOverride === "boolean"
    ? runtimeProductionOverride
    : process.env.KYC_MOCK_ALLOW_PRODUCTION === "true";

  if (process.env.NODE_ENV === "production" && !productionOverride) return false;
  if (mockEnabled !== undefined) return mockEnabled;
  return !appHasSumsub;
}

export function mockUpdateForResult(result: MockKycResult, currentLevel: number, targetLevel: KycVerificationLevel) {
  if (result === "approved") {
    return {
      kycStatus: "approved",
      kycLevel: Math.max(currentLevel, targetLevel),
      kycProvider: "mock",
      kycVerifiedAt: new Date(),
      kycTargetLevel: null,
    };
  }

  return {
    kycStatus: "rejected",
    kycLevel: currentLevel,
    kycProvider: "mock",
    kycTargetLevel: null,
  };
}
