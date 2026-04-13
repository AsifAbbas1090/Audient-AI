-- ============================================================
-- Audient AI — Full-text search index migration
-- Run once on your PostgreSQL / Supabase database.
-- ============================================================
-- HOW TO RUN:
--   Option A (psql):
--     psql "$DATABASE_URL" -f migrations/add_search_index.sql
--
--   Option B (Supabase SQL editor):
--     Paste the contents of this file and click Run.
-- ============================================================

-- 1. Add a tsvector column to conversations (stores the pre-computed search vector)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Back-fill existing rows
UPDATE conversations
SET    search_vector = to_tsvector('english', coalesce(title, ''))
WHERE  search_vector IS NULL;

-- 3. Create a GIN index for fast @@ queries
--    GIN is best for tsvector; orders of magnitude faster than ILIKE on large tables.
CREATE INDEX IF NOT EXISTS idx_conversations_search
  ON conversations USING GIN (search_vector);

-- 4. Auto-update search_vector on every INSERT / UPDATE via a trigger
CREATE OR REPLACE FUNCTION conversations_search_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.title, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tsvector_conversations_update ON conversations;
CREATE TRIGGER tsvector_conversations_update
  BEFORE INSERT OR UPDATE OF title ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_search_update();

-- 5. Optional: also index on transcripts.raw_text for full transcript search
--    (larger index — only add if you need transcript-level search)
-- ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS search_vector tsvector;
-- UPDATE transcripts SET search_vector = to_tsvector('english', coalesce(raw_text, ''));
-- CREATE INDEX IF NOT EXISTS idx_transcripts_search ON transcripts USING GIN (search_vector);

-- Done
SELECT 'Search index migration complete.' AS status;
