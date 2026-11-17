ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "admin_token_version" INTEGER NOT NULL DEFAULT 0;

UPDATE "users"
SET "role" = 'donor'
WHERE "role" = 'user';
