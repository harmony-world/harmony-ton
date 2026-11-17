CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tg_user_id" BIGINT NOT NULL,
    "tg_username" VARCHAR(50),
    "tg_first_name" VARCHAR(100),
    "tg_photo_url" VARCHAR(500),
    "tg_is_premium" BOOLEAN NOT NULL DEFAULT false,
    "tg_account_age" TIMESTAMPTZ(6),
    "wallet_address" VARCHAR(70),
    "wallet_friendly" VARCHAR(70),
    "wallet_connected" BOOLEAN NOT NULL DEFAULT false,
    "role" VARCHAR(20) NOT NULL DEFAULT 'donor',
    "kyc_level" SMALLINT NOT NULL DEFAULT 0,
    "donor_status" VARCHAR(30) DEFAULT 'none',
    "total_donated_usd" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "donation_count" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "emoji_status_enabled" BOOLEAN NOT NULL DEFAULT false,
    "emoji_status_emoji_id" VARCHAR(50),
    "emoji_status_granted_at" TIMESTAMPTZ(6),
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "onchain_address" VARCHAR(70),
    "creator_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "story" TEXT NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending_moderation',
    "goal_amount_usd" DECIMAL(15,2) NOT NULL,
    "goal_amount_token" DECIMAL(36,9) NOT NULL,
    "goal_token" VARCHAR(10) NOT NULL DEFAULT 'USDT',
    "raised_amount_usd" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "raised_amount_token" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "trust_score" SMALLINT NOT NULL DEFAULT 0,
    "deadline" TIMESTAMPTZ(6) NOT NULL,
    "payout_address" VARCHAR(70) NOT NULL,
    "donor_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channel_id" BIGINT,
    "channel_name" VARCHAR(255),
    "channel_subscribers" INTEGER,
    "beneficiary_city" VARCHAR(100),
    "beneficiary_region" VARCHAR(100),
    "moderated_by" UUID,
    "moderation_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "search_vector" tsvector,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "donor_id" UUID,
    "donor_tg_user_id" BIGINT,
    "donor_address" VARCHAR(70) NOT NULL,
    "amount_token" DECIMAL(36,9) NOT NULL,
    "amount_usd" DECIMAL(15,2) NOT NULL,
    "tip_amount_token" DECIMAL(36,9) NOT NULL DEFAULT 0,
    "tip_amount_usd" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "token" VARCHAR(10) NOT NULL,
    "tx_hash" VARCHAR(70) NOT NULL,
    "lt" BIGINT NOT NULL,
    "block_seqno" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    "nft_address" VARCHAR(70),
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "message" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "amount_token" DECIMAL(36,9) NOT NULL,
    "amount_usd" DECIMAL(15,2) NOT NULL,
    "token" VARCHAR(10) NOT NULL,
    "destination_addr" VARCHAR(70) NOT NULL,
    "tx_hash" VARCHAR(70),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "campaign_id" UUID,
    "user_id" UUID,
    "moderator_id" UUID NOT NULL,
    "action_type" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onchain_events" (
    "id" BIGSERIAL NOT NULL,
    "contract_addr" VARCHAR(70) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "tx_hash" VARCHAR(70) NOT NULL,
    "lt" BIGINT NOT NULL,
    "block_seqno" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "ingested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onchain_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_tg_user_id_key" ON "users"("tg_user_id");

CREATE INDEX "idx_users_tg_id" ON "users"("tg_user_id");

CREATE INDEX "idx_users_wallet" ON "users"("wallet_address") WHERE wallet_address IS NOT NULL;

CREATE UNIQUE INDEX "campaigns_onchain_address_key" ON "campaigns"("onchain_address");

CREATE INDEX "idx_campaigns_status" ON "campaigns"("status");

CREATE INDEX "idx_campaigns_creator" ON "campaigns"("creator_id");

CREATE INDEX "idx_campaigns_channel" ON "campaigns"("channel_id") WHERE channel_id IS NOT NULL;

CREATE INDEX "idx_campaigns_search" ON "campaigns" USING GIN ("search_vector");

CREATE INDEX "idx_donations_campaign" ON "donations"("campaign_id", "status");

CREATE INDEX "idx_donations_donor" ON "donations"("donor_address");

CREATE INDEX "idx_donations_donor_tg" ON "donations"("donor_tg_user_id");

CREATE UNIQUE INDEX "donations_tx_hash_lt_key" ON "donations"("tx_hash", "lt");

CREATE INDEX "idx_withdrawals_campaign" ON "withdrawals"("campaign_id");

CREATE INDEX "idx_mod_campaign" ON "moderation_actions"("campaign_id");

CREATE INDEX "idx_reports_campaign" ON "reports"("campaign_id", "status");

CREATE INDEX "idx_events_contract" ON "onchain_events"("contract_addr", "event_type");

CREATE UNIQUE INDEX "onchain_events_tx_hash_lt_key" ON "onchain_events"("tx_hash", "lt");

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reports" ADD CONSTRAINT "reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
