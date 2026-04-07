---
title: feat: Phase 3 — Multi-agent Orchestration & Tool Gateway
type: feat
status: active
date: 2026-04-07
---

# Phase 3 — Multi-Agent Orchestration & Tool Gateway

## Overview

Phase 3 makes AgentOS a multi-agent platform: James (marketing manager) runs a 3-agent team (research → draft → review) that processes work autonomously, with HubSpot and Slack connectors wired through a clean tool gateway. Three technical bets drive this: (1) Vercel AI SDK replaces raw SSE parsing, (2) BullMQ parent-child jobs replace in-process fan-out, (3) a provider registry replaces per-tool hardcoded dispatch.

## Problem Frame

AgentOS Phase 1-2 is single-coordinator, single-agent execution. The `DurableRunner` fans out to at most 2 concurrent agents, all in-process, all sharing the Node.js event loop. A marketing team workflow (research → draft → review) requires distributed, durable, observable orchestration — where each agent can fail, retry, and be inspected independently.

Additionally, tool dispatch is hardcoded per tool name in `dispatchTool()`. Adding HubSpot or Slack requires a code change per tool. A gateway pattern makes connectors declarative.

## Requirements Trace

- R1. Coordinator agent → parallel workers via BullMQ parent-child jobs; workers survive server restarts
- R2. Typed exit reasons on parent jobs reflect child outcomes (`child_failed`, `child_timed_out`, `partial_completion`)
- R3. James can inspect any agent's reasoning trace independently via `/runs/[runId]/trace`
- R4. HubSpot connector reads/leads via OAuth; Slack sends summaries via bot token
- R5. Tool gateway: connectors declared in `lib/connectors/`, registered via `capabilityRegistry.registerCapability()`
- R6. Slack OAuth and HubSpot OAuth are first-class auth flows (like Gmail)

## Scope Boundaries

- **Not in Phase 3:** Remote bridge (enterprise isolation), agent marketplace, full Calendar integration
- **Not replacing:** existing heartbeat cron BullMQ queue (`agentos-heartbeats`) — parent-child is additive
- **Not changing:** PROACTIVE Gmail push webhook flow
- **Human-in-the-loop constraint:** per `harness-architecture-reference.md`, James is always in the loop as coordinator. Workers escalate to James, not to each other. Phase 3 is hierarchical, not peer-to-peer.

## Context & Research

### Relevant Code and Patterns

| Pattern | File | Phase 3 Role |
|---------|------|-------------|
| In-process fan-out | `lib/runtime/durable-runner.ts` lines 96-122 | Template for parent job orchestration loop |
| SSE parsing | `lib/runtime/streaming-tool-executor.ts` lines 270-329 | Replaced by Vercel AI SDK `streamText` |
| Tool dispatch | `lib/runtime/streaming-tool-executor.ts` lines 79-109 | Refactored to provider registry |
| Reliability middleware | `lib/middleware/execute-tool.ts` | Preserved through SDK migration |
| Capability registry | `lib/capability-registry/index.ts` | Tool registration entry point |
| Classifier | `lib/classifier/transcript-classifier.ts` | Gates `needs_approval` tool calls |
| ULID idempotency | `lib/runtime/idempotency.ts` | Child job idempotency keys |
| Checkpoint/resume | `lib/db/queries.ts` `createCheckpoint` | Parent and child job state |
| BullMQ worker | `lib/scheduler/worker.ts` | Parent job processor |
| Two queues | `lib/runtime/proactive-queue.ts` | Additive to existing queues |
| MCP client | `app/lib/mcp/mcp-client.ts` | OAuth + token refresh pattern for connectors |

### BullMQ Tooling Versions

- BullMQ `^5.71.1`, ioredis `^5.10.1`
- `FlowProducer` for parent-child job trees
- `moveToWaitingChildren` + `WaitingChildrenError` for fork/join state machine
- Child jobs use same Redis connection as parent

### Institutional Learnings

