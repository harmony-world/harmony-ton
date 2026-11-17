ALTER TABLE "campaigns"
ADD COLUMN "deploy_status" VARCHAR(30) NOT NULL DEFAULT 'not_started',
ADD COLUMN "deploy_error" TEXT,
ADD COLUMN "deploy_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_deploy_attempt_at" TIMESTAMPTZ(6),
ADD COLUMN "deployed_at" TIMESTAMPTZ(6);

UPDATE "campaigns"
SET
    "deploy_status" = CASE
        WHEN "onchain_address" IS NOT NULL THEN 'deployed'
        ELSE 'not_started'
    END,
    "deployed_at" = CASE
        WHEN "onchain_address" IS NOT NULL THEN COALESCE("approved_at", "created_at")
        ELSE NULL
    END;

CREATE INDEX "idx_campaigns_deploy_status" ON "campaigns"("deploy_status");
