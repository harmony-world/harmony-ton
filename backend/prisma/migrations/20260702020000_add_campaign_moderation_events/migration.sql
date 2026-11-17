CREATE TABLE "campaign_moderation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "creator_id" UUID,
  "creator_tg_user_id" BIGINT,
  "moderator_tg_user_id" BIGINT NOT NULL,
  "action_type" VARCHAR(30) NOT NULL,
  "reason" TEXT,
  "title" VARCHAR(100) NOT NULL,
  "category" VARCHAR(30) NOT NULL,
  "goal_amount_usd" DECIMAL(15, 2) NOT NULL,
  "campaign_created_at" TIMESTAMPTZ(6),
  "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "campaign_moderation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_campaign_moderation_events_campaign" ON "campaign_moderation_events"("campaign_id");
CREATE INDEX "idx_campaign_moderation_events_creator" ON "campaign_moderation_events"("creator_id");
CREATE INDEX "idx_campaign_moderation_events_moderator_tg" ON "campaign_moderation_events"("moderator_tg_user_id");

ALTER TABLE "campaign_moderation_events"
  ADD CONSTRAINT "campaign_moderation_events_creator_id_fkey"
  FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
