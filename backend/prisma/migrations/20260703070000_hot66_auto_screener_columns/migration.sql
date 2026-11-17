ALTER TABLE "campaign_moderation_events"
  ADD COLUMN "actor" VARCHAR(30) NOT NULL DEFAULT 'human_moderator',
  ADD COLUMN "reason_codes" JSONB,
  ADD COLUMN "screener_version" VARCHAR(30),
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "moderator_feedback" VARCHAR(30),
  ADD COLUMN "moderator_feedback_at" TIMESTAMPTZ(6),
  ALTER COLUMN "moderator_tg_user_id" DROP NOT NULL;

CREATE INDEX "idx_campaign_moderation_events_actor" ON "campaign_moderation_events"("actor");
