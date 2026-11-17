ALTER TABLE campaigns ADD COLUMN language VARCHAR(8);

CREATE TABLE campaign_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  language VARCHAR(8) NOT NULL,
  title VARCHAR(100) NOT NULL,
  story TEXT NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'google',
  translated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT campaign_translations_campaign_language_key UNIQUE (campaign_id, language)
);

CREATE INDEX idx_campaign_translations_campaign ON campaign_translations(campaign_id);
