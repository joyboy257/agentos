CREATE TABLE IF NOT EXISTS governance_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  canvas_id TEXT,
  action_type TEXT NOT NULL, -- 'new_agent', 'new_tool', 'schema_change'
  payload_json TEXT NOT NULL, -- JSON of proposed changes
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'denied'
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
