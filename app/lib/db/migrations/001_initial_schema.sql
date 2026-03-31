-- AgentOS v3 Phase 1 Schema
-- All timestamps are ISO 8601

CREATE TABLE IF NOT EXISTS agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  role        TEXT NOT NULL, -- 'email_agent' | 'research_agent' | 'support_agent'
  config      JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'idle', -- 'idle' | 'running' | 'waiting_for_approval' | 'paused' | 'completed' | 'failed'
  schedule    TEXT, -- cron expression, e.g. '0 9 * * *'
  budget_ms   INTEGER, -- per-heartbeat budget in ms
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agents_user_id_idx ON agents(user_id);
CREATE INDEX IF NOT EXISTS agents_status_idx ON agents(status);

CREATE TABLE IF NOT EXISTS runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES agents(id),
  user_id      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'paused'
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS runs_agent_id_idx ON runs(agent_id);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs(status);

CREATE TABLE IF NOT EXISTS checkpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES runs(id),
  step            INTEGER NOT NULL,
  state_before    JSONB,
  state_after     JSONB,
  tool_name       TEXT,
  tool_call_id    TEXT, -- ULID idempotency key
  tool_result     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checkpoints_run_id_idx ON checkpoints(run_id);
CREATE INDEX IF NOT EXISTS checkpoints_tool_call_id_idx ON checkpoints(tool_call_id) WHERE tool_call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES runs(id),
  step        INTEGER NOT NULL,
  tool_name   TEXT NOT NULL,
  args        JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'denied' | 'timeout'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  -- 30-min timeout enforced at DB level
  CONSTRAINT approvals_timeout_check CHECK (
    status = 'pending' OR
    resolved_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS approvals_run_id_idx ON approvals(run_id);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status);

CREATE TABLE IF NOT EXISTS working_memory (
  session_id  TEXT NOT NULL, -- maps to user session
  key         TEXT NOT NULL,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, key)
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY, -- secure random token
  user_id     TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS gmail_tokens (
  user_id     TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
