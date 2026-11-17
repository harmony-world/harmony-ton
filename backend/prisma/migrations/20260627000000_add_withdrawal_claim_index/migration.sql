CREATE UNIQUE INDEX "withdrawals_tx_hash_key" ON "withdrawals"("tx_hash");

INSERT INTO "withdrawals" (
    "id",
    "campaign_id",
    "recipient_id",
    "amount_token",
    "amount_usd",
    "token",
    "destination_addr",
    "tx_hash",
    "status",
    "created_at",
    "confirmed_at"
)
SELECT
    (
        substr(md5(e."tx_hash"), 1, 8) || '-' ||
        substr(md5(e."tx_hash"), 9, 4) || '-' ||
        substr(md5(e."tx_hash"), 13, 4) || '-' ||
        substr(md5(e."tx_hash"), 17, 4) || '-' ||
        substr(md5(e."tx_hash"), 21, 12)
    )::uuid,
    c."id",
    COALESCE(u."id", c."creator_id"),
    c."raised_amount_token",
    c."raised_amount_usd",
    c."goal_token",
    c."payout_address",
    e."tx_hash",
    'confirmed',
    COALESCE(to_timestamp((e."payload"->>'timestamp')::double precision), e."ingested_at"),
    COALESCE(to_timestamp((e."payload"->>'timestamp')::double precision), e."ingested_at")
FROM "onchain_events" e
JOIN "campaigns" c ON c."onchain_address" = e."contract_addr"
LEFT JOIN LATERAL (
    SELECT "id"
    FROM "users"
    WHERE "wallet_address" = c."payout_address"
       OR "wallet_friendly" = c."payout_address"
    LIMIT 1
) u ON true
WHERE e."event_type" = 'CLAIM'
  AND e."tx_hash" IS NOT NULL
ON CONFLICT ("tx_hash") DO UPDATE SET
    "status" = 'confirmed',
    "confirmed_at" = EXCLUDED."confirmed_at";
