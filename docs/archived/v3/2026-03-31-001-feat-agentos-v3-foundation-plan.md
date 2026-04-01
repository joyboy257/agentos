---
title: "feat: AgentOS v3 Foundation — Durable Execution + Canvas MVP"
type: feat
status: completed
date: 2026-03-31
origin: docs/brainstorms/2026-03-31-prd-contradictions-requirements.md
deepened: 2026-03-31
---

# AgentOS v3 Foundation — Durable Execution + Canvas MVP

## Overview

Build the Phase 1 Foundation for AgentOS v3 — a durable, always-on agent platform where users hire agents once and agents work continuously. This delivers the 10 must-have items from the PRD while replacing the ephemeral `InProcessRunner` with a durable, checkpoint-based execution model.

**Core shift:** From fire-and-forget `POST /api/run` → persistent agent workers scheduled by BullMQ, with Postgres checkpointing for resume-after-crash.

## Problem Frame

The current `InProcessRunner` (lines 125–503 of `runner.ts`) is ephemeral — it lives and dies with a single HTTP request. Server restart mid-run kills all state. Phase 1 requires durable execution: agents that survive process death, wake on heartbeat schedules, and resume from checkpoints.

PRD Phase 1 (10 must-have items):
1. Durable execution (BullMQ + Postgres)
2. Heartbeat scheduler
3. Email Agent template (via template picker)
4. Gmail read/write tools
5. Action approval escalation (modal)
6. Agent card with status, last ran, next wake, budget bar
7. Activity log (timeline view)
8. Magic link auth
9. Canvas team dashboard layout
10. Working memory (per-session)

## Requirements Trace

- **R1:** Durable execution — agent survives server restart and resumes from last checkpoint
- **R2:** Heartbeat scheduler — BullMQ fires heartbeat jobs at scheduled times; agents wake, work, sleep
- **R3:** Approval persistence — pending approvals survive server restart; 30-min timeout enforced by DB, not memory
- **R4:** Real-time canvas updates — agent card status changes propagate to canvas within 1s of occurrence
- **R5:** Gmail OAuth — tokens stored per-user; `gmail.read/send` use authenticated tokens, not `'demo'`
- **R6:** Working memory — per-session key-value store scoped to authenticated user; survives within heartbeat cycle
- **R7:** Template picker — 2–3 template cards (Email Agent, Research Agent, Support Agent) shown before or instead of NL goal input
- **R8:** Activity log — chronological timeline of all agent actions with filtering and search
- **R9:** Canvas team dashboard — org-chart layout with agent cards showing status, last ran, next wake, budget bar

## Scope Boundaries

- **NOT building:** Long-term memory (Phase 2), template gallery (Phase 2), auto-pause on budget exceeded (Phase 2), multi-agent delegation (Phase 2)
- **NOT building:** Mobile-responsive canvas in this plan — canvas layout for desktop only
- **NOT wiring:** Gmail OAuth token refresh in this plan (tokens stored but refresh flow deferred; users re-auth on expiry)
- **Deferred:** BullMQ worker as separate deployment process (see Phase 1 infrastructure note below)

## Key Technical Decisions

- **Postgres over SQLite** — `@vercel/postgres` already in package.json; schema is the foundation
- **BullMQ + Redis for scheduling** — heartbeat jobs enqueued with cron repeat; BullMQ worker is a separate Node.js process
- **SSE over Redis pub/sub** — in-process `runChannels` Map replaced by Redis pub/sub so canvas receives events from BullMQ workers on any machine
- **Vercel constraint: no persistent BullMQ worker in Vercel runtime** — the worker runs as a separate service (Fly.io, Render, or Railway background worker). Vercel API routes handle only short-lived requests (auth, schedule trigger, SSE subscription). This is the correct architecture for production; Vercel serverless cannot host a long-running BullMQ worker.
- **Checkpoint per tool call** — durable runner writes `checkpoint` row before and after every tool call; crash recovery replays from last completed checkpoint (idempotency keys prevent double-execution)
- **In-process runner retained for immediate/synchronous runs** — `POST /api/run/immediate` still uses `InProcessRunner` for quick ad-hoc runs; durable `DurableRunner` used for scheduled/heartbeat runs
- **Working memory = Postgres `working_memory` table (Phase 1)** — keyed by `session_id`; ephemeral per session (cleared on logout), not per heartbeat. NOT an in-memory Map — the schema was already designed for this, and Option B's "no Postgres" framing was a prototype shortcut that conflicts with the actual schema. Use the schema.
- **BullMQ Job Scheduler API** — use `upsertJobScheduler`/`removeJobScheduler` (not legacy `repeat: { pattern }`) for idempotent heartbeat scheduling keyed by `heartbeat:${agentId}`

## Phase 1 Infrastructure Note

BullMQ requires a **persistent Node.js process** for its worker — it cannot run inside Vercel's serverless request/response model (which terminates after 10s).

Two deployment options for the BullMQ worker:

**Option A — Separate service (recommended for production):**
- BullMQ worker runs as a dedicated Node.js service on Fly.io, Render, or Railway
- The worker is a long-running process that:
  - Subscribes to Redis for new jobs
  - Reads agent config from Postgres
  - Executes durable runs, checkpointing to Postgres
  - Publishes SSE events to Redis pub/sub channel
- Vercel handles: API routes (auth, schedule trigger via webhook, SSE subscription), Postgres, Redis

**Option B — Single-process prototype (Phase 1 demo):**
- Run BullMQ worker in the same Node.js process as the Next.js app (single instance)
- Works for demo/prototype with single-user, single-instance deployment
- Does NOT scale horizontally
- Skip Redis pub/sub — use `InMemoryEventEmitter` that wraps the existing `runChannels` Map (same process); SSE events still flow through `EventBuffer` in-process

