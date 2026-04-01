---
title: "feat: AgentOS Durable Execution — BullMQ + Postgres Checkpoint/Resume"
type: feat
status: active
date: 2026-04-01
phase: 1
---

# Durable Execution — BullMQ + Postgres Checkpoint/Resume

## Overview

Build the engineering foundation that makes AgentOS agents feel like persistent employees, not request-response scripts. Every agent run checkpoints its state to Postgres after each action. Server restarts don't kill in-flight work. Agents resume from where they left off.

**This is the first engineering investment and the prerequisite for everything else in Phase 1.** Without durable execution, the canvas can't show reliable status, push notifications have no reliable state to notify from, and the AHA moment (agent works while Maria sleeps) doesn't happen because the agent dies overnight.

## Problem Frame

The current `InProcessRunner` (`app/lib/runtime/runner.ts`) is ephemeral — it lives and dies with a single HTTP request. If the server restarts mid-run:
- The agent's work is lost
- Maria sees a "failed" agent with no context
- Trust is broken

**What Maria needs:** Her agent is working when she sleeps. That requires the agent process to survive server restarts, heartbeat scheduling, checkpointing, and typed exit reasons.

## Requirements Trace

- R1 (MVP): Agent run survives server restart via checkpoint/resume
- R2 (MVP): BullMQ scheduler fires heartbeat jobs on schedule
- R3 (MVP): Agent state is visible in canvas at all times (idle, running, waiting_for_approval, paused, failed)
- R4 (MVP): Typed exit reasons enable correct canvas UI feedback
- R5 (MVP): Idempotency prevents duplicate tool executions on retry

## Scope Boundaries

### In Scope
- BullMQ job queue for heartbeat scheduling
- Postgres checkpoint table and checkpoint logic
- DurableRunner: wraps InProcessRunner with checkpoint/resume
- Typed exit reasons: `completed | escalated | budget_exceeded | max_steps_exceeded | error | cancelled`
- ULID-based idempotency keys per tool call
- Concurrency partitioning: Gmail send is serial per agent

### Out of Scope
- Long-term memory (Phase 2)
- PROACTIVE webhook wake (Phase 2)
- Multi-agent fork/sidechain (Phase 3)
- Governance board (Phase 2)

## Key Technical Decisions

### Decision 1: BullMQ over raw setTimeout/setInterval

**Ruling:** Use BullMQ for all heartbeat scheduling.

**Rationale:**
- BullMQ persists jobs in Redis — jobs survive Redis restart (with persistence enabled)
- BullMQ handles missed fire events (if server was down at scheduled time, it fires immediately on restart)
- BullMQ has built-in concurrency limits (prevent double-fire)
- Existing Phase 1 infrastructure already assumes BullMQ

**Alternative rejected:** `setTimeout` chains in-process — dies on server restart, no retry, no visibility.

### Decision 2: Checkpoint after every tool call, not after every LLM turn

**Ruling:** Checkpoint fires after every tool call completes, before the next LLM call.

**Rationale:**
- If server dies after a Gmail send tool call completes but before the escalation modal is shown, Maria sees a sent email but no escalation. This is recoverable — log it and continue.
- If server dies during a tool call (mid-execution), don't checkpoint — the tool call was not completed, resume must re-execute it.
- LLM turns are fast. Tool calls are slow (Gmail API, web search). Tool calls are the failure modes.

**Checkpoint state:**
```typescript
interface AgentCheckpoint {
  checkpointId: string       // ULID
  agentId: string
  runId: string             // ULID — unique per heartbeat fire
  heartbeatId: string        // ULID — which scheduled heartbeat this run belongs to
  stateBefore: AgentState   // 'running'
  stateAfter: AgentState    // 'running' | 'waiting_for_approval' | 'completed'
  lastToolCallId: string?   // ULID of last completed tool call
  lastToolCallType: string? // 'gmail.send' | 'gmail.read' | etc.
  messagesSnapshot: Message[] // all messages in run so far (for context restoration)
  createdAt: number         // Unix timestamp
}
```

