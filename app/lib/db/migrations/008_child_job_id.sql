-- Migration: add child_job_id to checkpoints for BullMQ parent-child job tracking
-- This allows child job checkpoints to be queried and makes the full multi-agent
-- trace queryable via the existing /runs/[runId]/trace endpoint.

ALTER TABLE checkpoints
  ADD COLUMN child_job_id TEXT;

CREATE INDEX IF NOT EXISTS checkpoints_child_job_id_idx ON checkpoints(child_job_id)
  WHERE child_job_id IS NOT NULL;
