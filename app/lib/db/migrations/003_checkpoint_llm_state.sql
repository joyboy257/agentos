-- AgentOS v5.1 — Expand Checkpoints to Capture Full LLM State
-- Required for resume() to work: we need the full messages array to continue from.
-- Run after: 002_initial_schema_fixes.sql

-- messages: full Anthropic message history at this checkpoint step
--           Required for resume() — LLM loop continues from this state
ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS messages JSONB;

-- tool_args: arguments passed to the tool at this step
--            Required for audit trail + replay fidelity
ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS tool_args JSONB;

-- total_tokens: token usage at this step (for budget tracking)
ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;
