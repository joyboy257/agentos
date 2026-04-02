# Plan: Full-Stack Build — Backend + Frontend

**Date:** 2026-04-02
**Type:** feat
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v5.1

---

## Purpose

This is a phase-by-phase execution plan for building AgentOS v5.1 — both the frontend (canvas UI + agent UX) and the backend (durable execution engine, agent harness, integrations).

**Backend first.** The frontend is the visible surface, but it is worthless without a reliable backend. The backend carries the most risk (LLM reliability, durable execution, tool concurrency). We build it first and ship it early so the frontend team has a real API to work against.

---

## Architecture Overview

### Frontend (Canvas + Agent UX)

```
React (Next.js)
├── React Flow — infinite canvas, nodes, wires
├── Design System v2 — tokens, components
├── SSE — real-time reasoning traces
└── NL Prompt Bar — natural language canvas control
```

### Backend (Agent Harness + Durable Execution)

```
Node.js / TypeScript
├── BullMQ + Redis — job queue, scheduling, heartbeat
├── Postgres — agents, runs, checkpoints, traces
├── LLM Provider (Anthropic) — Claude for reasoning
├── Tool System — concurrency-safe, permission-gated
├── Streaming Tool Executor — fire tools during LLM stream
├── Capability Registry — structured catalog of capabilities
├── MCP Client — Gmail, HubSpot, Calendar integrations
└── NL Interpreter — goal → pipeline mapping
```

### Backend Architecture (Claude Code Patterns Applied)

Claude Code's harness is the engineering reference. We adapt its key patterns:

| Claude Code Pattern | AgentOS Implementation |
|---------------------|------------------------|
| `query()` async generator loop | `DurableRunner.execute()` with typed exit reasons |
| `partitionToolCalls()` (read parallel / write serial) | Gmail read → parallel, Gmail send → serial |
| `StreamingToolExecutor` | Tools fire during LLM stream, Maria sees thinking |
| `Tool<Input, Output>` with Zod | Capability as typed tool with `isConcurrencySafe()` |
| `withRetry()` + circuit breaker | LLM API calls wrapped in retry with exponential backoff |
| Feature flags (`feature()`) | `features.ts` config map |
| Skills directory | Template agents as markdown skill files |
| Sidechain transcripts | Per-worker reasoning trace isolation |
| Fork subagent pattern | Team Lead → Workers delegation |
| Bridge/heartbeat protocol | BullMQ job lifecycle + Postgres heartbeat |

---

## Phase 1: Foundation (Backend Core) — Weeks 1–4

**Goal:** Get a durable execution engine working end-to-end. A single worker agent can be hired, can run, can be interrupted, and resumes after server restart. This is the hardest part — prove it before building anything else.

### Phase 1A: Durable Runner + Checkpointing

**Backend — Most Critical Path**

```
1. DurableRunner.execute() — async generator, typed exit reasons
   ├── 'completed' — ran successfully
   ├── 'escalated' — needs Maria decision
   ├── 'budget_exceeded' — token/time budget hit
   └── 'stopped' — Maria or system stopped it
2. Checkpoint system
   ├── On every tool call: write checkpoint to Postgres
   ├── State: { run_id, step_count, messages, tool_results, created_at }
   ├── Resume: reload checkpoint, continue from last tool call
3. Run table (Postgres)
   ├── id, agent_id, status, exit_reason, started_at, completed_at
   ├── step_count, total_tokens, escalation_count
   └── checkpoint_data (JSONB)
```

**Exit reason schema:**
```typescript
type ExitReason = 'completed' | 'escalated' | 'budget_exceeded' | 'stopped';
```

**Checkpoint schema:**
```typescript
interface RunCheckpoint {
  run_id: string;
  step: number;
  messages: Message[];
  tool_results: ToolResult[];
  created_at: string;
}
```

**Test:** Server dies mid-run → restart → run resumes from last checkpoint.

### Phase 1B: Tool System + Concurrency Safety

**Backend — Highest-Risk Integration**

```
1. Tool interface (TypeScript)
   ├── Input: Zod schema
   ├── Output: typed result
   ├── isConcurrencySafe: boolean  // read vs write
   ├── isReadOnly: boolean
   └── permissionLevel: 'safe' | 'needs_approval' | 'admin_only'
2. Gmail tools
   ├── gmail__read_email — isConcurrencySafe: true
   ├── gmail__send_email — isConcurrencySafe: false
   └── isDestructive: true on send
3. partitionToolCalls() — separates reads (parallel) from writes (serial)
4. Permission escalation
   ├── If tool.needs_approval: pause run, emit 'escalated', send push
   └── Resume only after Maria responds
```

