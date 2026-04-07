-- 014: Task output artifacts for wire artifact passing
-- Stores structured output artifacts produced by worker agents.
-- Downstream agents receive these artifacts as input context.

CREATE TABLE IF NOT EXISTS task_outputs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL,
  artifact    JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- One output per task (upsert semantics)
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_outputs_task_id
  ON task_outputs (task_id);
