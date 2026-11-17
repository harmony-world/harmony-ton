ALTER TABLE "campaigns" ADD COLUMN "onchain_drift_at" TIMESTAMPTZ(6);
ALTER TABLE "campaigns" ADD COLUMN "onchain_drift_detail" JSONB;