**Key pattern from Claude Code:**
```typescript
// StreamingToolExecutor fires tools as LLM streams them
// Maria sees "drafting email..." before full reasoning is done
async function* streamingExecute(llmStream, tools) {
  for await (const chunk of llmStream) {
    yield chunk;
    if (chunk.tool_calls) {
      const { readTools, writeTools } = partitionToolCalls(chunk.tool_calls);
      yield* runToolsConcurrently(readTools);  // parallel
      yield* runToolsSerially(writeTools);      // serial
    }
  }
}
```

### Phase 1C: BullMQ Job Queue + Scheduling

**Backend — Infrastructure**

```
1. Queues
   ├── 'agent-runs' — per-agent run jobs
   ├── 'scheduled-runs' — cron-triggered jobs
   └── 'escalations' — pending Maria decisions
2. Worker lifecycle
   ├── Pick up job → load checkpoint → execute → checkpoint → repeat
   ├── Heartbeat: update run.heartbeat_at every 30s
   └── Max job duration: 10 minutes before auto-checkpoint
3. Scheduled agents
   ├── Cron expressions per agent (e.g., "every weekday 9am")
   ├── BullMQ repeatable jobs
   └── agent.next_wake = next cron fire time
```

### Phase 1D: Reasoning Trace Streaming (SSE)

**Backend → Frontend — Real-Time Visibility**

```
1. Trace emission
   ├── Every step: emit SSE event { type, step_id, timestamp, data }
   ├── Types: 'tool_call', 'tool_result', 'decision', 'escalate', 'completed', 'error'
   ├── Buffer: 500ms aggregation window
   └── Max 500 rendered events with virtual scrolling
2. SSE endpoint
   ├── GET /api/runs/[runId]/stream
   └── Frontend subscribes, receives real-time step events
3. Trace storage
   ├── Postgres: run_steps(run_id, step_id, type, data, timestamp)
   ├── 30-day retention (standard), 90-day (flagged)
   └── Nightly cron deletes expired traces
```

**Key pattern from Claude Code:** `ServerEvent` types (AGENT_READY, AGENT_ENDED, RESPONSE_CREATED, ERROR) with is_last_chunk flags enable real-time UI updates without polling.

### Phase 1 Deliverables

- [ ] Single agent can run, checkpoint, resume after restart
- [ ] Tool system with Gmail read/send (parallel/serial)
- [ ] BullMQ scheduling works (cron jobs fire at correct times)
- [ ] SSE streaming trace works (frontend can subscribe)
- [ ] Escalation pauses run, resumes after Maria responds
- [ ] Error states surface clearly (retry, circuit breaker)

---

## Phase 2: Capability Registry + NL Interpretation — Weeks 3–6

**Goal:** Build the structured capability catalog. NL layer queries it to map Maria's goal to actual capabilities. This is the core algorithm — it must work reliably.

### Phase 2A: Capability Registry

**Backend — Structured Catalog**

```
1. Capability schema
   ├── id, name, description, archetype (ingest/process/distill)
   ├── trigger_phrases: string[]  // for NL matching
   ├── input_schema: JSONSchema
   ├── output_schema: JSONSchema
   ├── tools: ToolReference[]
   ├── needs_approval: boolean
   └── permission_level: 'safe' | 'needs_approval' | 'admin_only'
2. Built-in capabilities
   ├── ingest/gmail_read — trigger: "read emails", "check inbox"
   ├── ingest/hubspot_leads — trigger: "get leads", "pull CRM"
   ├── process/filter — trigger: "filter", "find", "identify"
   ├── process/draft_email — trigger: "draft", "compose", "write"
   ├── distill/summarize — trigger: "summarize", "report"
   └── distill/notify — trigger: "notify", "alert", "tell me"
3. NL matching
   ├── Embed trigger_phrases
   ├── On goal: semantic search over triggers → ranked capabilities
   └── Return top 5 candidates with confidence scores
```

### Phase 2B: NL-to-Canvas Interpreter

**Backend — Goal → Pipeline Mapping**

```
1. NL interpretation API
   POST /api/canvas/nl-to-canvas
   {
     goal: "follow up with leads who haven't replied in 7 days",
     existing_nodes: [...],
     capabilities: [...]
   }
   →
   {
     nodes_to_add: [{ type: 'worker', archetype: 'ingest', name: '...', tools: [...] }],
     wires_to_create: [{ from: 'lead-research', to: 'follow-up-email' }],
     explanation: "I'll add a HubSpot ingest worker to read leads, ..."
   }
2. Prompt engineering
   ├── System prompt: "You are an agent pipeline designer..."
   ├── Few-shot examples of goal → pipeline mappings
   └── Claude Sonnet 4 for interpretation (fast, cost-effective)
3. Canvas state API
   ├── GET /api/canvas — full canvas state (nodes, wires, positions)
   ├── POST /api/canvas/nodes — add node
   ├── DELETE /api/canvas/nodes/[id] — remove node
   ├── POST /api/canvas/wires — create wire
   └── DELETE /api/canvas/wires/[id] — remove wire
```

