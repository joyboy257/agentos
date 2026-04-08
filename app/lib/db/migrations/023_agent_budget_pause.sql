-- Migration: 023_agent_budget_pause
-- Add budget pause tracking columns

ALTER TABLE agents ADD COLUMN paused_budget_at timestamptz;
ALTER TABLE runs ADD COLUMN budget_exhausted_at timestamptz;