1. **Checkpoint fires after every tool call, not after every LLM turn.** If server dies mid-tool-call, resume must re-execute it. Applies to child jobs: a child that crashes mid-tool-call must restart from that tool, not from the beginning of the step.
2. **RetryBudget token bucket** (`ARCHITECTURE-03-reliability-middleware.md`): when multiple concurrent agents hit a 429, they must decorrelate via shared retry budget. Applies to HubSpot and Slack calls across parent and child jobs.
3. **Raw API errors must never reach the LLM.** Error translation (`translateToolError`) is essential for Phase 3 connectors.
4. **Claude Code's autonomous coordinator is ruled out.** Phase 3 keeps James in the loop as hierarchical coordinator. Workers escalate to James.
5. **HubSpot tool implementations are stubs.** Phase 3 implements the real connector using the tool gateway pattern.
6. **MCP client infrastructure exists** (`app/lib/mcp/mcp-client.ts`): OAuth handshake, token refresh, manifest caching. Use as template for HubSpot and Slack OAuth flows.

### External References

- Vercel AI SDK `streamText` + `agent.stream()` — replaces raw SSE parsing
- BullMQ `FlowProducer` + `moveToWaitingChildren` — distributed parent-child orchestration
- `gateway.tools.*` pattern from Vercel AI SDK providers — tool provider registry design

## Key Technical Decisions

- **Vercel AI SDK migration is evolutionary, not a rewrite.** The `streamingToolExecutor` SSE loop (lines 270-329) is replaced with `streamText` from `ai`. All surrounding infrastructure — checkpointing, budget enforcement, classifier, idempotency, reliability middleware — is preserved and called from within SDK callbacks.
- **Parent BullMQ job replaces `execute()` loop.** The in-process `while (queue.length > 0 || running.size < 2)` in `DurableRunner.execute()` becomes a single BullMQ parent job. Child jobs are dispatched via `FlowProducer`. Parent job resumes from `moveToWaitingChildren` when all children complete.
- **Child job idempotency keys include parent context.** Key format: `agent:{agentId}:run:{runId}:child:{childId}:step:{step}`. Prevents duplicate child execution on parent resume.
- **Tool gateway uses `registerCapability()` not a new abstraction.** Each connector (hubspot, slack) exports its capability + tool defs and calls `capabilityRegistry.registerCapability()` at startup. `dispatchTool` looks up tools in the registry, not by hardcoded name.
- **HubSpot and Slack OAuth follow the Gmail pattern.** `credentials` table already exists (`006_credentials_table.sql`). Each connector gets an `/api/connectors/[provider]/route.ts` OAuth route pair.

## Open Questions

### Deferred to Implementation

1. **Vercel AI SDK checkpoint integration:** Can `streamText` callbacks (`onStepFinish`, `onFinish`) intercept individual tool calls to fire checkpoints mid-stream? If not, we may need to keep a thin SSE shim that calls `streamText` internally while emitting checkpoint events.
2. **Child job result serialization:** `tool_result` in checkpoints is JSON. BullMQ child job results may contain non-serializable values (Error objects, circular refs). Need to verify serialization path.
3. **Parent job timeout:** If a child job hangs indefinitely, `moveToWaitingChildren` may never return. Need a parent-level timeout via `job.moveToDelayed()` + `DelayedError` as a failsafe.
4. **HubSpot API rate limits:** Whether HubSpot's rate limit headers require a shared token bucket across jobs, or per-connection-token.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

### 3A: Vercel AI SDK Migration

```
streamingToolExecutor (before)
┌──────────────────────────────────────────────────────┐
│ while(true):                                         │
│   1. fetch /v1/messages (stream:true)              │
│   2. SSE loop: parse content_block_delta, tool_use  │
│   3. partition tool calls: reads || writes            │
│   4. read tools: Promise.all (parallel)              │
│   5. write tools: serial, with classifier gate       │
│   6. inject tool results as user message            │
│   7. checkpoint before/after each tool call          │
└──────────────────────────────────────────────────────┘

streamingToolExecutor (after — SDK)
┌──────────────────────────────────────────────────────┐
│ streamText({                                         │
│   model, messages, tools, systemPrompt,               │
│   onStepFinish: checkpoint, emit reasoning event,    │
│   onToolCallFinish: classifier gate, dispatch,      │
│   onFinish: return typed result                       │
│ })                                                   │
│   ↓                                                 │
│ Result: { messages, finishReason, usage, steps }    │
└──────────────────────────────────────────────────────┘
```

