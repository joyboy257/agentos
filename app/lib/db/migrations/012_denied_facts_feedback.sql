-- Migration: 012_denied_facts_feedback.sql
-- Adds feedback tracking column to memory_facts for Unit 5 (Memory Integrity).

BEGIN;

ALTER TABLE memory_facts
ADD COLUMN feedback_sent_to_mem0_at TIMESTAMPTZ DEFAULT NULL;

-- Index for finding denied facts that haven't yet had feedback sent
CREATE INDEX IF NOT EXISTS idx_memory_facts_feedback_pending
  ON memory_facts (user_id, denied_at)
  WHERE denied_at IS NOT NULL AND feedback_sent_to_mem0_at IS NULL;

COMMIT;
