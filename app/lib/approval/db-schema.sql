-- Human Approval UX (Unit 5) DB Schema
-- DOC-04: pending_approvals and approval_decisions tables

-- NOTE: This schema is additive to the existing schema.sql.
-- Run this migration after the base schema is applied.

-- Persists the pending approval record.
-- The in-memory PendingApproval promise map is request-scoped — the DB row
-- preserves the *record* of a pending approval, but the promise cannot survive
-- a server restart. This is a known MVP limitation (see plan Open Questions).
CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args TEXT NOT NULL,                        -- JSON stringified
  summary TEXT NOT NULL,                     -- plain-English description
  fields TEXT NOT NULL,                      -- JSON array of {name, value, label}
  iteration INTEGER NOT NULL DEFAULT 1,
  max_iterations INTEGER NOT NULL DEFAULT 3,
  snapshot_sequence INTEGER NOT NULL,        -- event buffer sequence at capture time
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'edited', 'skipped', 'cancelled', 'timeout')),
  requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  resolved_args TEXT,                        -- JSON — filled if status is 'approved' or 'edited'
  resolved_by TEXT,                          -- userId who resolved
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

-- Append-only audit log. Never updated or deleted.
CREATE TABLE IF NOT EXISTS approval_decisions (
  id TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL REFERENCES pending_approvals(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'edited', 'skipped', 'cancelled', 'timeout')),
  original_args TEXT NOT NULL,               -- JSON
  revised_args TEXT,                         -- JSON — present for 'edited' decisions
  reason TEXT,                               -- user-supplied reason (optional)
  ip_address TEXT,                            -- client IP for audit
  user_agent TEXT,                            -- client user agent
  user_id TEXT,                              -- session user who made the decision
  iteration INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for looking up pending approvals by run+tool (used during execution resume)
CREATE INDEX IF NOT EXISTS idx_pending_approvals_run_tool
  ON pending_approvals(run_id, tool_call_id)
  WHERE status = 'pending';

-- Index for stale pending approvals (used by timeout cleanup)
CREATE INDEX IF NOT EXISTS idx_pending_approvals_pending
  ON pending_approvals(requested_at)
  WHERE status = 'pending';

-- Index for audit log queries by run
CREATE INDEX IF NOT EXISTS idx_approval_decisions_run
  ON approval_decisions(run_id);
