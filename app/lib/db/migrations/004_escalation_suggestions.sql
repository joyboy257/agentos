-- Migration: 004_escalation_suggestions
-- Creates the escalation_suggestions table for Phase A:
-- Post-Run Reflection with schedule_recurring trigger

CREATE TABLE IF NOT EXISTS escalation_suggestions (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  run_id              TEXT NOT NULL,
  type                TEXT NOT NULL,
  confidence          REAL NOT NULL,
  trigger_description TEXT NOT NULL,
  trigger_evidence    JSONB NOT NULL,
  proposal_headline   TEXT NOT NULL,
  proposal_detail     TEXT NOT NULL,
  proposal_action     JSONB NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  resolved_by         TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX idx_escalation_suggestions_agent ON escalation_suggestions(agent_id);
CREATE INDEX idx_escalation_suggestions_status ON escalation_suggestions(status);
CREATE INDEX idx_escalation_suggestions_created ON escalation_suggestions(created_at);
CREATE INDEX idx_escalation_suggestions_run ON escalation_suggestions(run_id);