For this plan: **Option B for Phase 1 prototype, with architecture that supports moving to Option A without rewrites.**

---

## High-Level Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CANVAS (React, SSE subscription)                                           │
│  Agent cards, template picker, activity log                                │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │ SSE / Redis pub/sub
┌────────────────────────▼────────────────────────────────────────────────────┐
│  NEXT.JS API ROUTES (Vercel serverless)                                   │
│  POST /api/auth/magic-link    — send email                                  │
│  GET  /api/auth/verify       — validate token → session                     │
│  POST /api/agents             — create agent config                         │
│  GET  /api/agents            — list user's agents                          │
│  POST /api/agents/:id/schedule — enqueue heartbeat job (→ BullMQ)         │
│  GET  /api/runs/:runId/events — SSE stream (subscribes to Redis pub/sub)  │
│  POST /api/approvals/:id      — resolve pending approval                   │
└──────────┬────────────────────────┬────────────────────────────────────────┘
           │                        │ BullMQ job (delayed/repeat)
┌──────────▼────────┐    ┌───────────▼────────────────────────────────────────┐
│  POSTGRES        │    │  BULLMQ WORKER (Node.js process)                  │
│  • agents        │    │  • Subscribes to Redis for heartbeat jobs         │
│  • runs          │    │  • DurableRunner.execute()                        │
│  • checkpoints   │    │  • Checkpoints: before/after every tool call       │
│  • approvals      │    │  • Checkpoints written to Postgres                │
│  • sessions      │    │  • Publishes events to Redis pub/sub              │
│  • working_memory │    │  • Idempotency keys prevent double-execution      │
└──────────────────┘    └──────────────────────────────────────────────────┘
           ▲
           │ token reads
┌──────────┴──────────┐
│  GMAIL OAUTH       │
│  Per-user tokens   │
│  Stored encrypted  │
└────────────────────┘
```

### State Machine (DurableRunner)

```
idle
  │ POST /api/agents/:id/schedule (or heartbeat fires)
  ▼
scheduled (persisted: run record + status=scheduled)
  │ BullMQ worker picks up job
  ▼
running (persisted: checkpoint per tool call)
  │
  ├── tool call requires approval
  │     ▼
  │   waiting_for_approval (persisted: approval row, execution paused)
  │     │ user resolves via POST /api/approvals/:id
  │     ▼
  │   [resuming — internal transient state, NOT persisted; status stays running]
  │     │
  ├── tool call completes → next agent or complete
  │
  └── run completes / fails / pauses
        ▼
completed / failed / paused (all persisted)
```

### Postgres Schema (Core Tables)

```sql
-- agents: persistent agent configurations
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES sessions(user_id),
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  tools TEXT NOT NULL,          -- JSON array
  heartbeat_schedule TEXT,       -- cron expression, NULL = on-demand only
  escalation_rules TEXT NOT NULL, -- JSON array
  resource_budget TEXT NOT NULL,  -- JSON object
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- runs: each heartbeat or manual execution
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL,  -- 'scheduled'|'running'|'waiting_for_approval'|'completed'|'failed'|'paused'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  checkpoint_id TEXT,     -- last completed checkpoint
  result TEXT,            -- JSON summary
  escalated_count INT DEFAULT 0,
  actions_count INT DEFAULT 0
);

-- checkpoints: per-tool-call durable state
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  agent_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  state_before TEXT NOT NULL,  -- JSON
  state_after TEXT,            -- JSON (NULL = in-progress)
  tool_result TEXT,             -- JSON (NULL = not yet complete)
  idempotency_key TEXT,         -- ULID for retry safety
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- approvals: pending and historical approval decisions
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  agent_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'pending'|'approved'|'edited'|'skipped'|'timeout'
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ,  -- requested_at + 30 minutes
  tool_input TEXT NOT NULL,   -- JSON
  tool_output TEXT,          -- JSON (filled on resolution)
  user_id TEXT NOT NULL REFERENCES sessions(user_id)
);

-- sessions: authenticated user sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- working_memory: per-session ephemeral key-value store
CREATE TABLE working_memory (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,  -- JSON
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (session_id, key)
);

-- credentials: OAuth tokens (encrypted at rest via Vercel Postgres encryption)
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,  -- 'gmail'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Implementation Units

### Phase 1: Foundation

- [ ] **Unit 1: Postgres Schema + DB Layer**

**Goal:** Define and implement the Postgres schema for all Phase 1 entities. Create typed query functions.

**Requirements:** R1 (checkpointing), R3 (approval persistence)

**Dependencies:** None

**Files:**
- Create: `app/lib/db/schema.sql`
- Create: `app/lib/db/migrations/001_initial_schema.sql`
- Create: `app/lib/db/queries.ts` (extend existing)
- Modify: `app/lib/db/queries.ts` (add `createAgent`, `getAgent`, `createRun`, `updateRun`, `createCheckpoint`, `getCheckpointsForRun`, `createApproval`, `resolveApproval`, `getSession`, `setWorkingMemory`, `getWorkingMemory`)
- Create: `app/lib/db/types.ts` (TypeScript types matching schema)

**Approach:**
- Run migration on `npm run db:migrate` via `vercel postgres migrate` or direct SQL
- All timestamps as `TIMESTAMPTZ` (Postgres timezone-aware)
- `user_id` as `TEXT` (ULID from auth system)
- Credentials table uses Vercel Postgres built-in encryption at rest

**Patterns to follow:**
- `app/lib/db/queries.ts` — existing query patterns