The key question is whether Vercel AI SDK's tool callbacks fire per individual tool call (matching the current per-tool checkpoint granularity) or per LLM turn. If per turn, checkpoint granularity changes — implementation must verify before committing.

### 3B: BullMQ Distributed Orchestration

```
James (human coordinator)
    │
    │ BullMQ parent job: "coordinator"
    │ step=0: enqueue children, moveToWaitingChildren
    │
    ├──→ BullMQ child job: "research-agent"
    │       step=1-N: streamingToolExecutor per step
    │
    ├──→ BullMQ child job: "draft-agent"  (after research)
    │       step=1-N: streamingToolExecutor per step
    │
    └──→ BullMQ child job: "review-agent" (after draft)
            step=1-N: streamingToolExecutor per step

On child completion:
  - Parent job resumes via WaitingChildrenError
  - Parent checks all children: if any failed → typed exit reason
  - If all succeeded → aggregate results, escalate or complete
```

Child job checkpoint state is written to the same `checkpoints` table with `run_id` = parent run id and `child_job_id` = child's BullMQ job id. This makes the full multi-agent trace queryable via the existing `/runs/[runId]/trace` endpoint.

### 3C: Tool Gateway

```
dispatchTool (before)          dispatchTool (after)
────────────────────           ──────────────────────────────
if (tool === 'web.search')    const def = registry.getToolDef(toolName)
  → webSearchTool()           if (!def) return { success: false }
else if (tool === 'hubspot.*')     → def.execute(args, context)
  → hubspotStub()                   // wrapped in withTimeout + withRetry
else                           // withCircuitBreaker + translateToolError
  → registry lookup
```

HubSpot connector at `lib/connectors/hubspot/index.ts`:
```typescript
// exports: capability + tool defs + execute implementations
// registers via: capabilityRegistry.registerCapability(HUBSPOT_CAPABILITY, toolDefs)
```

Slack connector at `lib/connectors/slack/index.ts`:
```typescript
// OAuth: /api/connectors/slack/oauth/route.ts
// Bot token from credentials table
// Posts to: chat.postMessage, chat.update
```

## Implementation Units

- [ ] **Unit 1: Vercel AI SDK Migration — `streamText`**

**Goal:** Replace raw SSE parsing in `streamingToolExecutor` with `streamText` from `ai` SDK. All durable infrastructure (checkpointing, budget enforcement, classifier, idempotency, reliability middleware) is preserved.

**Requirements:** R1, R2

**Dependencies:** None (green field within this unit)

**Files:**
- Modify: `lib/runtime/streaming-tool-executor.ts`
- Modify: `package.json` (add `ai` SDK)
- Test: `lib/runtime/__tests__/streaming-tool-executor.test.ts`

**Approach:**
- Install `@ai-sdk/openai` (or `@ai-sdk/anthropic` if SDK supports it) and `ai`
- Import `streamText` from `ai`
- Replace the SSE `fetch` + `ReadableStream` loop (lines 270-329) with `streamText` call
- Wire existing `onEvent`, `onBudgetExceeded`, checkpoint hooks into SDK callbacks (`onStepFinish`, `onFinish`)
- The `partitionToolCalls` (read/write) and `dispatchTool` calls are preserved — SDK replaces only the transport layer
- Budget enforcement: measure elapsed time in `onStepFinish`, call `onBudgetExceeded` if exceeded

**Execution note:** Start with a characterization test capturing current behavior (SSE events → tool calls → results) before modifying the loop.

**Patterns to follow:**
- `lib/runtime/streaming-tool-executor.ts` — current implementation (surrounding checkpoint/dispatch layer)
- Vercel AI SDK `streamText` docs — callback signatures

**Test scenarios:**
- Given a streaming response with 2 read tool calls + 1 write tool call, the SDK emits checkpoints in the correct order
- Budget exceeded mid-stream triggers `onBudgetExceeded` and stops the loop
- Classifier returns `escalate` for a `needs_approval` tool and the loop returns `stopReason: 'approval_required'`

**Verification:**
- `pnpm test` passes with existing tests
- Smoke test: run agent with one `web.search` tool, verify reasoning trace SSE events match expected shape
- TypeScript: `pnpm tsc --noEmit` clean

