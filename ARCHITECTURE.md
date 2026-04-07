# AgentOS Backend Architecture

**Date:** 2026-04-05
**Status:** Active
**Purpose:** Definitive reference for the AgentOS backend system.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS APP SERVER                            │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     API ROUTES (Route Handlers)                  │  │
│  │  POST /api/run          — start canvas run (InProcessRunner, SSE) │  │
│  │  POST /api/run          — scheduled run (DurableRunner, BullMQ)   │  │
│  │  GET  /api/runs/:id/events — SSE trace stream                    │  │
│  │  POST /api/approvals/:id — resolve escalation                    │  │
│  │  POST /api/escalation-suggestions — post-run reflection          │  │
│  │  GET  /api/canvas/nl-to-canvas — NL interpretation            │  │
│  │  POST /api/canvas/wires   — create wire connection              │  │
│  │  POST /api/auth/*         — magic link, OAuth callbacks          │  │
│  │  POST /api/push           — push notification subscription        │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                  │                                     │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                       RUNNER LAYER                                │  │
│  │                                                                   │  │
│  │   InProcessRunner          DurableRunner                          │  │
│  │   ┌──────────────────┐    ┌──────────────────────────────────┐ │  │
│  │   │ execute(graph)    │    │ execute(options) → checkpoints   │ │  │
│  │   │ SSE to client    │    │ resume(runId) → replays checkpoint│ │  │
│  │   │ immediate runs   │    │ BullMQ-triggered runs           │ │  │
│  │   │ no persistence   │    │ Postgres state, survives restart  │ │  │
│  │   └────────┬─────────┘    └──────────────┬───────────────────┘ │  │
│  │            │                              │                      │  │
│  │            ▼                              ▼                      │  │
│  │   ┌───────────────────────────────────────────────┐             │  │
│  │   │         StreamingToolExecutor                  │             │  │
│  │   │   ┌─────────────────────────────────────┐    │             │  │
│  │   │   │ 1. Call Anthropic /v1/messages      │    │             │  │
│  │   │   │    SSE stream                        │    │             │  │
│  │   │   ├─────────────────────────────────────┤    │             │  │
│  │   │   │ 2. Accumulate tool_use blocks       │    │             │  │
│  │   │   │    as tokens arrive (non-blocking)  │    │             │  │
│  │   │   ├─────────────────────────────────────┤    │             │  │
│  │   │   │ 3. On message_stop: partition calls │    │             │  │
│  │   │   │    readTools[] (parallel)           │    │             │  │
│  │   │   │    writeTools[] (serial)           │    │             │  │
│  │   │   ├─────────────────────────────────────┤    │             │  │
│  │   │   │ 4a. Read tools: Promise.all       │    │             │  │
│  │   │   │     checkpoint before + after       │    │             │  │
│  │   │   ├─────────────────────────────────────┤    │             │  │
│  │   │   │ 4b. Write tools: serial loop       │    │             │  │
│  │   │   │     escalate if needs_approval      │    │             │  │
│  │   │   │     checkpoint before + after      │    │             │  │
│  │   │   ├─────────────────────────────────────┤    │             │  │
│  │   │   │ 5. Inject tool_result as user msg │    │             │  │
│  │   │   │    loop back to step 1             │    │             │  │
│  │   │   └─────────────────────────────────────┘    │             │  │
│  │   └───────────────────────────────────────────────┘             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                     │
│  ┌───────────────────────────────▼───────────────────────────────────┐  │
│  │                      TOOL LAYER                                   │  │
│  │                                                                   │  │
│  │   partitionToolCalls()          dispatchTool()                    │  │
│  │   splits read vs write         wires tool name → implementation   │  │
│  │                               ┌────────────────────────────────┐  │  │
│  │   CapabilityRegistry ─────────│ web.search  (real — stub)     │  │  │
│  │   hubspot.read/write stubs    │ llm        (real — OpenAI)   │  │  │
│  │                               │ gmail.*    (removed MVP)      │  │  │
│  │                               └────────────────────────────────┘  │  │
│  │                                                                   │  │
│  │   ┌──────────────────────────────────────────────────────────┐    │  │
│  │   │           Middleware Stack (per tool call)               │    │  │
│  │   │  abort signal → timeout → circuit breaker → retry → error│    │  │
│  │   │  Result: ToolResult { data, failed, retriesAttempted }  │    │  │
│  │   └──────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                     │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                     TRACING LAYER                                  │  │
│  │                                                                   │  │
│  │   TraceEmitter ──► EventBuffer ──► SSE stream ──► Canvas UI    │  │
│  │   HMAC-SHA256 signed events (per run secret)                    │  │
│  │   Emit: observation | classification | decision | action | warning  │  │
│  │                                                                   │  │
│  │   post-run reflection (fire-and-forget)                           │  │
│  │   → escalation suggestion evaluation                              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
   │  Postgres   │  │   BullMQ     │  │    Redis     │
   │  (state)   │  │  (jobs)      │  │  (job queue) │
   │             │  │              │  │              │
   │ agents      │  │ agent heart- │  │ BullMQ conn  │
   │ runs        │  │ beat sched-  │  │              │
   │ checkpoints │  │ uling       │  │              │
   │ approvals   │  │              │  │              │
   │ wires       │  │              │  │              │
   │ sessions    │  │              │  │              │
   └─────────────┘  └──────────────┘  └──────────────┘
```

---

## Component Responsibilities

### Runner Layer

#### `InProcessRunner` (`lib/runtime/runner.ts`)
Executes an `AgentGraph` synchronously via `execute(graph, callbacks)`. Used for immediate canvas runs triggered by the POST /api/run endpoint. Wires agent status, done, and error events to SSE. No checkpointing — fire and forget.

**Entry point:** `POST /api/run` (immediate mode)

#### `DurableRunner` (`lib/runtime/durable-runner.ts`)
Implements the `Runner` interface. Two methods:
- `execute(options)` — creates a `run` row, runs agents, checkpoints every step, returns `RunResult`
- `resume(runId)` — finds the first incomplete checkpoint, restores message state, re-executes

Used for BullMQ-triggered scheduled runs. Every state transition is checkpointed to Postgres before proceeding.

**Entry point:** BullMQ worker (`lib/scheduler/worker.ts`)

#### `StreamingToolExecutor` (`lib/runtime/streaming-tool-executor.ts`)
The core LLM loop. Stateless — receives `messages[]` array, returns updated `messages[]`. Called by `DurableRunner`.

**Algorithm:**
1. Call Anthropic streaming API with current `messages[]`
2. Accumulate `tool_use` SSE events as they arrive (parallel-safe — tools fire before LLM finishes reasoning)
3. On `message_stop`: partition tool calls via `partitionToolCalls()`
4. Execute read tools in `Promise.all`, write tools serially — each with pre/post checkpoints
5. Inject `tool_result` message block, loop back to step 1

**Exit reasons:** `completed` (no more tool calls), `approval_required` (write tool needs escalation), `aborted` (signal fired)

---

### Tool Layer

#### `partitionToolCalls()` (`lib/runtime/partition-tool-calls.ts`)
Queries `capabilityRegistry` for each tool's `isConcurrencySafe` flag. Splits into:
- `readTools[]` — parallel-safe, executed with `Promise.all`
- `writeTools[]` — must be serial, executed one-by-one

Unknown tools default to `writeTools` (safe default — serialization prevents race conditions).

#### `dispatchTool()` (`lib/runtime/streaming-tool-executor.ts`)
Maps a tool name to its implementation:
```
web.search  → webSearchTool() (real)
llm          → llmTool() (real, OpenAI)
hubspot.read → hubspotTool() (stub — Phase 2)
```
All other tools: look up via `capabilityRegistry.getToolDef()`, wrap with timeout + circuit breaker + retry, call `execute()`.

#### Middleware Stack (`lib/middleware/execute-tool.ts`)
Every tool call goes through:
```
AbortSignal check → Timeout → Circuit Breaker → Retry → Error Translation → ToolResult
```
`ToolResult` is always returned, never thrown. `retryable: boolean` field distinguishes retriable errors (network) from permanent failures.

#### Capability Registry (`lib/capability-registry/index.ts`)
Singleton. Registers: `web.search`, `hubspot.read`, `hubspot.write`, `llm.reason`, `distill.summarize`, `distill.notify`. Each `ToolDefinition` has:
- `isConcurrencySafe` — read vs write classification
- `isDestructive` — used for circuit breaker domain
- `permissionLevel` — `safe | needs_approval | admin_only`
- `execute(args, context)` — the actual implementation

---

### Tracing Layer

#### `TraceEmitter` (`lib/tracing/trace-emitter.ts`)
Per-agent, per-run. Methods: `emitObservation`, `emitClassification`, `emitDecision`, `emitAction`, `emitWarning`. Each event is HMAC-SHA256 signed with a per-run secret. Events flow to `EventBuffer` + SSE simultaneously.

#### `EventBuffer` (`lib/tracing/event-buffer.ts`)
Per-run in-memory buffer. Holds unsent events for clients that connect late to the SSE stream. Max 1000 events per run.

#### SSE Stream (`lib/tracing/sse-stream.ts`)
`emitToRunChannel(runId, event)` fans out to all connected SSE clients subscribed to that run. Uses a `Map<runId, Set<WritableStream>>`.

#### Event Schema (`lib/tracing/event-schema.ts`)
Discriminated union types for all reasoning events:
- `observation` — "Checking inbox..."
- `classification` — "This is a lead inquiry" (confidence 0.87)
- `decision` — alternatives considered, chosen, reason
- `action` — tool call fired, args, result
- `warning` — rate limit approaching, error
- `approval_required` — escalation modal triggered
- `approval_resolved` — user decision logged
- `status` — transient thinking state
- `done` — run complete summary
- `error` — tool failure

---

### Scheduler Layer

#### BullMQ Worker (`lib/scheduler/worker.ts`)
Single worker, `concurrency: 1` per agent. On startup: calls `recoverInterruptedRuns()` before accepting jobs.

#### Startup Recovery (`lib/runtime/startup-recovery.ts`)
On server boot: finds all `runs` with `status = 'running'`, calls `DurableRunner.resume(runId)` for each. Marks unrecoverable runs as `failed`.

#### Scheduler Client (`lib/scheduler/client.ts`)
- `scheduleAgent(agentId, cronExpression)` — upsert job scheduler (idempotent)
- `cancelSchedule(agentId)` — remove job scheduler

Job scheduler pattern uses BullMQ's Redis-based cron — survives server restarts. Jobs are persistent by default.

---

### Data Layer

#### DB Schema (`lib/db/queries.ts`)

| Table | Purpose |
|-------|---------|
| `users` | Maria's account |
| `sessions` | Auth sessions (magic link) |
| `agents` | Agent configs: name, role, archetype, tools, schedule, budget |
| `runs` | Run records: agent_id, user_id, status, session_id, timestamps |
| `checkpoints` | Every state transition: state_before, state_after, tool_result, tool_call_id |
| `approvals` | Pending escalation records: run_id, tool_name, args, status |
| `working_memory` | Per-session key-value store |
| `escalation_suggestions` | Post-run reflection output: type, proposal, confidence |
| `wires` | Canvas connections: from_agent_id → to_agent_id |
| `gmail_tokens` | OAuth tokens per user (preserved, Gmail removed from MVP) |
| `credentials` | Encrypted generic token storage |

**Append-only tables:** `checkpoints` — no UPDATE/DELETE. `escalation_suggestions` — no UPDATE/DELETE. These form the immutable audit trail.

---

## Data Flow: Canvas Run

### Immediate Run (Maria clicks "Run")

```
Maria clicks "Run"
  → POST /api/run { graph }
  → InProcessRunner.execute(graph, callbacks)
  → SSE connection opened to client
  → For each agent (max 2 concurrent):
      → createTraceEmitter(runId, agentId)
      → if tools includes web.search:
           executeTool('web.search', args, webSearchTool)
           trace.emitAction(...)
           emit SSE 'status' event
      → if tools includes llm:
           executeTool('llm', args, llmTool)
           trace.emitAction(...)
           emit SSE 'status' event
  → SSE 'done' event → controller.close()
  → Client sees full reasoning trace in real-time
```

### Scheduled Run (Heartbeat fires)

```
BullMQ heartbeat fires (cron)
  → POST /api/run { route: 'scheduled', agentId, userId }
  → DurableRunner.execute({ agentId, userId, sessionId })
  → createRun({ agent_id, userId })  ← 'running' status
  → For each agent:
      → createCheckpoint(run_id, step, state_before)
      → StreamingToolExecutor(messages, tools, onEvent)
          → Anthropic SSE
          → tool calls partitioned (reads parallel, writes serial)
          → for each read tool:
               checkpoint before
               dispatchTool()
               checkpoint after (tool_result stored)
          → for each write tool:
               if permissionLevel === 'needs_approval':
                   emit approval_required event
                   return { stopReason: 'approval_required' }
               checkpoint before
               dispatchTool()
               checkpoint after
          → tool_result injected as user message, loop
      → createCheckpoint(run_id, step, state_after, completed=true)
      → emit SSE status event
  → updateRunStatus(runId, 'completed')
  → postRunReflection(runId)  ← fire-and-forget
  → push notification (fire-and-forget)
```

### Resume After Server Restart

```
Server starts
  → BullMQ worker.startWorker()
  → recoverInterruptedRuns()
      → SELECT * FROM runs WHERE status = 'running'
      → for each interrupted run:
           DurableRunner.resume(runId)
               → getCheckpointsForRun(runId)
               → find first checkpoint where state_after IS NULL
               → restore { agentId, messages }
               → StreamingToolExecutor(resumed_messages, ...)
               → continues from interruption point
```

---

## Key Interfaces

### Runner Interface
```typescript
interface RunResult {
  runId: string
  status: 'completed' | 'failed' | 'waiting_for_approval'
  finalState?: { pendingApprovals: Approval[] }
  error?: string
}

interface ExecuteOptions {
  agentId: string
  userId: string
  sessionId: string
  args?: Record<string, unknown>
}

interface Runner {
  execute(options: ExecuteOptions): Promise<RunResult>
  resume(runId: string): Promise<RunResult>
}
```

### Tool Result
```typescript
interface ToolResult {
  data: unknown
  partialData: boolean      // true if retries were needed
  attemptSucceededOn: number | null
  llmMessage: string        // safe to show to LLM on retry
  userMessage: string       // safe to show to Maria
  failed: boolean
  errorCode?: string
  retriesAttempted: number
}
```

### Reasoning Event (Trace)
```typescript
type ReasoningEvent =
  | { type: 'status'; agentId; status: string; message?: string }
  | { type: 'action'; agentId; tool: string; args?: Record<string,unknown>; status: 'running' | 'completed'; result?: unknown }
  | { type: 'approval_required'; agentId; tool: string; args: Record<string,unknown> }
  | { type: 'done'; agentId; message?: string }
  | { type: 'error'; agentId; tool?: string; error: string }
```

### Agent Graph
```typescript
type AgentGraph = {
  agents: Array<{
    id: string
    role: AgentRole          // 'llm' | 'escalation_triage' | 'lead_researcher' | ...
    tools: string[]           // ['web.search'] | ['llm'] | ['web.search', 'llm']
    name: string
    description: string
  }>
  connections: Array<{
    from: AgentId
    to: AgentId
  }>
}
```

---

## MVP Status

### Built (Phase 1 Foundation)

| Component | Status | Notes |
|-----------|--------|-------|
| StreamingToolExecutor | ✅ Complete | SSE from Anthropic, tool partitioning, checkpointing |
| DurableRunner | ✅ Complete | execute + resume, Postgres checkpoints |
| executeTool middleware | ✅ Complete | timeout, circuit breaker, retry, error translation |
| partitionToolCalls | ✅ Complete | read/write split via capability registry |
| TraceEmitter + SSE | ✅ Complete | HMAC-signed reasoning events, real-time canvas |
| BullMQ worker | ✅ Partial | Works but needs reliability hardening |
| Startup recovery | ✅ Complete | `recoverInterruptedRuns()` on boot |
| postRunReflection | ✅ Complete | Fire-and-forget, fires escalation suggestions |
| Magic link auth | ✅ Complete | Session-based, works |
| NL → Canvas interpret | ✅ Partial | Calls GPT-4o, returns graph, no DB persistence |
| Canvas wire API | ❌ Missing | No `POST /api/canvas/wires`, no cycle detection |
| Real web search | ⚠️ Stub | Returns fake results, no real API |
| Real LLM tool | ✅ Real | OpenAI GPT-4o |
| HubSpot connector | ⚠️ Stub | Registered, returns `{}` |
| Push notifications | ❌ Missing | Route exists, Pushover not wired |
| Agent card | ❌ Missing | Frontend only |
| Activity log | ❌ Missing | Route/page not built |
| Escalation modal actions | ⚠️ Partial | Approve works, Edit/Skip/Cancel not fully wired |

### Priority Gaps for MVP

**P0 — Cannot ship without:**
1. **Canvas wire API** — `POST /api/canvas/wires` + DB persistence + cycle detection. Without this, agents can't pass work between nodes.
2. **Real web search** — Replace stub with actual API (Brave Search, SerpAPI, or similar). Stub makes the product look broken.

**P1 — MVP quality:**
3. **Push notifications** — Escalations need to reach Maria via Pushover. Without this, she has to keep the app open.
4. **TracePanel component** — The reasoning trace needs a collapsible panel in the canvas UI so Maria can watch her agent think.

**P2 — Good to have:**
5. **Agent card** — Status/budget visible on canvas node
6. **Activity log** — Searchable history
7. **NL → Canvas wiring** — Actually persist the interpreted graph as agents in the DB

---

## Design Principles

**1. Streaming is the trust interface.**
Maria watches her agent think in real time. Every tool fire is visible before the LLM finishes reasoning. This is not a UX nicety — it is how trust is built.

**2. Every tool call is checkpointed.**
Server death mid-run means resume from last complete step. ULID idempotency keys prevent double execution. This is not optional.

**3. The runner is stateless; state lives in Postgres.**
`StreamingToolExecutor` is a pure function `messages[] → messages[]`. All durability is in `DurableRunner` + Postgres. This means the runner can crash and restart without losing work.

**4. Write tools are serial, read tools are parallel.**
Enforced by `partitionToolCalls()` at the executor level, not per-tool. A write tool that would be safe to parallelize must declare `isConcurrencySafe: true` — otherwise it gets serialized. Default is safe.

**5. Escalation is a first-class typed exit reason.**
`approval_required` is not an error — it is a state machine transition. The run pauses, Maria decides, and the run resumes. It is structurally different from `failed`.

**6. postRunReflection is fire-and-forget.**
It must never block the run completion response. Escalation suggestions are stored in Postgres; Maria sees them in the Activity Log or as push notifications. If the reflection service is slow, Maria still gets her run result immediately.

---

## References

- **PRD:** `docs/PRD.md`
- **Harness Architecture Reference:** `docs/harness-architecture-reference.md` (Claude Code → AgentOS adaptation)
- **Capability Registry Spec:** `docs/ARCHITECTURE-01-capability-registry.md`
- **Reasoning Trace Spec:** `docs/ARCHITECTURE-05-reasoning-trace.md`
- **Escalation Suggestions Spec:** `docs/ARCHITECTURE-06-escalation-suggestions.md`
- **Execution State:** `.claude/execution-state.json`
