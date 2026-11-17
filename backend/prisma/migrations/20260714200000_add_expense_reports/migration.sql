CREATE TABLE "expense_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    "photos" TEXT[] NOT NULL DEFAULT '{}',
    "comment" VARCHAR(2000),
    "moderated_by" UUID,
    "moderation_note" TEXT,
    "rating_delta" SMALLINT NOT NULL DEFAULT 0,
    "revision" SMALLINT NOT NULL DEFAULT 1,
    "ai_detection_results" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "expense_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_reports_campaign_id_key" ON "expense_reports"("campaign_id");

CREATE INDEX "idx_expense_reports_creator" ON "expense_reports"("creator_id");

CREATE INDEX "idx_expense_reports_status" ON "expense_reports"("status");

ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
