-- 008: Canvas wire (edge) persistence
-- Wires connect canvas agents and form the agent DAG.

CREATE TABLE IF NOT EXISTS canvas_wires (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  label       TEXT,
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Prevent duplicate wires for the same (team, source, target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_wires_team_pair
  ON canvas_wires (team_id, source_id, target_id);

-- Lookup wires by team
CREATE INDEX IF NOT EXISTS idx_canvas_wires_team_id
  ON canvas_wires (team_id);