---

- [ ] **Unit 2: BullMQ Parent-Child Orchestration — Coordinator → Workers**

**Goal:** `DurableRunner.execute()` becomes a BullMQ parent job. Workers are child jobs via `FlowProducer`. `moveToWaitingChildren` + `WaitingChildrenError` handles fork/join state machine. Existing `executeAgent` fan-out is replaced with distributed job dispatch.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 1 (Vercel SDK)

**Files:**
- Create: `lib/runtime/coordinator-producer.ts` — `FlowProducer` setup and parent job builder
- Modify: `lib/runtime/durable-runner.ts` — `execute()` becomes BullMQ parent job dispatcher; `resume()` loads checkpoint state for parent
- Modify: `lib/scheduler/worker.ts` — worker handles both parent and child job types
- Create: `lib/runtime/child-job-handler.ts` — child job processor (essentially `executeAgent` as a BullMQ processor)
- Modify: `lib/db/queries.ts` — add `getChildJobs(jobId)` query; checkpoint rows tagged with `child_job_id`
- Test: `lib/runtime/__tests__/coordinator-producer.test.ts`
- Test: `lib/runtime/__tests__/child-job-handler.test.ts`

**Approach:**
- Add `PARENT_QUEUE = 'agentos-coordinator'`, `CHILD_QUEUE = 'agentos-workers'` to `lib/scheduler/queues.ts` (create this file)
- `FlowProducer` creates parent job with `children` array — each child specifies its queue, name, and data
- Parent job `processor` function runs the coordinator state machine (see diagram above):
  - `step=Initial`: enqueue all children via `flow.add()`, `job.updateData({ step: Step.ChildrenEnqueued })`, throw `WaitingChildrenError`
  - `moveToWaitingChildren(token)` — pauses parent until children finish
  - When parent resumes: check each child's `returnvalue` for typed exit reason
  - `step=Finish`: aggregate results, update `runs` row status
- Child jobs: standard BullMQ worker on `agentos-workers` queue. Each child runs `executeAgent` logic (now extracted from `DurableRunner`) and returns typed result `{ status, output, error }`
- Resume path: `DurableRunner.resume()` is called by `recoverInterruptedRuns()` for any run with status `running`. Parent jobs are resumed by the worker re-acquiring the parent job lock and calling `moveToWaitingChildren` again
- Child job result stored as checkpoint `tool_result` with `child_job_id` set

**Execution note:** Characterization-first — capture the current in-process fan-out behavior (messages passed, timing, completion order) before replacing with BullMQ dispatch.

**Technical design:**
```
// Parent job processor (coordinator state machine)
enum Step { Initial, ChildrenEnqueued, Finish }

async function coordinatorProcessor(job: Job) {
  let step = job.data.step ?? Step.Initial
  while (step !== Step.Finish) {
    switch (step) {
      case Step.Initial: {
        // Build children array from canvas graph
        const children = buildChildJobs(canvasId, runId, completions)
        await flow.add({ name: 'coordinator', queueName: PARENT_QUEUE, data: job.data, children })
        await job.updateData({ step: Step.ChildrenEnqueued })
        throw new WaitingChildrenError()
      }
      case Step.ChildrenEnqueued: {
        const shouldWait = await job.moveToWaitingChildren(token)
        if (!shouldWait) {
          // All children done — aggregate results
          const childResults = await getChildJobResults(job.id)
          await aggregateResults(childResults, job.data.runId)
          await job.updateData({ step: Step.Finish })
          step = Step.Finish
          return { status: 'completed', children: childResults }
        } else {
          throw new WaitingChildrenError()
        }
      }
    }
  }
}
```

**Patterns to follow:**
- `lib/runtime/durable-runner.ts` lines 96-149 — current in-process fan-out (behavior reference)
- BullMQ docs: `FlowProducer` + `moveToWaitingChildren` pattern

**Test scenarios:**
- Parent job enqueues 3 children; on child completion parent resumes and aggregates results
- One child fails; parent returns typed exit reason `child_failed` with child id
- Parent job crashes mid-enqueue; `recoverInterruptedRuns` finds it and resumes from checkpoint
- Budget exceeded in child job: child returns `budget_exceeded`, parent aggregates and escalates