### Decision 3: Idempotency keys prevent duplicate tool executions

**Ruling:** Every mutating tool call generates a ULID-based idempotency key before execution. On retry, if the key exists in the idempotency store, return the cached result.

**Rationale:**
- Gmail send is idempotent in Gmail's API (same message ID = no duplicate send)
- But HubSpot create task is NOT idempotent — retry creates a duplicate task
- We need application-level idempotency, not just API-level

**Idempotency store:** `idempotency_keys(idempotency_key, tool_call_id, result, created_at)` in Postgres.

**Key format:** `agent:{agentId}:run:{runId}:tool:{toolName}:{inputHash}`

**Behavior:**
- Before tool call: check if key exists → if yes, return cached result
- After tool call: store result against key (TTL: 7 days)
- On crash mid-tool-call: key doesn't exist (we didn't store it), tool re-executes

### Decision 4: Typed exit reasons instead of boolean success/fail

**Ruling:** Every agent run ends with a typed exit reason, not just "completed" or "failed."

**Rationale:** The canvas UI needs to show Maria exactly what happened. "Failed" is ambiguous. "Budget exceeded" tells her exactly why and what to do.

**Exit reasons:**
```typescript
type ExitReason =
  | { type: 'completed'; actionsCount: number; computeCost: number }
  | { type: 'escalated'; pausedAtTool: string; escalationId: string }
  | { type: 'budget_exceeded'; budgetType: 'compute' | 'actions' | 'emails'; limit: number }
  | { type: 'max_steps_exceeded'; steps: number; limit: number }
  | { type: 'error'; error: string; stack?: string }
  | { type: 'cancelled'; reason: string }
```

### Decision 5: Gmail send is serial per agent

**Ruling:** Gmail send tool has `isConcurrencySafe = false`. Only one send executes per agent at a time.

**Rationale:**
- Gmail's API rate limits are per-user, per-second
- If two sends fire simultaneously, one may get a 429
- If Maria has two agents both sending from the same Gmail account, they share the serial queue
- Read tools (gmail.read, calendar.events.list) are parallel-safe

---

## High-Level Technical Design

```
BullMQ Redis
     │
     │  repeat: { pattern: "0 9 * * *" }  ← per-agent cron schedule
     │
     ▼
Heartbeat Job ───────────────────────────────► [Job Queue]
     │                                           │
     │ create new runId (ULID)                   │
     │ check agent state (must be idle)          ▼
     │                                           DurableRunner.execute()
     │                                           │
     │                                     ┌─────┴──────┐
     │                                     │            │
     │                              ┌──────▼────┐  ┌───▼─────┐
     │                              │ InProcess  │  │ Checkpoint│
     │                              │ Runner     │  │ After    │
     │                              │           │  │ Each Tool │
     │                              │ while(!done)│ │ Call     │
     │                              │  LLM call  │  └──────────┘
     │                              │  → tool calls
     │                              │  tool.exec()
     │                              └──────┬────┘
     │                                        │
     │                                   ┌────▼──────────┐
     │                                   │ Postgres       │
     │                                   │ idempotency   │
     │                                   │ check/store   │
     │                                   └───────────────┘
     │
     │  on exit reason
     ▼
Update agent state ──► idle | waiting_for_approval | completed | failed
```

---

## Implementation Units

### Unit 1: Postgres Schema — Checkpoints, Runs, Idempotency

**Goal:** Define and create all Postgres tables for durable execution.

**Files:**
- Create: `app/lib/db/migrations/001_durable_execution.sql`

**Schema:**

