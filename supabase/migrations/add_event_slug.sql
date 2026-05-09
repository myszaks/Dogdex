-- Add slug column to events table
CREATE EXTENSION IF NOT EXISTS unaccent;
ALTER TABLE events ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_key ON events (slug) WHERE slug IS NOT NULL;

-- Backfill slugs for existing events that don't have one
-- Run this after deploying the migration; duplicates get a numeric suffix
DO $$
DECLARE
  rec RECORD;
  base_slug text;
  candidate text;
  counter int;
BEGIN
  FOR rec IN SELECT id, title FROM events WHERE slug IS NULL ORDER BY created_at ASC LOOP
    -- normalise: NFD decompose is done in app; here we do a basic transliteration
    base_slug := lower(
      regexp_replace(
        regexp_replace(
          unaccent(rec.title),
          '[^a-zA-Z0-9\s\-]', '', 'g'
        ),
        '\s+', '-', 'g'
      )
    );
    base_slug := substr(rtrim(base_slug, '-'), 1, 80);
    IF base_slug = '' THEN base_slug := 'event'; END IF;

    candidate := base_slug;
    counter := 1;

    LOOP
      BEGIN
        UPDATE events SET slug = candidate WHERE id = rec.id;
        EXIT; -- success, no conflict
      EXCEPTION WHEN unique_violation THEN
        counter := counter + 1;
        candidate := base_slug || '-' || counter;
      END;
    END LOOP;
  END LOOP;
END $$;
