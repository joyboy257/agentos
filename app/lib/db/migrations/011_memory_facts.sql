-- 011: Long-Term Memory — mem0 + Qdrant integration
-- Stores extracted facts from agent runs, with Maria's confirmation state.
-- mem0 handles extraction; Qdrant Cloud stores vector embeddings.
-- This table is the audit log and confirmation interface for Maria.

CREATE TABLE IF NOT EXISTS memory_facts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_text     TEXT NOT NULL,
  source_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  mem0_id       TEXT,                          -- mem0's internal fact ID
  embedding_id  TEXT,                          -- Qdrant point ID
  confirmed_at  TIMESTAMPTZ,
  denied_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_memory_facts_user_id
  ON memory_facts (user_id);

-- Index for pending review (neither confirmed nor denied)
CREATE INDEX IF NOT EXISTS idx_memory_facts_pending
  ON memory_facts (user_id)
  WHERE confirmed_at IS NULL AND denied_at IS NULL;

-- Index for confirmed facts only
CREATE INDEX IF NOT EXISTS idx_memory_facts_confirmed
  ON memory_facts (user_id)
  WHERE confirmed_at IS NOT NULL;