```sql
-- Agents table (extends existing schema)
CREATE TABLE agents (
  id TEXT PRIMARY KEY, -- ULID
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'idle', -- idle|running|waiting_for_approval|paused|completed|failed
  heartbeat_schedule TEXT NOT NULL, -- cron expression
  last_heartbeat_at TIMESTAMPTZ,
  last_run_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Runs table — one per heartbeat fire
CREATE TABLE runs (
  id TEXT PRIMARY KEY, -- ULID
  agent_id TEXT NOT NULL REFERENCES agents(id),
  heartbeat_id TEXT NOT NULL, -- which scheduled heartbeat triggered this
  exit_reason JSONB, -- typed exit reason
  actions_count INT DEFAULT 0,
  compute_cost_usd NUMERIC(10,6) DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Checkpoints table — one per tool call completion
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY, -- ULID
  run_id TEXT NOT NULL REFERENCES runs(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  last_tool_call_id TEXT,
  last_tool_call_type TEXT,
  messages_snapshot JSONB NOT NULL, -- all messages in run
  state_before TEXT NOT NULL,
  state_after TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency keys — prevents duplicate tool executions
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY, -- agent:{id}:run:{id}:tool:{name}:{hash}
  tool_call_id TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_idempotency_keys_created ON idempotency_keys(created_at);

-- BullMQ stores its tables in Redis (no migration needed)
```

**Approach:**
- Migrations use `db-migrate` or similar (existing app pattern)
- Run migrations before DurableRunner is deployed
- All tables use ULIDs as primary keys (sortable, unique)

**Test scenarios:**
- Migration runs on fresh Postgres without errors
- Migration is idempotent (re-running does not fail)
- Indexes are created correctly

**Verification:**
- `psql` connection to app DB succeeds
- All 4 tables exist and have correct column types

---

### Unit 2: DurableRunner — Checkpoint/Resume Wrapper

**Goal:** Wrap the existing `InProcessRunner` with checkpoint/resume logic. Every tool call completion triggers a checkpoint. Server restart triggers resume from last checkpoint.

**Files:**
- Create: `app/lib/runtime/durable-runner.ts`
- Modify: `app/lib/runtime/runner.ts` — extend, don't replace
- Create: `app/lib/runtime/exit-reasons.ts`
- Create: `app/lib/runtime/__tests__/durable-runner.test.ts`

**Approach:**

```typescript
// durable-runner.ts

interface DurableRunner {
  execute(input: AgentInput): Promise<RunResult>

  // Called on heartbeat fire
  async schedule(agentId: string): Promise<{ runId: string }> {
    // 1. Acquire row lock on agent (SELECT FOR UPDATE)
    // 2. Verify agent.state === 'idle'
    // 3. Generate new runId (ULID)
    // 4. Generate new heartbeatId
    // 5. Set agent.state = 'running', agent.last_run_id = runId
    // 6. Enqueue BullMQ job with { agentId, runId, heartbeatId }
    // 7. Return { runId }
  }

  // Called by BullMQ worker
  async execute(input: AgentInput): Promise<RunResult> {
    const { agentId, runId, heartbeatId } = input

    // 1. Check for existing checkpoint for this runId
    const checkpoint = await this.findCheckpoint(runId)
    if (checkpoint) {
      // Resume: restore messages from snapshot
      messages = checkpoint.messagesSnapshot
    } else {
      // Fresh start
      messages = await this.buildInitialMessages(agentId)
    }

    // 2. Run the agent loop (delegate to InProcessRunner)
    const runner = new InProcessRunner({ messages, ...input })

    // 3. Wrap tool calls with checkpointing
    runner.onToolCallComplete(async (toolCall: ToolCall) => {
      // a. Store idempotency key BEFORE re-executing on retry
      await this.storeIdempotencyKey(toolCall)

      // b. Checkpoint AFTER every completed tool call
      await this.checkpoint(runId, agentId, toolCall)

      // c. Update run metrics
      await this.updateRunMetrics(runId, toolCall)
    })

    // 4. Run to completion or first blocking state
    const result = await runner.run()

    // 5. Persist exit reason to runs table
    await this.completeRun(runId, result.exitReason)

    // 6. Update agent state
    await this.updateAgentState(agentId, mapExitToAgentState(result.exitReason))

    return result
  }

  // Resume from last checkpoint after server restart
  async resume(runId: string): Promise<RunResult> {
    const run = await this.getRun(runId)
    if (!run) throw new Error(`Run ${runId} not found`)
    if (run.completed_at) return { exitReason: run.exit_reason } // already done

    const checkpoint = await this.findCheckpoint(runId)
    if (!checkpoint) throw new Error(`No checkpoint found for run ${runId}`)

    // Restore state from checkpoint and continue
    return this.execute({ agentId: run.agent_id, runId, heartbeatId: run.heartbeat_id })
  }
}
```

