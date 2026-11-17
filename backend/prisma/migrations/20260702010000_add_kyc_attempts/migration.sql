CREATE TABLE "kyc_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "target_level" SMALLINT NOT NULL,
  "provider" VARCHAR(30) NOT NULL,
  "provider_applicant_id" VARCHAR(100),
  "provider_level_name" VARCHAR(100),
  "status" VARCHAR(30) NOT NULL DEFAULT 'created',
  "required_steps" JSONB,
  "provider_steps" JSONB,
  "successful_campaigns_count_at_start" INTEGER,
  "successful_campaigns_count_at_review" INTEGER,
  "failure_code" VARCHAR(80),
  "failure_reason" TEXT,
  "raw_webhook_event_id" VARCHAR(120),
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_attempts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "kyc_attempts"
  ADD CONSTRAINT "kyc_attempts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_kyc_attempts_user_target_status"
  ON "kyc_attempts"("user_id", "target_level", "status");

CREATE INDEX "idx_kyc_attempts_provider_applicant"
  ON "kyc_attempts"("provider_applicant_id");