**Verification:**
- `pnpm test` passes
- Manual: trigger 3-agent canvas, verify each agent's trace appears at `/runs/[runId]/trace`
- BullMQ dashboard: parent job → children relationships visible in queue UI

---

- [ ] **Unit 3: Tool Gateway — HubSpot Connector**

**Goal:** HubSpot connector implemented as a first-class capability via the tool gateway pattern. OAuth flow, token management, and tool execution all wired through `capabilityRegistry`.

**Requirements:** R4, R5

**Dependencies:** Unit 1 (for SDK migration compatibility)

**Files:**
- Create: `lib/connectors/hubspot/index.ts` — capability + tool defs + execute implementations
- Create: `app/lib/mcp/hubspot-client.ts` — HubSpot API client with OAuth token refresh (template from `lib/mcp/mcp-client.ts`)
- Create: `app/app/api/connectors/hubspot/authorize/route.ts` — OAuth initiation
- Create: `app/app/api/connectors/hubspot/callback/route.ts` — OAuth callback
- Create: `lib/db/migrations/014_hubspot_credentials.sql` — HubSpot-specific credential shape if needed beyond generic `credentials` table
- Modify: `lib/capability-registry/index.ts` — call `hubspot.register()` at startup
- Modify: `lib/runtime/streaming-tool-executor.ts` — `dispatchTool` dispatches to hubspot client
- Modify: `app/app/(app)/canvas/page.tsx` — HubSpot "Connect" button in settings/credentials panel
- Test: `lib/connectors/hubspot/__tests__/hubspot.test.ts`

**Approach:**
- HubSpot tools: `hubspot.leads.read`, `hubspot.contacts.read`, `hubspot.deals.read`
- OAuth: HubSpot uses OAuth 2.0 with `hubspot.authorize.net` scope
- Token storage: `credentials` table with `provider = 'hubspot'`, encrypted access + refresh tokens
- Execution: `hubspot-client` wraps HubSpot REST API, translates errors via `translateToolError`
- Rate limiting: `RetryBudget` token bucket shared across all HubSpot calls
- `isConcurrencySafe = true` for reads (parallel), `needs_approval` for writes

**Patterns to follow:**
- `lib/gmail/client.ts` — Gmail token storage and API client pattern
- `app/lib/mcp/mcp-client.ts` — OAuth + token refresh infrastructure
- `lib/capability-registry/index.ts` — `registerCapability` pattern

**Test scenarios:**
- HubSpot OAuth flow: user clicks Connect → redirected to HubSpot → returns → token stored
- `hubspot.leads.read` returns formatted lead data within timeout
- Rate limit (429): RetryBudget decorrelates retries across concurrent calls
- Invalid token: automatic refresh via `hubspot-client` token manager

**Verification:**
- `pnpm test` passes
- Manual: connect HubSpot, run agent with `hubspot.leads.read` tool, verify leads appear in trace

---

- [ ] **Unit 4: Tool Gateway — Slack Connector**

**Goal:** Slack connector sends agent summaries to Slack channels. OAuth flow + bot token management via `credentials` table.

**Requirements:** R4, R5

**Dependencies:** Unit 1 (for SDK migration compatibility)

**Files:**
- Create: `lib/connectors/slack/index.ts` — capability + tool defs + execute implementations
- Create: `app/lib/slack/client.ts` — Slack API client (web API for `chat.postMessage`, `chat.update`)
- Create: `app/app/api/connectors/slack/authorize/route.ts`
- Create: `app/app/api/connectors/slack/callback/route.ts`
- Modify: `lib/capability-registry/index.ts` — call `slack.register()` at startup
- Modify: `app/app/(app)/canvas/page.tsx` — Slack "Connect" button
- Test: `lib/connectors/slack/__tests__/slack.test.ts`

**Approach:**
- Slack tools: `slack.channel.post`, `slack.channel.update`
- OAuth: Slack uses OAuth 2.0 with `chat:write` scope
- Bot token from `credentials` table, used in `chat.postMessage` API calls
- `isConcurrencySafe = false` for writes (serial per agent)
- Auto-approval: routine status posts (non-external) can be `auto_approve`d by classifier