### Phase 2 Deliverables

- [ ] Capability registry queryable by semantic match
- [ ] NL interpretation returns valid node additions from natural language
- [ ] Canvas state persists to Postgres
- [ ] Explanation returned in plain English

---

## Phase 3: Team Lead Coordinator — Weeks 5–8

**Goal:** Team Lead is a real full-LLM agent. It watches workers, assigns tasks, routes escalations. This is the Paperclip CEO pattern implemented.

### Phase 3A: Team Lead Agent

**Backend — Coordinator**

```
1. Team Lead as LLM agent
   ├── Own context, own reasoning, own tools
   ├── System prompt: "You are Maria's team lead. You coordinate workers..."
   ├── Tools: assign_task, monitor_worker, escalate_to_maria, aggregate_output
   └── Receives all worker outputs via SSE
2. Worker delegation
   ├── Team Lead decides: which worker handles which subtask
   ├── Fan-out: one task → multiple workers in parallel
   ├── Fan-in: multiple workers → Team Lead aggregates
   └── Wire connections define the data flow
3. Escalation flow
   ├── Worker hits approval threshold → escalates to Team Lead
   ├── Team Lead reviews → either approves or routes to Maria
   └── Maria always gets final say on admin-level decisions
```

### Phase 3B: Worker Sandbox

**Backend — Isolation**

```
1. Each worker is isolated
   ├── Own LLM context (messages array)
   ├── Own tool set (defined by archetype)
   ├── Cannot see other workers' reasoning directly
   └── Receives inputs via Team Lead assignment
2. Worker types
   ├── Ingest workers: read from external sources
   ├── Process workers: transform, decide, draft
   └── Distill workers: summarize, report, notify
3. Wire as data carrier
   ├── Wire carries output artifact (structured data)
   ├── Not context — workers stay decoupled
   └── Team Lead routes artifacts between workers
```

### Phase 3 Deliverables

- [ ] Team Lead is a visible full-LLM agent on canvas
- [ ] Team Lead can assign tasks to workers
- [ ] Team Lead can escalate to Maria
- [ ] Workers are isolated; output flows through Team Lead

---

## Phase 4: Frontend — Canvas UI — Weeks 4–10

**Frontend — UI parallel to backend, fed by mock APIs initially**

### Phase 4A: Canvas Foundation (React Flow)

```
1. Infinite canvas (Unit 1 from canvas UI plan)
   ├── React Flow viewport with pan/zoom
   ├── Dot grid background
   ├── Minimap
   └── 25%–200% zoom range
```

### Phase 4B: Node Components

```
2. Team Lead node (purple, crown icon)
   ├── Shows team status, not individual task stats
   └── View Reasoning → shows coordination decisions
3. Worker nodes (indigo, archetype-colored badge)
   ├── Draggable, connectable
   ├── Status badge (running/scheduled/stopped/error/waiting)
   └── Archetype chip (Ingest/Process/Distill)
```

### Phase 4C: Wires + Archetype Sidebar

```
4. Wire connections
   ├── Bezier curves, color-coded by state
   ├── Active pulse animation
   └── Click to delete
5. Archetype sidebar (left, collapsible)
   ├── Three sections: Ingest, Process, Distill
   ├── Draggable chips → drop on canvas → creates node
   └── Collapses to 48px icon strip
```

### Phase 4D: NL Prompt Bar + Reasoning Trace

```
6. NL prompt bar (bottom center, pill-shaped)
   ├── ⌘K global shortcut
   ├── Submits to /api/canvas/nl-to-canvas
   └── Shows "Building..." state with animation
7. Reasoning trace panel (right, 480px)
   ├── Real-time step updates via SSE polling
   ├── Escalation modal with Approve/Edit/Cancel
   └── "Jump to latest" when scrolled up
```

### Phase 4 Deliverables

- [ ] Canvas loads with Team Lead visible
- [ ] Workers can be added via drag or NL prompt
- [ ] Wires connect nodes
- [ ] Reasoning trace streams in real time
- [ ] Escalation cards appear and respond correctly

---

## Phase 5: Integration + Polish — Weeks 8–12

**Goal:** Everything works end-to-end. Maria can hire an agent, watch it work, and trust it.

### Phase 5A: End-to-End Flow