**Test scenarios:**
- `createAgent` → row exists in DB with correct fields
- `createRun` → `status = 'scheduled'`
- `createCheckpoint` → second checkpoint for same `run_id` does NOT overwrite first (append-only for audit)
- `resolveApproval` → `status = 'approved'`, `resolved_at` set
- `getSession` → returns session for valid token, null for expired

**Verification:**
- `npm run db:migrate` exits 0
- All queries have unit tests in `app/lib/db/__tests__/queries.test.ts`
- Integration: can create agent → schedule run → checkpoint → complete, all via API

---

- [ ] **Unit 2: BullMQ + Redis Infrastructure**

**Goal:** Add BullMQ and Redis to the stack; establish the job queue for heartbeat scheduling.

**Requirements:** R2 (heartbeat scheduler)

**Dependencies:** Unit 1 (schema), Redis provider (Upstash recommended for Vercel compatibility)

**Files:**
- Modify: `app/package.json` — add `bullmq`, `ioredis`
- Create: `app/lib/scheduler/client.ts` — BullMQ `Queue`, `Worker` setup
- Create: `app/lib/scheduler/heartbeat-job.ts` — job data types and handlers
- Create: `app/lib/scheduler/schedule-agent.ts` — `scheduleAgent(agentId, cronExpression)` function
- Create: `app/lib/scheduler/cancel-schedule.ts` — `cancelSchedule(agentId)` function

**Approach:**
- Use `bullmq` with `ioredis` — Redis connection via `REDIS_URL` env var
- Upstash Redis (serverless-compatible) recommended — has a free tier and works with Vercel
- Use **BullMQ Job Scheduler API** (`upsertJobScheduler` / `removeJobScheduler`) — NOT the legacy `repeat: { pattern }` API
  - `scheduleAgent(agentId, cronExpression)`: calls `queue.upsertJobScheduler(\`heartbeat:${agentId}\`, { pattern: cronExpression }, { name: 'agent-heartbeat', data: { agentId } })`
  - `cancelSchedule(agentId)`: calls `queue.removeJobScheduler(\`heartbeat:${agentId}\`)`
  - Job Scheduler API is idempotent — calling `upsertJobScheduler` twice for the same ID updates the existing scheduler, no duplicates
  - Worker is a separate Node.js process (see Phase 1 Infrastructure Note above) — for Option B prototype, worker runs in same process

**Patterns to follow:**
- BullMQ Job Scheduler API: `queue.upsertJobScheduler(schedulerId, repeatOptions, jobOptions)` and `queue.removeJobScheduler(schedulerId)`
- The PRD Section 7.3 has the exact BullMQ job structure

**Test scenarios:**
- `scheduleAgent` → `upsertJobScheduler` called with `heartbeat:${agentId}` as scheduler ID
- `cancelSchedule` → `removeJobScheduler` called with same ID; subsequent heartbeat does NOT fire
- Calling `scheduleAgent` twice for same agentId → only one scheduler exists (idempotent upsert)
- Worker picks up heartbeat job → calls `DurableRunner.execute()` (wired in Unit 3)

**Verification:**
- `npm run scheduler:worker` starts worker and processes a test job
- `scheduleAgent` job fires at correct cron time (test with `* * * * *` to fire every minute)

---

- [ ] **Unit 3: DurableRunner — Durable Execution Core**

**Goal:** Replace the ephemeral `InProcessRunner` with a `DurableRunner` that checkpoints every state transition to Postgres and implements `resume()` for crash recovery.

**Requirements:** R1, R3

**Dependencies:** Unit 1 (schema), existing `app/lib/middleware/execute-tool.ts`, existing `app/lib/hooks/hook-registry.ts`. Unit 2 (BullMQ) can be done in parallel or before Unit 3. Unit 4 (SSE) is NOT a dependency — `DurableRunner` calls `hooks.emit()` which `SSEStream` already subscribes to; the event transport (Redis vs in-process) is an orthogonal concern.

**Files:**
- Create: `app/lib/runtime/durable-runner.ts` — new `DurableRunner` class
- Create: `app/lib/runtime/runner-interface.ts` — `Runner` interface: `execute(options): Promise<RunResult>`, `resume(runId): Promise<RunResult>`
- Create: `app/lib/runtime/idempotency.ts` — idempotency key logic per tool call
- Modify: `app/app/api/run/route.ts` — keep `InProcessRunner` for immediate runs; add `POST /api/run/scheduled` for BullMQ-triggered runs calling `DurableRunner`
- Create: `app/lib/runtime/__tests__/durable-runner.test.ts`

