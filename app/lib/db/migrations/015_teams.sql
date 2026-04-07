-- Migration: 015_teams.sql
-- Multi-agent orchestration: teams table, tasks table, agents.team_id FK

-- teams table
CREATE TABLE teams (
  id TEXT PRIMARY KEY DEFAULT ulid(),
  canvas_id TEXT NOT NULL REFERENCES canvases(id),
  name TEXT NOT NULL,
  coordinator_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'running', 'completed', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tasks table (one per agent run within a team)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT ulid(),
  team_id TEXT NOT NULL REFERENCES teams(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  parent_session_id TEXT,
  branch_name TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'running', 'completed', 'failed', 'stopped')),
  output_artifact JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add team_id to agents table (agents belong to a team)
ALTER TABLE agents ADD COLUMN team_id TEXT REFERENCES teams(id);

-- Indexes
CREATE INDEX idx_teams_canvas ON teams(canvas_id);
CREATE INDEX idx_tasks_team ON tasks(team_id);
CREATE INDEX idx_agents_team ON agents(team_id);
