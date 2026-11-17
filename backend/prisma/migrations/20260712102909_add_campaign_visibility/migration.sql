ALTER TABLE "campaigns"
ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "idx_campaigns_is_public" ON "campaigns"("is_public");
