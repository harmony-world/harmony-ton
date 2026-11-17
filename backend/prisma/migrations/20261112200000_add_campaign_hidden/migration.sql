ALTER TABLE "campaigns" ADD COLUMN "hidden_at" TIMESTAMPTZ(6);
ALTER TABLE "campaigns" ADD COLUMN "hidden_by_id" UUID;
