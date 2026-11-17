UPDATE "campaigns"
SET "language" = 'ru'
WHERE "language" IS NULL
  AND ("title" ~ '[А-Яа-яЁё]' OR "story" ~ '[А-Яа-яЁё]');
