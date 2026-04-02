-- AgentOS v5.1 Schema Fixes
-- Fixes integrity gaps, adds org multi-tenancy, adds wires table
-- Run after: 001_initial_schema.sql

-- 1. Add CASCADE deletes to checkpoints → runs
ALTER TABLE checkpoints DROP CONSTRAINT IF EXISTS checkpoints_run_id_fkey;
ALTER TABLE checkpoints ADD CONSTRAINT checkpoints_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE;

-- 2. Add CASCADE deletes to runs → agents
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_agent_id_fkey;
ALTER TABLE runs ADD CONSTRAINT runs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

-- 3. Unique constraint on tool_call_id to prevent duplicate tool executions
-- Partial unique index already exists; upgrade to always-on unique constraint
ALTER TABLE checkpoints DROP CONSTRAINT IF EXISTS checkpoints_tool_call_id_unique;
ALTER TABLE checkpoints ADD CONSTRAINT checkpoints_tool_call_id_unique UNIQUE (tool_call_id)
  WHERE tool_call_id IS NOT NULL;

-- 4. Index on runs.user_id for user-facing run queries
CREATE INDEX IF NOT EXISTS runs_user_id_idx ON runs(user_id);

-- 5. Create orgs table (multi-tenant support)
CREATE TABLE IF NOT EXISTS orgs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL, -- references users.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orgs_owner_id_idx ON orgs(owner_id);

-- 6. Add org_id to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id);
CREATE INDEX IF NOT EXISTS agents_org_id_idx ON agents(org_id);

-- 7. Add org_id to runs
ALTER TABLE runs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id);
CREATE INDEX IF NOT EXISTS runs_org_id_idx ON runs(org_id);

-- 8. Add type + canvas position to agents
-- type: 'team-lead' (one per org, coordinator) or 'worker' (sandboxed specialist)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'worker'
  CHECK (type IN ('team-lead', 'worker'));
-- canvas position (pixels)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS position_x FLOAT NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS position_y FLOAT NOT NULL DEFAULT 0;

-- 9. Create wires table for canvas connections
CREATE TABLE IF NOT EXISTS wires (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES orgs(id),
  source_id  UUID NOT NULL REFERENCES agents(id),
  target_id  UUID NOT NULL REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wires_org_id_idx ON wires(org_id);
CREATE INDEX IF NOT EXISTS wires_source_id_idx ON wires(source_id);
CREATE INDEX IF NOT EXISTS wires_target_id_idx ON wires(target_id);

-- 10. Create users table (referenced by sessions, orgs, agents)
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Add org_id to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id);
CREATE INDEX IF NOT EXISTS sessions_org_id_idx ON sessions(org_id);