```
1. Full user flow
   ├── Maria logs in (magic link auth)
   ├── Canvas shows Team Lead (empty team)
   ├── Types goal in NL prompt bar
   ├── Canvas updates with workers + wires
   ├── Reviews and adjusts (drag, reconnect, edit)
   ├── Activates team
   ├── Watches reasoning trace in real time
   └── Receives push notification on escalation
```

### Phase 5B: Error Handling + Reliability

```
2. Error states
   ├── Node error → red border + one-line message
   ├── Wire error → red wire to downstream
   ├── Partial failure → upstream completes, downstream shows waiting
   └── Retry button on failed nodes
3. Retry middleware
   ├── 3 retries on transient failures
   ├── Exponential backoff (1s, 2s, 4s)
   └── Log warning, continue on persistent failure
```

### Phase 5C: GDPR + Compliance

```
4. Trace retention
   ├── 30-day standard, 90-day flagged
   ├── Nightly cron job: DELETE FROM run_steps WHERE created_at < cutoff
   └── Retention enforced by infrastructure, not convention
```

### Phase 5 Deliverables

- [ ] Full hire → activate → watch → escalate → trust flow
- [ ] Error states are clear and actionable
- [ ] Traces auto-delete after retention period
- [ ] Push notifications reach Maria on escalation

---

## Sequencing Diagram

```
BACKEND TIMELINE
─────────────────────────────────────────────────────────────
Week 1-2   Phase 1A: DurableRunner + Checkpointing
Week 2-3   Phase 1B: Tool System + Concurrency
Week 3     Phase 1C: BullMQ + Scheduling
Week 3-4   Phase 1D: SSE Reasoning Traces
Week 3-6   Phase 2A: Capability Registry
Week 4-6   Phase 2B: NL Interpretation API
Week 5-8   Phase 3: Team Lead Coordinator

FRONTEND TIMELINE
─────────────────────────────────────────────────────────────
Week 4-5   Phase 4A: Canvas Foundation (React Flow)
Week 5-6   Phase 4B: Node Components
Week 6-7   Phase 4C: Wires + Archetype Sidebar
Week 7-9   Phase 4D: NL Prompt Bar + Reasoning Trace
Week 8-12  Phase 5: End-to-End Integration + Polish
```

**Parallelization:** Frontend weeks 4-6 can run concurrently with Backend weeks 3-6 using mock API servers. Frontend is unblocked early by building against mocked endpoints.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM reliability (hallucination, timeout) | High | Retry middleware, circuit breaker, budget caps |
| NL interpretation quality | High | Invest in prompt engineering; fallback to archetype-only |
| Durable execution checkpoint bugs | Critical | Test server death mid-run; extensive edge case coverage |
| Tool concurrency (Gmail send while reading) | High | `isConcurrencySafe()` partitioning; no bypass |
| Escalation loop (worker escalates repeatedly) | Medium | Circuit breaker: 3 escalations → pause → alert Maria |
| Canvas performance at 50+ nodes | Low | React Flow virtualization; test at scale early |
| MCP OAuth token refresh | Medium | Follow Claude Code lockfile pattern; 15-min TTL |

---

## What to Build vs What to Steal

| Component | Source |
|-----------|--------|
| DurableRunner with typed exit reasons | Own implementation (harness-architecture-reference.md) |
| Tool system with isConcurrencySafe | Steal from Claude Code `Tool.ts` + `StreamingToolExecutor.ts` |
| partitionToolCalls (read/write partitioning) | Steal from Claude Code `toolOrchestration.ts` |
| withRetry + exponential backoff | Steal from Claude Code `withRetry.ts` |
| SSE reasoning trace streaming | Steal from Claude Code ServerEvent pattern |
| Feature flags (features.ts) | Steal from Claude Code `feature()` pattern |
| BullMQ job queue + scheduling | Own implementation |
| Postgres checkpoint/resume | Own implementation |
| Capability Registry | Own implementation |
| NL interpretation prompt | Own engineering + prompt tuning |
| Team Lead coordinator agent | Own implementation (Paperclip CEO pattern) |
| React Flow canvas | Third-party (MIT) |
| Design System v2 | Own implementation |

---

## Success Criteria

1. **Backend:** Server can crash mid-run and resume from checkpoint without data loss
2. **Backend:** Gmail read is parallel, Gmail send is serial — verified by concurrent tool execution
3. **Backend:** NL interpretation maps "follow up with leads" to HubSpot ingest + filter + Gmail send
4. **Frontend:** Canvas renders 20+ nodes without jank
5. **Frontend:** NL prompt bar updates canvas in under 5 seconds
6. **E2E:** Maria hires an agent in under 10 minutes and it works while she sleeps