**Checkpointing logic:**
```typescript
async checkpoint(runId: string, agentId: string, toolCall: ToolCall): Promise<void> {
  const messages = runner.getMessages() // current message history

  await db.insert(checkpoints).values({
    id: ulid(),
    run_id: runId,
    agent_id: agentId,
    last_tool_call_id: toolCall.id,
    last_tool_call_type: toolCall.toolName,
    messages_snapshot: messages,
    state_before: 'running',
    state_after: 'running', // will be updated on completion
    created_at: new Date(),
  })
}
```

**Resume logic:**
```typescript
// On BullMQ worker startup (after server restart)
async function recoverIncompleteRuns(): Promise<void> {
  // Find all runs that were 'running' but have no completion timestamp
  const incompleteRuns = await db.query(`
    SELECT r.*, a.heartbeat_schedule
    FROM runs r
    JOIN agents a ON r.agent_id = a.id
    WHERE r.completed_at IS NULL
  `)

  for (const run of incompleteRuns) {
    // Re-enqueue the run
    await queue.add('heartbeat', {
      agentId: run.agent_id,
      runId: run.id,
      heartbeatId: run.heartbeat_id,
    }, {
      jobId: `recover:${run.id}`,
      // Don't repeat — this is a one-time recovery
    })
  }
}
```

**Test scenarios:**
- Server dies mid-run → on restart, run is recovered and resumed
- Tool call completes → checkpoint is written to Postgres
- Same tool call is attempted twice → second call returns cached result (idempotency)
- Agent run completes → exit reason is stored, agent state updated to 'idle'
- Agent run exhausts budget → exit reason is 'budget_exceeded', agent state is 'paused'
- BullMQ worker starts with 3 incomplete runs → all 3 are recovered and re-enqueued

**Verification:**
- `npx vitest --run app/lib/runtime/__tests__/durable-runner.test.ts` passes
- Manual: kill server mid-run → restart server → run resumes from checkpoint

---

### Unit 3: BullMQ Heartbeat Scheduler

**Goal:** Integrate BullMQ scheduler with DurableRunner. Heartbeat jobs fire on each agent's cron schedule. Recover incomplete runs on startup.

**Files:**
- Create: `app/lib/scheduler/heartbeat-scheduler.ts`
- Create: `app/lib/scheduler/__tests__/heartbeat-scheduler.test.ts`
- Modify: `app/lib/runtime/durable-runner.ts` — add `recoverIncompleteRuns()` call

**Approach:**