**Approach:**
- Define `Runner` interface: `{ execute(options): Promise<RunResult>`, `resume(runId): Promise<RunResult>` }`
- `DurableRunner.execute()` mimics the `InProcessRunner` execution model (concurrency-limited queue with max 2 agents, `canRun` fan-in checks, hardcoded tool dispatch via if-else chain):
  1. Create `runs` row with `status = 'running'`
  2. Initialize a `completions` map and a queue of root agent IDs
  3. Run the concurrency loop: `while (queue.length > 0 || running.size > 0)` — same as `InProcessRunner` lines 473-481
  4. Before each tool call: write checkpoint row (`state_before`, `idempotency_key = ulid()`)
  5. Execute via `executeTool()` (the same middleware chain used by `InProcessRunner`)
  6. After each tool call: write checkpoint row (`state_after`, `tool_result`) + update `completions` map
  7. For fan-in: call `canRun(agentId)` — same check as `InProcessRunner` lines 162-171 — verifying all upstream `connections` have non-empty `completions`
  8. Approval required: write `approvals` row with `status = 'pending'`, **return immediately** (don't block worker waiting for resolution)
  9. On completion: update `runs` row with `status = 'completed'`
  10. On error: update `runs` row with `status = 'failed'`
- `DurableRunner.resume(runId)`:
  1. Read all checkpoints for `runId` ordered by `created_at`
  2. Reconstruct `completions` map from `tool_result` in completed checkpoint rows
  3. Resume from the first checkpoint where `state_after IS NULL` (incomplete)
  4. Use `idempotency_key` to skip already-executed tool calls (check if a checkpoint with the same `tool_call_id` + non-null `tool_result` already exists)
  5. Continue execution from that point
- Approval handling: write to `approvals` table and return immediately. The BullMQ worker is free to pick up other jobs while waiting. Resume is triggered by the next heartbeat firing and calling `resume(runId)` — which will detect the approval is resolved and continue.
- `POST /api/run/immediate` continues to use `InProcessRunner` for ad-hoc synchronous runs
- `POST /api/run/scheduled` (called by BullMQ worker) uses `DurableRunner`

**Important — Actual execution model (do not invent a different one):**
The `InProcessRunner` does NOT have an `executeDAG` function. It has:
- A concurrency loop: `while (queue.length > 0 || running.size > 0)` with `running.size < 2` cap (lines 473-481)
- A `canRun(agentId)` function that manually checks `graph.connections` for fan-in (lines 162-171)
- A hardcoded if-else tool dispatch chain (lines 233-407) — NOT a loop over a tool array
- Fan-in data accessed via `completions.get(agentId)` lookups

The `DurableRunner` must replicate this model, not assume a DAG executor that doesn't exist.

**Patterns to follow:**
- `app/lib/runtime/runner.ts` lines 125–503 — DAG execution model, fan-in logic, concurrency limit
- `app/lib/middleware/execute-tool.ts` — `executeTool()` composition
- `app/lib/hooks/hook-registry.ts` — `void hooks.emit(...)` pattern

**Test scenarios:**
- Run starts → `runs` row created with `status = 'running'`
- Tool call completes → two `checkpoints` rows (before + after) exist
- Worker crashes after tool call 3 of 5 → new worker calls `resume(runId)` → replays 1, 2, 3 (via idempotency skip), executes 4, 5
- Approval required → `approvals` row with `status = 'pending'`, execution paused
- Approval resolved → execution resumes and completes

**Verification:**
- Simulate server kill mid-run → `resume()` recovers and completes
- All existing `runner.ts` tests still pass with `InProcessRunner` for immediate runs

---

### Phase 2: Real-Time Canvas

- [ ] **Unit 4: SSE over Redis Pub/Sub**

**Goal:** Replace in-process `runChannels` Map with Redis pub/sub so canvas receives events from BullMQ workers on any machine.

**Requirements:** R4 (real-time canvas updates)

**Dependencies:** Unit 2 (BullMQ + Redis)

**Files:**
- Modify: `app/lib/tracing/sse-stream.ts` — replace in-memory `runChannels` Map with Redis pub/sub
- Create: `app/lib/tracing/redis-pubsub.ts` — Redis pub/sub client (`subscribeToRun(runId)`, `publishToRun(runId, event)`)
- Create: `app/lib/tracing/event-emitter.ts` — unified event emission interface (Redis in prod, in-memory fallback for Option B prototype)
- Create: `app/app/api/runs/[runId]/events/route.ts` — SSE endpoint: `GET /api/runs/:runId/events?lastSequence=N`
- Create: `app/lib/tracing/__tests__/redis-pubsub.test.ts`

**Approach:**
- `EventEmitter` interface: `emit(runId: string, event: SSEEvent): Promise<void>`
- `RedisEventEmitter` implementation: `await redis.publish(\`run:${runId}\`, JSON.stringify(event))`
- `SSEStream.subscribe(runId)` subscribes to Redis channel instead of in-memory Map
- For Option B prototype (single-process): `InMemoryEventEmitter` wraps the existing `runChannels` Map — no Redis needed until multi-instance
- SSE endpoint `GET /api/runs/:runId/events`:
  - Query params: `?lastSequence=N` (cursor-based resumption using `EventBuffer` sequence numbers)
  - Returns buffered events from the existing `EventBuffer` (already implemented at `app/lib/tracing/event-buffer.ts` — `eventBufferRegistry.getOrCreate(runId)`) filtered by `sequence > lastSequence`
  - Then subscribes to Redis channel for new events
  - `text/event-stream` content type, no caching
  - The `EventBuffer.addEvent()` already assigns monotonic sequence numbers — use these for cursor-based resumption

**Patterns to follow:**
- Existing SSE format in `sse-stream.ts`: `event: TYPE\ndata: JSON\n\n`
- `app/lib/tracing/event-buffer.ts` — **CONFIRMED EXISTS**, fully implemented. `EventBuffer` has `addEvent()`, `getEvents(since?: number)`, and `capturePointInTime()`. `eventBufferRegistry` is a global per-run registry. Build SSE cursor resumption on top of this — do not replace it.

**Test scenarios:**
- Client connects with `lastSequence=0` → receives all buffered events from DB
- Client connects with `lastSequence=N` → receives only events after sequence N
- BullMQ worker publishes `approval_required` event → canvas receives it within 1s

**Verification:**
- BullMQ worker running on one terminal → canvas client on another terminal receives SSE events from Redis pub/sub

---

### Phase 3: Auth + Gmail

- [ ] **Unit 5: Magic Link Auth Completion**

**Goal:** Complete magic link auth flow; implement session management; protect all API routes with auth.

**Requirements:** R5 (auth-gated Gmail tokens)

**Dependencies:** Unit 1 (schema — `sessions` table)

**Files:**
- Create: `app/lib/auth/session.ts` — session management (`createSession`, `getSession`, `deleteSession`, `validateSession`)
- Create: `app/lib/auth/middleware.ts` — Next.js middleware protecting `/api/*` routes with session cookie
- Create: `app/app/api/auth/send-link/route.ts` — sends magic link email (extend existing)
- Create: `app/app/api/auth/verify/route.ts` — validates token → sets HTTP-only session cookie
- Create: `app/app/api/auth/logout/route.ts` — clears session cookie
- Modify: `app/middleware.ts` — add auth protection

**Approach:**
- Session ID stored in HTTP-only, Secure, SameSite=Lax cookie (`session_id`)
- Sessions table: `id`, `user_id`, `email`, `created_at`, `expires_at` (30-day default)
- `middleware.ts` checks `session_id` cookie on all `/api/*` routes except `/api/auth/send-link` and `/api/auth/verify`
- Magic link token: 15-min expiry, single use, creates session on verification
- `resend` package already in `package.json` for email sending

**Patterns to follow:**
- `app/lib/auth/magic-link.ts` — existing magic link logic (extend)

**Test scenarios:**
- Valid magic link → session created, redirect to app
- Expired magic link → error message
- Authenticated request → `session.userId` available in route handler
- Unauthenticated request to protected route → 401

**Verification:**
- Full flow: request magic link → click email link → session active → logout → session cleared

---

- [ ] **Unit 6: Gmail OAuth Wiring**

**Goal:** Wire `gmailReadTool` and `gmailSendTool` to per-user OAuth tokens; replace hardcoded `'demo'` userId.

**Requirements:** R5

**Dependencies:** Unit 5 (auth middleware)

**Files:**
- Modify: `app/lib/gmail/client.ts` — add `getGmailClientForUser(userId)` that reads tokens from `credentials` table
- Modify: `app/lib/runtime/tools/gmail.ts` — `gmailReadTool` and `gmailSendTool` accept `userId` and use authenticated client
- Modify: `app/app/api/auth/gmail/route.ts` — OAuth redirect handler stores tokens in `credentials` table
- Create: `app/app/api/credentials/gmail/route.ts` — `GET /api/credentials/gmail` — check if Gmail connected
- Create: `app/components/connect-gmail-button.tsx` — OAuth connect button for canvas

**Approach:**
- `getGmailClientForUser(userId)`:
  1. Read `credentials` row for `userId` + `provider = 'gmail'`
  2. If `expires_at` is near (within 5 min), attempt refresh using `refresh_token`
  3. Return authenticated Google OAuth2 client
- `gmailReadTool` / `gmailSendTool`: receive `userId` from runner context, call `getGmailClientForUser(userId)` to get tokens
- `POST /api/auth/gmail` (existing OAuth redirect endpoint): exchange code for tokens, store in `credentials` table
- `GET /api/credentials/gmail`: checks if valid `credentials` row exists for current user

**Patterns to follow:**
- `app/lib/gmail/oauth.ts` — existing OAuth helpers
- `app/lib/gmail/client.ts` — existing Gmail client setup

**Test scenarios:**
- Connected user → `gmailReadTool` returns real emails from their inbox
- Disconnected user → runner surfaces auth error, canvas prompts to reconnect
- Token refresh → new tokens stored, old tokens invalidated

**Verification:**
- Connect Gmail via OAuth → send email via agent → email appears in real recipient inbox

---

### Phase 4: Heartbeat + Templates

- [ ] **Unit 7: Heartbeat Scheduler Integration**

**Goal:** Wire heartbeat scheduling into the agent lifecycle — when user creates/activates an agent, schedule its BullMQ heartbeat job; when user pauses/deletes, cancel.

**Requirements:** R2

**Dependencies:** Unit 2 (BullMQ infrastructure), Unit 3 (DurableRunner)

**Files:**
- Modify: `app/app/api/agents/[agentId]/schedule/route.ts` — `POST` calls `scheduleAgent(agentId, cronExpression)` from Unit 2
- Modify: `app/app/api/agents/[agentId]/pause/route.ts` — `POST` calls `cancelSchedule(agentId)`
- Modify: `app/app/api/agents/route.ts` — `POST` (create agent) → automatically schedule heartbeat if `heartbeat_schedule` provided

**Approach:**
- When user activates an agent (or creates with schedule): call `scheduleAgent(agentId, cronExpression)` — enqueues a BullMQ repeatable job
- Job type: `heartbeat:${agentId}` with cron repeat
- BullMQ worker: when job fires, calls `DurableRunner.execute({ agentId, runType: 'heartbeat' })`
- When user pauses agent: call `cancelSchedule(agentId)` — removes BullMQ job
- `cancelSchedule` does NOT cancel in-progress runs — they complete, then the next scheduled heartbeat is skipped

**Patterns to follow:**
- Unit 2 `scheduleAgent()` and `cancelSchedule()` signatures

**Test scenarios:**
- Activate agent with `daily 9am` schedule → BullMQ job fires next day at 9am → DurableRunner executes → canvas shows `last ran: Today 9:01am`
- Pause agent → no new heartbeat jobs fire
- Agent crashes mid-run → `resume()` fires on next heartbeat (not immediate)

**Verification:**
- Schedule agent for every-minute heartbeat → verify job fires, agent card updates, next wake shows correct countdown

---

- [ ] **Unit 8: Template Picker**

**Goal:** Show 2–3 template cards (Email Agent, Research Agent, Support Agent) before or instead of NL goal input.

**Requirements:** R7

**Dependencies:** Unit 3 (DurableRunner accepts agent config), Unit 5 (auth)

**Files:**
- Create: `app/lib/tools/templates/email-agent.ts` — Email Agent template definition
- Create: `app/lib/tools/templates/research-agent.ts` — Research Agent template
- Create: `app/lib/tools/templates/support-agent.ts` — Support Agent template
- Create: `app/lib/tools/templates/index.ts` — registry, `getTemplate(id)`, `listTemplates()`
- Create: `app/components/template-picker.tsx` — template card grid UI
- Create: `app/components/template-card.tsx` — individual template card
- Modify: `app/app/page.tsx` — show template picker when canvas is empty, NL input still available as fallback

**Approach:**
- Template definition shape:
```typescript
interface AgentTemplate {
  id: string
  name: string
  description: string
  role: string
  tools: string[]
  heartbeat_schedule: string | null  // cron or null for on-demand
  escalation_rules: EscalationRule[]
  resource_budget: ResourceBudget
  color: string  // agent role color from PRD palette
}
```
- `TemplatePicker`: renders 2–3 cards in a horizontal list/grid, each with name, description, role color
- On card click: pre-fills the NL input with template goal text, user can accept or customize before "Hire"
- "Hire" → `POST /api/agents` with template's agent config + NL customization → agent created + scheduled
- NL input remains accessible below template picker as a fallback for users who want custom agents

**Patterns to follow:**
- PRD Section 6.5 onboarding flow (steps 4–6)
- PRD Section 5.7 Phase 1 template picker

**Test scenarios:**
- User with no agents sees template picker
- Clicking Email Agent → pre-fills NL input with "handle my inbound customer emails"
- Customizing the pre-fill → NL layer re-interprets the modified goal
- Hiring a template agent → agent appears on canvas with correct config

**Verification:**
- Fresh user → template picker visible → click Email Agent → agent card appears on canvas with daily 9am schedule

---

### Phase 5: Canvas + Activity

- [ ] **Unit 9: Canvas Team Dashboard**

**Goal:** Render agent team as an org-chart layout on canvas — agent cards with status, last ran, next wake, budget bar.

**Requirements:** R6 (working memory), R9 (canvas dashboard with budget bar, status, heartbeat info)

**Dependencies:** Unit 4 (SSE for real-time updates), Unit 7 (heartbeat scheduler)

**Files:**
- Create: `app/components/canvas/team-canvas.tsx` — main canvas component (org-chart layout)
- Create: `app/components/canvas/agent-node.tsx` — individual agent node (agent card)
- Create: `app/components/canvas/org-chart-layout.tsx` — layout logic (Maria at top, agents below)
- Modify: `app/components/agent-card.tsx` — extend to show: last ran timestamp, next wake countdown, budget bar
- Create: `app/components/canvas/budget-bar.tsx` — budget progress bar component
- Create: `app/components/canvas/status-dot.tsx` — pulsing dot (idle/running/waiting/paused/failed)
- Create: `app/lib/hooks/use-agent-status.ts` — hook: subscribes to SSE for agent status updates
- Create: `app/app/api/agents/route.ts` — `GET` returns user's agents with current run status
- Create: `app/app/api/agents/[agentId]/route.ts` — `DELETE` (pause agent), `PATCH` (update config)
- Create: `app/components/canvas/__tests__/agent-node.test.tsx`

**Approach:**
- `TeamCanvas`: fetches `GET /api/agents` on mount; subscribes to SSE `GET /api/runs/:runId/events` for live updates
- `AgentNode`: shows role, status dot (idle=gray, running=green pulse, waiting=amber pulse, paused=gray static, failed=red), last ran, next wake, budget bar
- Org chart layout: user node at top, agents below in a row (no hierarchical delegation in Phase 1 — all agents report to user directly)
- `BudgetBar`: fills proportional to `actions_count / action_limit` from `resource_budget`; color transitions green→yellow→red
- SSE events that update canvas: `status` (agent started/stopped), `approval_required` (adds amber pulse to agent), `heartbeat_fired` (updates "last ran")

**Patterns to follow:**
- PRD Section 4.2 Canvas Layout (ASCII diagram)
- PRD Section 4.3 Agent Card Anatomy
- PRD Section 6.2 Agent Card Component states
- Existing `app/components/canvas-panel.tsx` — canvas components in PRD are new, this is a reference for overall layout

**Test scenarios:**
- 3 agents on canvas: one running (green pulse), one idle (gray), one waiting (amber pulse) — all correct
- Heartbeat fires → agent card updates "last ran" within 1s of completion
- Budget reaches 80% → amber budget bar + notification badge
- User pauses agent → dot turns gray, "Paused by you"

**Verification:**
- Open canvas with 3 active agents → all show correct status, heartbeat countdown accurate, budget bar proportional

---

- [ ] **Unit 10: Escalation Modal**

**Goal:** Full approval modal as described in PRD Section 4.4 — shows what the agent wants to do, reasoning trace, action buttons.

**Requirements:** R4 (real-time), R5 (auth-gated approval)

**Dependencies:** Unit 4 (SSE for `approval_required` event), Unit 3 (checkpoint data for reasoning trace)

**Files:**
- Create: `app/components/escalation-modal.tsx` — full-screen overlay modal
- Create: `app/components/escalation-modal/reasoning-panel.tsx` — reasoning trace display
- Create: `app/components/escalation-modal/action-summary.tsx` — what the agent wants to do
- Create: `app/components/escalation-modal/approval-buttons.tsx` — Approve / Edit & Send / Skip / Cancel
- Modify: `app/components/canvas/agent-node.tsx` — click agent → slide-in agent detail panel (400px) showing escalation queue
- Create: `app/app/api/approvals/[approvalId]/route.ts` — `GET` (get approval details), `POST` (resolve: approve/edit/skip/cancel)
- Create: `app/lib/hooks/use-pending-approvals.ts` — hook: subscribes to SSE, surfaces `approval_required` event as modal
- Create: `app/components/escalation-modal/__tests__/escalation-modal.test.tsx`

**Approach:**
- Canvas subscribes to SSE via `usePendingApprovals()` hook
- On `approval_required` event: render `EscalationModal` overlay, blocking the canvas
- Modal shows:
  - Agent name + avatar
  - What the agent wants to do (email preview: to, subject, body)
  - Reasoning trace (from `reasoningSnapshot` captured at approval request time — already in `approval-manager.ts`)
  - Four action buttons: `Approve` → `POST /api/approvals/:id { decision: 'approved' }`; `Edit & Send` → inline edit then approve; `Skip` → `POST ... { decision: 'skipped' }`; `Cancel` → `POST ... { decision: 'cancelled' }`
- `POST /api/approvals/:id` resolves the approval in DB → BullMQ worker resumes (polls `approvals` table or receives Redis pub/sub notification)
- User can only approve approvals they own (`session.userId === approval.userId`) — enforced in route handler

**Patterns to follow:**
- PRD Section 4.4 Escalation Modal (ASCII wireframe)
- PRD Section 4.3 Agent Card Anatomy (escalation badge)
- `app/lib/approval/approval-manager.ts` — existing `requestApproval()`, `getPendingApproval()` signatures (adapt for DB-backed)

**Test scenarios:**
- `approval_required` SSE event fires → modal appears within 1s
- User clicks Approve → modal closes, agent resumes, completion event fires
- 30-min timeout → modal shows "Auto-skipped after 30 min", agent continues
- User clicks Cancel → agent skips tool, downstream agents receive `{ skipped: true }`

**Verification:**
- Agent encounters `gmail.send` → canvas shows amber waiting pulse → escalation modal appears → user approves → email actually sent (check real inbox)

---

- [ ] **Unit 11: Activity Log (Timeline View)**

**Goal:** Chronological timeline of all agent actions across all agents — filterable, searchable.

**Requirements:** R8

**Dependencies:** Unit 1 (schema — `runs`, `checkpoints` tables), Unit 4 (SSE — events written to DB event buffer)

**Files:**
- Create: `app/components/activity-log/activity-timeline.tsx` — timeline view container
- Create: `app/components/activity-log/timeline-item.tsx` — individual action row
- Create: `app/components/activity-log/timeline-filters.tsx` — filter bar (agent, status, date range)
- Create: `app/app/api/runs/route.ts` — `GET` returns all runs for user with pagination
- Create: `app/app/api/runs/[runId]/route.ts` — `GET` returns single run with full checkpoint chain
- Create: `app/lib/hooks/use-activity-feed.ts` — hook: subscribes to SSE, prepends new events to timeline
- Create: `app/components/activity-log/__tests__/timeline.test.tsx`

**Approach:**
- `GET /api/runs` returns: `{ runs: [{ id, agentId, agentName, status, startedAt, completedAt, escalatedCount, actionsCount }] }` — paginated, 20 per page
- `GET /api/runs/:runId` returns run with full checkpoint chain for expanded detail
- Timeline item shows: agent avatar + name, action type (email sent, email read, etc.), recipient/subject, timestamp, status badge, cost
- Expanded item (on click): shows full reasoning trace + tool call inputs/outputs
- Filters: by agent (dropdown), by status (completed/failed/escalated/pending), by date range (today/week/month/custom)
- Search: full-text across `tool_input` and `tool_output` JSON columns
- SSE subscription on activity page: new completed runs appear at top of feed without page refresh

**Patterns to follow:**
- PRD Section 5.5 Activity Log (full specification)
- PRD Section 6.4 Activity Log Component (ASCII wireframe)

**Test scenarios:**
- 50 runs in DB → paginated correctly (20 per page)
- Filter by "Email Agent" → only shows runs from that agent
- New run completes → appears at top of feed via SSE without refresh
- Search "john@acme.com" → shows all runs with that email in input/output

**Verification:**
- Run 10 agent executions → all appear in activity log with correct timestamps, statuses, and detail

---

- [ ] **Unit 12: Working Memory (Per-Session)**

**Goal:** Per-session ephemeral key-value store for the agent's working memory — survives within a heartbeat cycle but not across sessions.

**Requirements:** R6

**Dependencies:** Unit 1 (schema — `working_memory` table), Unit 5 (auth — session required)

**Files:**
- Modify: `app/lib/db/queries.ts` — add `setWorkingMemory(sessionId, key, value)`, `getWorkingMemory(sessionId, key)`, `clearWorkingMemory(sessionId)`
- Modify: `app/lib/runtime/durable-runner.ts` — inject working memory context into agent execution
- Create: `app/lib/runtime/working-memory.ts` — `WorkingMemory` class: `get(key)`, `set(key, value)`, `merge(patch)`
- Create: `app/lib/runtime/__tests__/working-memory.test.ts`

**Approach:**
- `WorkingMemory` class: wraps `working_memory` table, scoped to `session_id`
- Keys: structured (e.g., `escalation_history`, `user_preferences`, `last_run_summary`)
- Values: JSON-serialized (any serializable value)
- `merge(patch)`: atomically updates multiple keys in one transaction
- Cleared on session expiry or explicit logout — NOT on heartbeat
- Injected into `DurableRunner` context: `workingMemory = new WorkingMemory(sessionId)`
- Agent can call a `memory.get` / `memory.set` pseudo-tool (not a real external tool, internal to the runner) to read/write working memory
- PRD escalation learning loop (Section 5.3): when user approves an escalation, agent calls `memory.set('escalation_history', [...])` to record the decision for the session

**Patterns to follow:**
- PRD Section 5.3 escalation learning loop with working memory

**Test scenarios:**
- `memory.set('escalation_history', [{decision: 'approved', agent: 'email'}])` → read back correct
- `memory.merge({ last_run: { timestamp: ..., summary: '...' } })` → both keys present
- Session expires → `getWorkingMemory` returns null for all keys
- Two concurrent agents in same session → separate working memory scopes

**Verification:**
- User approves escalation → next heartbeat run reads `escalation_history` from working memory → fewer repeat escalations in same session

---

## System-Wide Impact

- **Hook emissions** — `DurableRunner` calls `void hooks.emit(...)` at the same points as `InProcessRunner` (preAgentRun, postToolCall, etc.) — canvas SSE subscription also receives these events for live updates
- **Error propagation** — `executeTool` always returns `ToolResult`, never throws. `DurableRunner` catches all errors and marks `runs.status = 'failed'` with error details in `result` JSON
- **State lifecycle** — Runs that crash leave `status = 'running'` in DB. BullMQ `onFailed` callback marks them `failed` on worker crash. Resume is triggered by next heartbeat, not automatic — no zombie runs.
- **SSE reconnection** — `GET /api/runs/:runId/events?lastSequence=N` cursor-based resumption — client stores last received sequence, reconnects with `lastSequence` on disconnect
- **Approval ownership** — every `POST /api/approvals/:id` validates `session.userId === approval.userId` before processing

## Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|-----------|
| BullMQ worker not deployable on Vercel | Heartbeat scheduler doesn't work in production | Architecture designed for separate worker service (Fly.io/Render/Railway). Option B prototype runs worker in-process for demo. |
| Postgres schema changes mid-development | Running DB needs migrations | Use Vercel Postgres migrations; all schema changes as new migration files |
| Gmail OAuth token refresh not wired | Tokens expire, users must re-auth | Phase 1: prompt re-auth on expiry. Phase 2: full refresh flow. |
| In-memory SSE channels don't scale | Multiple Vercel instances → missed events | Redis pub/sub in Unit 4. Unit 4 is critical path for multi-instance. |
| `InProcessRunner` regression | Immediate runs break during refactor | Keep `InProcessRunner` for `POST /api/run/immediate` unchanged; only BullMQ-triggered runs use `DurableRunner` |
| SSE + Vercel 10s timeout | Long-running agent may exceed Vercel timeout | BullMQ worker handles execution — Vercel SSE endpoint only subscribes/publishes, does not execute |

## Open Questions

### Resolved During Deepening

- **`executeDAG` doesn't exist** — the runner is a concurrency-limited task queue with hardcoded if-else tool dispatch, NOT a DAG executor. DurableRunner approach updated accordingly.
- **`event-buffer.ts` IS real** — confirmed fully implemented. SSE cursor resumption builds on existing `EventBuffer` with monotonic sequence numbers, not a new abstraction.
- **`resuming` is not a persisted status** — removed from state machine. It's a transient internal state only.
- **BullMQ Job Scheduler API** — `upsertJobScheduler`/`removeJobScheduler` is the correct API for idempotent per-agent scheduling.
- **Working memory = Postgres** — `working_memory` table is the source of truth; "in-memory Map" phrasing in Key Tech Decisions was a prototype shortcut; corrected.
- **Unit 3 depends on Unit 4** — SSE is NOT a dependency for DurableRunner. The `hooks.emit()` contract is already in place; SSE transport layer is orthogonal.

### Deferred to Implementation

- **`resume()` crash recovery timing** — if an agent crashes 18 hours before its next scheduled heartbeat, it's down for 6 more hours. Is this acceptable for Phase 1, or should BullMQ's failed-job retry handle faster recovery?
- **SSE reconnect event replay** — does the reconnect flow correctly replay buffered events published during a canvas disconnect window? Verify during Unit 4.
- **`getAgentGraph` doesn't exist** — Unit 1 must add this function to queries.ts. It reads the stored NL interpretation config from the agents table and reconstructs the agent graph from it.
- **Approval timeout on resume** — on resume, if `approvals.status = 'timeout'`, the agent should treat the action as `skipped`. Verify during Unit 10.

## Documentation / Operational Notes

- **BullMQ worker deployment** — see `docs/runbooks/bullmq-worker-deployment.md` (create in this plan as operational doc)
- **Redis provider setup** — Upstash recommended, `REDIS_URL` env var
- **Vercel Postgres setup** — `vercel postgres create`, `vc postgres link`
- **Local development** — BullMQ worker can run as separate process: `npm run worker`
- **Demo mode (Option B)** — set `DEMO_MODE=true` env var to run worker in same process with in-memory event bus

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-31-prd-contradictions-requirements.md](docs/brainstorms/2026-03-31-prd-contradictions-requirements.md)
- **PRD:** [docs/PRD.md](docs/PRD.md) — Sections 1.2, 3.1, 4.2, 4.3, 5.3, 5.4, 5.7, 6.5, 9, 10.1
- **SPEC.md:** [SPEC.md](SPEC.md) — Sections 4 (Phase 1 scope), 5 (architecture diagram), 7 (data model)
- **Existing runner:** `app/lib/runtime/runner.ts` — `InProcessRunner` reference implementation
- **Hook system:** `app/lib/hooks/hook-registry.ts` — 8 hook types, fire-and-forget
- **Tool middleware:** `app/lib/middleware/execute-tool.ts` — withAbortSignal → withTimeout → withRetryBudget → withRetry → translateToolError
- **SSE stream:** `app/lib/tracing/sse-stream.ts` — current in-process implementation
- **Approval manager:** `app/lib/approval/approval-manager.ts` — needs DB persistence
- **Auth:** `app/lib/auth/magic-link.ts` — existing magic link logic
- **Gmail tools:** `app/lib/runtime/tools/gmail.ts` — `gmailReadTool`, `gmailSendTool` (replace `'demo'` userId)
