# Agent Swarm Instructions

**Date:** 2026-04-02
**Status:** Live
**For:** Claude Code agents running in this repo

---

## How to Use This Document

This repo uses a **team of agents** to build features in parallel. Before starting any task, read this document and the state tracker at `.claude/execution-state.json`.

**Rule 1:** Always read `.claude/execution-state.json` before doing anything. It tells you what's been built, what's been read, and what's next.

**Rule 2:** Mark every completed task in the state tracker immediately.

**Rule 3:** Before reading a file that's listed as "read," actually read it. Don't assume the summary is accurate.

---

## Execution State Tracker

**File:** `.claude/execution-state.json`

```json
{
  "last_updated": "2026-04-02",
  "completed_phases": {
    "phase_1_foundation": {
      "status": "complete",
      "completed_at": "2026-04-02",
      "tasks": [
        "schema_migrations_002_003",
        "circuit_breaker",
        "capability_registry",
        "partition_tool_calls",
        "durable_runner_streaming",
        "resume_logic",
        "startup_recovery"
      ],
      "artifacts": [
        "app/lib/db/migrations/002_initial_schema_fixes.sql",
        "app/lib/db/migrations/003_checkpoint_llm_state.sql",
        "app/lib/middleware/circuit-breaker.ts",
        "app/lib/capability-registry/index.ts",
        "app/lib/capability-registry/types.ts",
        "app/lib/runtime/partition-tool-calls.ts",
        "app/lib/runtime/streaming-tool-executor.ts",
        "app/lib/runtime/durable-runner.ts",
        "app/lib/runtime/startup-recovery.ts"
      ]
    }
  },
  "current_phase": "escalation_suggestions_phase_a",
  "next_tasks": [
    {
      "id": "escalation_suggestions_phase_a",
      "name": "Escalation Suggestions Phase A",
      "priority": 1,
      "status": "in_progress",
      "entry_point": "app/lib/runtime/post-run-reflection.ts",
      "integration_point": "durable-runner.ts runComplete hook",
      "depends_on": ["phase_1_foundation"]
    },
    {
      "id": "google_drive_connector",
      "name": "Google Drive Connector",
      "priority": 2,
      "status": "blocked",
      "entry_point": "app/lib/connectors/drive/",
      "depends_on": ["phase_1_foundation"]
    },
    {
      "id": "canvas_ui_unit_1",
      "name": "Canvas UI — Unit 1 (React Flow foundation)",
      "priority": 3,
      "status": "blocked",
      "entry_point": "app/app/components/canvas/InfiniteCanvas.tsx",
      "depends_on": ["phase_1_foundation"]
    }
  ],
  "read_before_starting": {
    "escalation_suggestions_phase_a": [
      "docs/ARCHITECTURE-06-escalation-suggestions.md",
      "app/lib/runtime/durable-runner.ts"
    ],
    "google_drive_connector": [
      "app/lib/mcp/mcp-client.ts",
      "app/lib/gmail/oauth.ts",
      "docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md"
    ],
    "canvas_ui_unit_1": [
      "docs/design-system-v2.md",
      "docs/plans/2026-04-02-001-feat-agentos-canvas-ui-plan.md",
      "app/lib/runtime/durable-runner.ts"
    ]
  },
  "key_artifacts": {
    "PRD": "docs/PRD.md",
    "design_system": "docs/design-system-v2.md",
    "fullstack_plan": "docs/plans/2026-04-02-002-feat-agentos-fullstack-build-plan.md",
    "technical_stack": "docs/technical-stack.md",
    "canvas_ui_plan": "docs/plans/2026-04-02-001-feat-agentos-canvas-ui-plan.md",
    "connector_plan": "docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md",
    "harness_analysis": "docs/claude-code-harness-analysis.md",
    "ARCHITECTURE_06": "docs/ARCHITECTURE-06-escalation-suggestions.md"
  }
}
```

---

## Swarm Task Queue

When running multiple agents, assign tasks from `next_tasks` in priority order. Update the state tracker after each task.

**To claim a task:** Update `status` to `in_progress` and set `assigned_to` with your agent name.

**To complete a task:** Update `status` to `complete`, add `completed_at`, and update the relevant phase's artifact list.

---

## What Was Built (Phase 1 Foundation)

### Schema Migrations
- `app/lib/db/migrations/002_initial_schema_fixes.sql` — CASCADE deletes, org_id, type, position, wires table
- `app/lib/db/migrations/003_checkpoint_llm_state.sql` — messages + tool_args JSONB in checkpoints

### Core Runtime
- `app/lib/middleware/circuit-breaker.ts` — closed/open/half-open circuit breaker per tool type
- `app/lib/capability-registry/index.ts` — 8 built-in capabilities (gmail, hubspot, web, llm)
- `app/lib/capability-registry/types.ts` — ToolCall, ToolDefinition, Capability interfaces
- `app/lib/runtime/partition-tool-calls.ts` — read/write tool partitioning (gmail.read parallel, gmail.send serial)
- `app/lib/runtime/streaming-tool-executor.ts` — streaming LLM executor, fires tools as they stream
- `app/lib/runtime/durable-runner.ts` — fully wired executeAgent() + fixed resume()
- `app/lib/runtime/startup-recovery.ts` — recovers interrupted runs on server boot

### Key Behavior
- `partitionToolCalls()`: gmail.read/web.search/hubspot.read → parallel; gmail.send/hubspot.write → serial
- `CircuitBreaker`: opens after 3 failures on gmail/hubspot, 5 on web, 10 on llm
- `resume()`: finds incomplete checkpoint, replays from messages array
- `recoverInterruptedRuns()`: runs before BullMQ worker starts, recovers all `status='running'` runs

---

## Architecture Principles (Read Before Writing Code)

These are non-negotiable. All agents must follow them:

1. **Every LLM call uses `withRetry()` + circuit breaker.** Never call the Anthropic API directly without retry.
2. **Every tool call is checkpointed before and after.** No skip. Server death must not lose work.
3. **`partitionToolCalls()` must be used.** Gmail read tools always run in parallel. Write tools always run serially.
4. **Escalations pause the run.** Suggestions never pause the run.
5. **Schema changes = new migration file.** Never modify existing migration files.

---

## File Reading Instructions

Before building anything, read the relevant source files listed in `read_before_starting`. Key files and their purposes:

| File | Purpose |
|---|---|
| `app/lib/runtime/durable-runner.ts` | The agent execution engine. All new features integrate here via hooks. |
| `app/lib/runtime/streaming-tool-executor.ts` | How LLM calls are made and tools are dispatched. |
| `app/lib/capability-registry/index.ts` | The tool registry. Register new tools here. |
| `app/lib/middleware/execute-tool.ts` | Retry + timeout + abort signal per tool. |
| `app/lib/middleware/circuit-breaker.ts` | Per-tool circuit breakers. |
| `app/lib/scheduler/worker.ts` | BullMQ worker. `startWorker()` calls `recoverInterruptedRuns()`. |
| `app/lib/tracing/event-schema.ts` | Reasoning event types. Add new types here if needed. |

---

## Updating This Document

After completing a task:
1. Update `.claude/execution-state.json` with the task status
2. Add any new files created to the relevant phase's `artifacts` array
3. Mark the task as `complete` and set `completed_at`
