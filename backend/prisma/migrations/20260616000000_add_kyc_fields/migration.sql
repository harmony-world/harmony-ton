ALTER TABLE "users" ADD COLUMN "kyc_provider" VARCHAR(30),
ADD COLUMN "kyc_verified_at" TIMESTAMPTZ(6),
ADD COLUMN "sumsub_applicant_id" VARCHAR(100),
ADD COLUMN "doc_hash" VARCHAR(64),
ADD COLUMN "doc_hash_algo" VARCHAR(20);

CREATE UNIQUE INDEX "users_doc_hash_key" ON "users"("doc_hash");
