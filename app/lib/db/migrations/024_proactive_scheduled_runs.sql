-- 024: Proactive Scheduled Runs
-- Adds triggered_by to runs and renames agents.schedule → schedule_cron for clarity.

-- Add triggered_by to runs: 'manual' | 'proactive' | 'webhook'
ALTER TABLE runs ADD COLUMN IF NOT EXISTS triggered_by text DEFAULT 'manual';

-- Rename agents.schedule to schedule_cron (migration path: existing schedule values
-- are preserved via the UPDATE below)
ALTER TABLE agents RENAME COLUMN schedule TO schedule_cron;

-- Ensure schedule_cron exists (for fresh dbs that never had the schedule column)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS schedule_cron text;

-- Populate schedule_cron from schedule column if migrating from existing data
-- (the rename above handles this for standard migrations, this is a safety net)
-- UPDATE agents SET schedule_cron = schedule WHERE schedule_cron IS NULL AND schedule IS NOT NULL;

CREATE INDEX IF NOT EXISTS runs_triggered_by_idx ON runs(triggered_by);
CREATE INDEX IF NOT EXISTS agents_schedule_cron_idx ON agents(schedule_cron) WHERE schedule_cron IS NOT NULL;
