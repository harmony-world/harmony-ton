import { getWebAppUrl } from "../../config/env.js";
import type { KycVerificationLevel } from "../../constants/kyc-levels.js";
import type { KycProviderClient } from "./types.js";

const DEFAULT_BASE_URL = "https://verification.didit.me";

interface DiditSessionResponse {
  session_id: string;
  session_token: string;
  url: string;
  status: string;
  workflow_id: string;
  workflow_version?: number;
}

function getDiditWorkflowId(targetLevel: KycVerificationLevel): string {
  const specific = process.env[`DIDIT_KYC${targetLevel}_WORKFLOW_ID`]?.trim();
  const fallback = process.env.DIDIT_WORKFLOW_ID?.trim();
  const workflowId = specific || fallback;
  if (!workflowId) {
    throw new Error(`Didit workflow is not configured for KYC ${targetLevel}`);
  }
  return workflowId;
}

function normalizeLanguage(language?: string): string {
  const value = language?.split("-")[0]?.toLowerCase();
  if (value === "ru" || value === "hi" || value === "en") return value;
  return "en";
}

function getDiditSandboxScenario(): string | undefined {
  const scenario = process.env.DIDIT_SANDBOX_SCENARIO?.trim();
  return scenario || undefined;
}

async function diditRequest(path: string, body: unknown): Promise<unknown> {
  const apiKey = process.env.DIDIT_API_KEY?.trim();
  if (!apiKey) throw new Error("DIDIT_API_KEY not set");

  const baseUrl = process.env.DIDIT_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "accept": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Didit API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function createDiditClient(): KycProviderClient {
  return {
    provider: "didit",
    async createVerificationSession({ userId, targetLevel, language }) {
      const workflowId = getDiditWorkflowId(targetLevel);
      const sandboxScenario = getDiditSandboxScenario();
      const callbackUrl = `${getWebAppUrl()}/#/kyc/level/${targetLevel}`;
      const data = await diditRequest("/v3/session/", {
        workflow_id: workflowId,
        vendor_data: userId,
        callback: callbackUrl,
        callback_method: "both",
        language: normalizeLanguage(language),
        ...(sandboxScenario ? { sandbox_scenario: sandboxScenario } : {}),
        metadata: {
          harmony_user_id: userId,
          target_level: targetLevel,
        },
      }) as DiditSessionResponse;

      return {
        provider: "didit",
        applicantId: data.session_id,
        accessToken: data.session_token,
        verificationUrl: data.url,
        providerLevelName: workflowId,
        raw: data,
      };
    },
    async getVerificationSteps(providerApplicantId) {
      const apiKey = process.env.DIDIT_API_KEY?.trim();
      if (!apiKey) throw new Error("DIDIT_API_KEY not set");
      const baseUrl = process.env.DIDIT_BASE_URL?.trim() || DEFAULT_BASE_URL;
      const res = await fetch(`${baseUrl}/v3/session/${encodeURIComponent(providerApplicantId)}/decision/`, {
        method: "GET",
        headers: {
          "accept": "application/json",
          "x-api-key": apiKey,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Didit decision API error ${res.status}: ${text}`);
      }
      return res.json();
    },
  };
}
