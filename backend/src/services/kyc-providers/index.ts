import type { FastifyInstance } from "fastify";
import { createDiditClient } from "./didit-provider.js";
import { createSumsubProvider } from "./sumsub-provider.js";
import type { KycProviderClient, KycProviderName } from "./types.js";
import { getToggle } from "../../routes/admin/runtime-toggles.js";
import type { KycVerificationLevel } from "../../constants/kyc-levels.js";

export function getConfiguredKycProviderName(): KycProviderName {
  const runtimeProvider = getToggle("kyc_provider");
  const value = (typeof runtimeProvider === "string" ? runtimeProvider : process.env.KYC_PROVIDER)?.trim().toLowerCase();
  if (value === "didit") return "didit";
  if (value === "mock" && process.env.TON_NETWORK !== "mainnet") return "mock";
  return "sumsub";
}

export function resolveKycProvider(app: FastifyInstance): KycProviderClient | null {
  const provider = getConfiguredKycProviderName();
  if (provider === "didit") {
    if (!process.env.DIDIT_API_KEY?.trim()) return null;
    return createDiditClient();
  }
  if (!app.sumsub) return null;
  return createSumsubProvider(app.sumsub);
}

export function getDiditEnabledKycLevels(): KycVerificationLevel[] {
  const configured = process.env.DIDIT_ENABLED_KYC_LEVELS?.trim();
  if (!configured) return [2, 3, 4];

  const levels = configured
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((level): level is KycVerificationLevel => level === 2 || level === 3 || level === 4);

  return Array.from(new Set(levels)).sort((a, b) => a - b);
}

export function isDiditKycLevelEnabled(level: KycVerificationLevel): boolean {
  return getDiditEnabledKycLevels().includes(level);
}