```typescript
// heartbeat-scheduler.ts

export function createHeartbeatScheduler(runner: DurableRunner) {
  const queue = new Queue('agent-heartbeats', { connection: redis })

  // 1. On startup: recover any runs that were interrupted
  async function recover() {
    await runner.recoverIncompleteRuns()
  }

  // 2. When user creates/updates an agent schedule
  async function scheduleAgent(agent: Agent): Promise<void> {
    // Remove any existing repeatable job for this agent
    const existingJobs = await queue.getRepeatableJobs()
    for (const job of existingJobs) {
      if (job.name === `heartbeat:${agent.id}`) {
        await queue.removeRepeatableByKey(job.key)
      }
    }

    // Add new repeatable job with agent's cron schedule
    if (agent.state !== 'paused') {
      await queue.add(
        `heartbeat:${agent.id}`,
        { agentId: agent.id },  // payload
        {
          repeat: { pattern: agent.heartbeatSchedule },  // cron expression
          jobId: `heartbeat:${agent.id}`,  // deduplication key
          removeOnComplete: false,  // keep for audit
          removeOnFail: false,
        }
      )
    }
  }

  // 3. Worker: process heartbeat jobs
  async function startWorker() {
    worker.process(async (job) => {
      const { agentId } = job.data

      // a. Check agent is not paused
      const agent = await db.query('SELECT * FROM agents WHERE id = $1', [agentId])
      if (agent.state === 'paused') return { skipped: true, reason: 'agent_paused' }

      // b. Check agent is not already running (prevent double-fire)
      if (agent.state === 'running') return { skipped: true, reason: 'already_running' }

      // c. Execute run via DurableRunner
      const result = await runner.execute({ agentId, runId: ulid(), heartbeatId: job.id })
      return result
    })
  }

  return { scheduleAgent, startWorker, recover }
}
```

**Concurrency guard:**
```typescript
// Before executing, atomically claim the run
async function claimRun(agentId: string, runId: string): Promise<boolean> {
  const result = await db.query(`
    UPDATE agents
    SET state = 'running', last_run_id = $2, last_heartbeat_at = NOW()
    WHERE id = $1 AND state = 'idle'
    RETURNING id
  `, [agentId, runId])
  return result.rowCount > 0
}
```

**Test scenarios:**
- Agent schedule updated from daily 9am to daily 8am → old cron removed, new one added
- Agent paused → heartbeat job is not removed (would cause churn), but worker skips paused agents
- Server restarts at 8:59am → a missed 9am job fires immediately on restart
- BullMQ Redis goes down → worker stops, no runs fire, on Redis restore incomplete runs are recovered

**Verification:**
- Create agent with daily 9am schedule → BullMQ job exists with correct cron
- Agent is 'running' → next heartbeat is skipped (not queued)
- Kill worker process → restart → incomplete runs are re-enqueued

---

### Unit 4: Typed Exit Reasons + Agent State Machine

**Goal:** Define exit reasons, map them to agent states, and ensure the canvas shows correct status at all times.

**Files:**
- Create: `app/lib/runtime/exit-reasons.ts`
- Create: `app/lib/runtime/agent-state.ts`
- Modify: `app/lib/runtime/durable-runner.ts` — wire up state transitions

**Exit reason mapping to agent state:**

| Exit Reason | Agent State | User Message |
|-------------|-------------|-------------|
| `completed` | `idle` | "Agent finished" |
| `escalated` | `waiting_for_approval` | "Agent needs your input" |
| `budget_exceeded` | `paused` | "Agent paused: budget exceeded" |
| `max_steps_exceeded` | `idle` | "Agent reached step limit" |
| `error` | `failed` | "Agent failed: [error]" |
| `cancelled` | `idle` | "Agent cancelled" |

**State machine:**

```
idle ──[heartbeat fire]──► running ──[tool call]──► running
                                │
                    ┌───────────┴───────────┐
                    │                           │
              [escalation]              [budget exceeded]
                    │                           │
                    ▼                           ▼
          waiting_for_approval ◄─────────────────┘
                    │                    [resume from checkpoint]
                    │
              [user approves] ──► idle (next heartbeat)
              [user rejects]  ──► idle (stop)
```

