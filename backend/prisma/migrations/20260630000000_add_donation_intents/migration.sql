CREATE TABLE "donation_intents" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "donor_id" UUID,
    "donor_tg_user_id" BIGINT,
    "donor_address" VARCHAR(70) NOT NULL,
    "amount_token" DECIMAL(36,9) NOT NULL,
    "token" VARCHAR(10) NOT NULL,
    "donor_name" VARCHAR(100),
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "matched_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_intents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "donation_intents"
ADD CONSTRAINT "donation_intents_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "donation_intents"
ADD CONSTRAINT "donation_intents_donor_id_fkey"
FOREIGN KEY ("donor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_donation_intents_match"
ON "donation_intents"("campaign_id", "donor_address", "token", "matched_at");

CREATE INDEX "idx_donation_intents_expires"
ON "donation_intents"("expires_at");