**Patterns to follow:**
- Same as HubSpot (Unit 3): OAuth + credentials table + `capabilityRegistry.registerCapability()`

**Test scenarios:**
- Slack OAuth flow completes and token stored
- `slack.channel.post` sends a formatted agent summary to a channel
- Rate limit: decorrelated retry via shared RetryBudget

**Verification:**
- `pnpm test` passes
- Manual: connect Slack, run agent that posts summary, verify message in Slack channel

## System-Wide Impact

- **Checkpoint schema:** Child jobs write to same `checkpoints` table with `child_job_id` column added. Backward compatible with existing rows (`child_job_id = null`).
- **Hook system:** Child jobs emit `preToolCall`, `postToolCall` hooks as before. Parent job emits `postAgentRun` per child. Canvas UI subscribes to these hooks for real-time trace updates — no change needed to hook consumers.
- **Canvas UI:** Agent cards on canvas show individual agent status. Child job failures surface as red status on the affected agent card. Parent failure surfaces as coordinator status.
- **API routes:** `/api/runs/[runId]/trace` returns all checkpoints including child job steps. No API contract change.
- **Auth:** HubSpot and Slack OAuth sessions stored in `credentials` table alongside Gmail. `getSessionFromCookie` continues to work as session boundary.
- **Error propagation:** Child job failure → parent job `child_failed` exit reason → `runs.status = 'failed'` → push notification to James. Error includes child agent role and failure reason.

## Risks & Dependencies

1. **Risk: Vercel AI SDK checkpoint granularity.** If `streamText` callbacks fire per LLM turn rather than per individual tool call, the per-tool checkpoint pattern breaks. **Mitigation:** Implement a shim that wraps `streamText` and emits per-tool checkpoints internally, using the SDK only for LLM transport.
2. **Risk: BullMQ child job parent tracking.** When a parent job crashes after enqueuing children but before `moveToWaitingChildren`, the children may run without a parent tracking them. **Mitigation:** `recoverInterruptedRuns()` scans for any run with status `running` and no active parent job; these are treated as orphaned and marked `failed`.
3. **Risk: HubSpot/Slack token refresh during long-running job.** If a token expires mid-job (access token TTL ~6 hours), the connector must refresh without restarting the job. **Mitigation:** `hubspot-client` and `slack-client` refresh tokens proactively when `expires_at` is within 10 minutes.
4. **Dependency: Unit 2 (BullMQ) depends on Unit 1 (Vercel SDK).** The child job processor calls `streamingToolExecutor`. If Unit 1 is not complete, child jobs can't execute. Unit 3 and 4 can run in parallel with Unit 2.

## Documentation / Operational Notes

- **BullMQ dashboard:** Parent → child job relationships are visible in BullMQ dashboard. Monitor parent job `step` field to confirm state machine progression.
- **Child job logs:** Each child job logs to its own BullMQ job log. Parent job logs only orchestration events. Full trace requires joining parent + child logs by `run_id`.
- **HubSpot/Slack OAuth:** Test credentials with a sandbox HubSpot account and a test Slack workspace before production. Token rotation must not interrupt running jobs.
- **Monitoring:** New metrics: `coordinator_parent_jobs_total`, `child_job_duration_seconds`, `child_job_failure_total`. Add to existing dashboard.
- **Rollback:** If BullMQ distributed orchestration causes issues, the previous in-process fan-out is preserved in `runner.ts` (`InProcessRunner`). A feature flag `USE_BULLMQ_ORCHESTRATION` can switch between the two modes.

## Sources & References

- PRD: `docs/PRD.md` Section 12 (Phase 3 Roadmap, lines 931-946)
- Durable execution plan: `docs/archived/v3/2026-04-01-002-feat-agentos-durable-execution-plan.md`
- Connector implementation plan: `docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md`
- Architecture reference: `docs/harness-architecture-reference.md`
- Reliability middleware: `docs/ARCHITECTURE-03-reliability-middleware.md`
- Vercel AI SDK: `/vercel/ai` (context7: `/vercel/ai`)
- BullMQ patterns: `/websites/bullmq_io` (context7: `/websites/bullmq_io`)
