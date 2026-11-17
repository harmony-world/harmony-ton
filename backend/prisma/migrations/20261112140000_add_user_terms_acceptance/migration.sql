ALTER TABLE "users" ADD COLUMN "terms_version" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMPTZ(6);
