import type { FastifyInstance } from "fastify";

export interface SumsubWebhookPayload {
  type: string;
  applicantId?: string;
  externalUserId?: string;
  reviewStatus?: string;
  reviewResult?: { reviewAnswer?: string; reviewRejectType?: string };
  moderationComment?: string;
  info?: { idDocs?: Array<{ number?: string }> };
}

export interface DiditWebhookPayload {
  event_id?: string;
  webhook_type?: string;
  session_id?: string;
  status?: string;
  vendor_data?: string;
  decision?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  id_verifications?: unknown;
  [key: string]: unknown;
}

export type KycStatus =
  | "not_started"
  | "pending"
  | "approved"
  | "rejected"
  | "rejected_duplicate";

export type MockKycResult = "approved" | "rejected_retry" | "rejected_final";

export interface KycUserState {
  kycStatus: string;
  kycLevel: number;
  kycProvider: string | null;
  kycVerifiedAt: Date | null;
  kycTargetLevel?: number | null;
  sumsubApplicantId?: string | null;
}

export interface Kyc4Eligibility {
  eligible: boolean;
  requiredSuccessfulCampaigns: number;
  successfulCampaigns: number;
  blockingReasons: string[];
}

export type PrismaLike = Pick<FastifyInstance["prisma"], "campaign" | "user" | "kycAttempt">;
