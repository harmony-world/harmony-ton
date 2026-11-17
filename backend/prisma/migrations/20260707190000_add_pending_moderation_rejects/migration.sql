CREATE TABLE "pending_moderation_rejects" (
    "moderator_tg_id" BIGINT NOT NULL,
    "campaign_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pending_moderation_rejects_pkey" PRIMARY KEY ("moderator_tg_id")
);
