ALTER TABLE "campaigns" ADD COLUMN     "channel_autopost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channel_bot_is_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channel_username" VARCHAR(50),
ADD COLUMN     "organizer_type" VARCHAR(30) NOT NULL DEFAULT 'personal';

CREATE TABLE "channel_bindings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "channel_username" VARCHAR(50),
    "channel_name" VARCHAR(255),
    "channel_subscribers" INTEGER,
    "user_role" VARCHAR(20) NOT NULL,
    "bot_is_admin" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_check_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "channel_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channel_autoposts" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "message_id" BIGINT,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_autoposts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_channel_bindings_channel" ON "channel_bindings"("channel_id");

CREATE UNIQUE INDEX "channel_bindings_user_id_channel_id_key" ON "channel_bindings"("user_id", "channel_id");

CREATE INDEX "idx_autoposts_campaign" ON "channel_autoposts"("campaign_id", "posted_at");

CREATE INDEX "idx_autoposts_channel" ON "channel_autoposts"("channel_id", "posted_at");

ALTER TABLE "channel_bindings" ADD CONSTRAINT "channel_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "channel_autoposts" ADD CONSTRAINT "channel_autoposts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