**Exit reasons struct:**
```typescript
// exit-reasons.ts
export interface CompletedExit {
  type: 'completed'
  actionsCount: number
  computeCostUsd: number
}

export interface EscalatedExit {
  type: 'escalated'
  pausedAtTool: string      // 'gmail.send' | etc.
  escalationId: string     // ULID — links to escalation record
  reason: string           // Why escalation was triggered
}

export interface BudgetExceededExit {
  type: 'budget_exceeded'
  budgetType: 'compute' | 'actions' | 'emails'
  limit: number
  used: number
}

export interface MaxStepsExceededExit {
  type: 'max_steps_exceeded'
  steps: number
  limit: number
}

export interface ErrorExit {
  type: 'error'
  message: string
  stack?: string
}

export interface CancelledExit {
  type: 'cancelled'
  reason: string
}

export type ExitReason =
  | CompletedExit
  | EscalatedExit
  | BudgetExceededExit
  | MaxStepsExceededExit
  | ErrorExit
  | CancelledExit
```

**Test scenarios:**
- Agent run completes normally → exit_reason = 'completed', agent.state = 'idle'
- Agent escalates → exit_reason = 'escalated', agent.state = 'waiting_for_approval'
- User approves escalation → agent.state transitions to 'idle', next heartbeat fires normally
- Agent hits budget → exit_reason = 'budget_exceeded', agent.state = 'paused'
- Server dies mid-escalation → on restart, agent.state is 'waiting_for_approval', modal shown

**Verification:**
- Canvas shows correct status dot for each exit reason
- Escalation modal appears within 1 second of agent entering waiting_for_approval state
- Activity log entry shows correct exit reason text

---

## System-Wide Impact

### Runner Evolution

The `InProcessRunner` becomes an internal detail. External callers use `DurableRunner`. The canvas subscribes to agent state changes via SSE.

| Before | After |
|--------|-------|
| Fire-and-forget HTTP | BullMQ job → DurableRunner |
| No checkpoint | Checkpoint after every tool call |
| No idempotency | ULID-based idempotency keys |
| Boolean success/fail | Typed exit reasons |
| No state machine | Agent states: idle/running/waiting/paused/failed |

### Canvas Impact

- Agent cards now show accurate real-time status (via SSE state change events)
- Reasoning trace panel connects to running agent's SSE stream
- Activity log entries include typed exit reasons

### Activity Log Impact

- Each run = one ticket in activity log
- Ticket shows: exit reason, actions count, compute cost, duration
- Incomplete runs (recovered after crash) are flagged: "Resumed after interruption"

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| BullMQ Redis persistence failure | Low | High | Redis RDB persistence + AOF; recoverIncompleteRuns() on startup |
| Postgres checkpoint write fails | Low | High | Retry 3x with exponential backoff; if still fails, abort run with error exit reason |
| Double-fire on missed heartbeat | Medium | Medium | claimRun() with SELECT FOR UPDATE prevents double execution |
| Idempotency key collision | Very Low | Medium | ULID is collision-resistant; hash of input adds second layer |
| Server restart during tool call | Medium | Medium | Tool calls are not checkpointed mid-execution; only completed tool calls are |

---

## Verification Checklist

Before Phase 1 is complete, these must all pass:

- [ ] `001_durable_execution.sql` runs without errors on fresh Postgres
- [ ] Agent can be created with a cron schedule
- [ ] BullMQ job fires on schedule
- [ ] Server kill mid-run → restart → run resumes from last checkpoint
- [ ] Same tool call attempted twice → second returns cached result (no duplicate execution)
- [ ] Canvas shows correct status dot for: idle, running, waiting_for_approval, paused, failed
- [ ] Escalation modal appears when agent enters waiting_for_approval state
- [ ] Activity log shows typed exit reason for each run
- [ ] `npx vitest --run app/lib/runtime/__tests__/durable-runner.test.ts` passes
- [ ] `npx vitest --run app/lib/scheduler/__tests__/heartbeat-scheduler.test.ts` passes

---

## Sources & References

- `app/lib/runtime/runner.ts` — existing InProcessRunner (to be wrapped, not replaced)
- BullMQ documentation — job queue, repeatable jobs, worker patterns
- `docs/PRD.md` v4 — MVP scope for durable execution
