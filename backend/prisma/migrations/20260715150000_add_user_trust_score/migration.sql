ALTER TABLE "users" ADD COLUMN "trust_score" SMALLINT NOT NULL DEFAULT 50;

UPDATE "users" u
SET "trust_score" = GREATEST(
  0,
  50
  + COALESCE(
    (
      SELECT SUM(er."rating_delta")
      FROM "expense_reports" er
      JOIN "campaigns" c ON c."id" = er."campaign_id"
      WHERE c."creator_id" = u."id"
        AND er."rating_delta" != 0
    ),
    0
  )
  + COALESCE(
    (
      SELECT COUNT(*) * 10
      FROM "campaigns" c
      WHERE c."creator_id" = u."id"
        AND c."organizer_type" = 'telegram_channel'
        AND c."channel_subscribers" >= 1000
        AND c."approved_at" IS NOT NULL
    ),
    0
  )
  + GREATEST(0, u."kyc_level" - 2) * 5
  + CASE WHEN u."tg_is_premium" THEN 5 ELSE 0 END
)::SMALLINT;

UPDATE "campaigns" c
SET "trust_score" = u."trust_score"
FROM "users" u
WHERE u."id" = c."creator_id";
