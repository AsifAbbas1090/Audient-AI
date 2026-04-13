-- ============================================================
-- Audient AI — Follow-up questions + session continuation
-- Run once on your PostgreSQL / Supabase database.
-- ============================================================
-- HOW TO RUN:
--   Option A (psql):
--     psql "$DATABASE_URL" -f migrations/add_followup_continuation.sql
--
--   Option B (Supabase SQL editor):
--     Paste and click Run.
-- ============================================================

-- 1. Follow-up questions stored on the summary
ALTER TABLE summaries
  ADD COLUMN IF NOT EXISTS follow_up_questions JSONB DEFAULT '[]';

-- 2. Continuation link — a session can be linked back to a parent session
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36)
    REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_parent
  ON conversations (parent_id);

SELECT 'Follow-up + continuation migration complete.' AS status;
