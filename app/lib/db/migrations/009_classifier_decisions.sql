-- Migration 009: Classifier decisions audit trail
-- Stores every classifier decision for RAG context and Maria's review

CREATE TABLE IF NOT EXISTS classifier_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  args_hash TEXT NOT NULL,           -- SHA-256 hash of args for RAG deduplication
  decision TEXT NOT NULL CHECK (decision IN ('auto_approve', 'execute_and_notify', 'escalate')),
  reasoning TEXT NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for RAG queries: find recent decisions for a user
CREATE INDEX IF NOT EXISTS idx_classifier_decisions_user_id_created_at
  ON classifier_decisions(user_id, created_at DESC);

-- Index for tool name + hash deduplication in RAG
CREATE INDEX IF NOT EXISTS idx_classifier_decisions_tool_args_hash
  ON classifier_decisions(tool_name, args_hash);

-- Index for per-run audit trail
CREATE INDEX IF NOT EXISTS idx_classifier_decisions_run_id
  ON classifier_decisions(run_id);
