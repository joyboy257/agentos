---
title: AgentOS v3 — NL-to-Canvas MVP Implementation
type: feat
status: active
date: 2026-03-30
origin: docs/brainstorms/2026-03-30-agentos-v3-nl-canvas-requirements.md
deepened: 2026-03-30
---

# AgentOS v3 — NL-to-Canvas MVP Implementation

## Overview

Build the AgentOS v3 MVP: a visual canvas where non-technical users compose agent teams via natural language. User types a goal → system builds a visual pipeline on the canvas → agents execute with visible reasoning, human approval checkpoints, and reliable tool calls. The 5 architecture documents (Capability Registry, MCP Client, Reliability Middleware, Human Approval UX, Reasoning Traces) define the infrastructure to build on top of the existing Next.js foundation.

**Current state:** NL interpretation (`interpret.ts`) and canvas rendering (`canvas-panel.tsx`) exist and work. The 5 architecture docs describe systems that do not yet exist: MCP client, retry middleware, human approval UX, reasoning traces, GDPR retention.

**Corrected dependency structure:** The true dependency graph is a DAG, not a linear chain. Units 1, 2, and 4 start immediately and run in parallel. Unit 3 follows Unit 2. Units 5 and 6 share a common substrate (new Unit 5a: SSE event schema, per-run event buffer, `capturePointInTime()` interface) and run in parallel after Unit 4. Unit 7 follows Unit 6.

**Three-phase delivery:**
- Phase 1 (Units 1 + 2 + 4, parallel): Canvas node component spec + Capability Registry + Reliability Middleware (using mocks). Phase 1 delivers contracts, middleware, and a ratified spec — no changes to visible canvas UI (`agent-card.tsx`, `canvas-panel.tsx`) until Phase 2.
- Phase 2 (Units 3 → 5a → [5 + 6 in parallel]): MCP client wires into the already-built middleware; Unit 5a (SSE substrate) is extracted first, then Human Approval UX and Reasoning Traces are built in parallel on top of it.
- Phase 3 (Unit 7): GDPR cron operationalizes retention. This is delivery/operational work only — trace persistence infrastructure (`reasoning_traces` table, `trace-store.ts`) was delivered in Unit 6.

## Problem Frame

Non-technical business users feel operational overhead but can't build AI agents without developer help. AgentOS v3 closes that gap with "NL-to-canvas" — describe what you want, see the agent pipeline, activate it.

**Origin:** `docs/brainstorms/2026-03-30-agentos-v3-nl-canvas-requirements.md`

## Requirements Trace

- **R1** NL-to-canvas pipeline builder — existing `interpret.ts` maps goals to `AgentGraph`; canvas renders it
- **R2** Readable pipeline visualization — agent cards with milestone labels, status edges, approval badges
- **R3** Capability Registry with structured inputs — replaces `PHASE1_AGENTS` const; supports `semanticType` dependency resolution
- **R4** Role-based permission grants — `PAYMENTS`, `ADMIN`, `EXECUTE_CODE` gated by admin approval
- **R5** Human-in-the-loop approval checkpoints — per-tool-call approval modal with snapshot
- **R6** Readable reasoning trace per run — SSE event stream with milestone cards, aggregation, virtual scrolling
- **R7** Reliable execution — retry middleware wrapping every tool call, visible failure states
- **R8** GDPR retention enforcement — nightly cron job deleting traces past 30/90 day windows
- **R9** MCP integration — Zapier MCP server connection (8,000+ integrations)
- **R10** Onboarding import path — read active Zaps → create equivalent AgentOS pipelines

## Scope Boundaries

- Enterprise SSO, team collaboration (multi-org), mobile-native canvas, Zapier write-back: out of scope
- Custom capability creation UI: out of scope — users use pre-registered capabilities only
- Multi-tenant isolation: out of scope — MVP is single-org
- Full prompt engineering UI: out of scope — NL layer handles interpretation
- **Zapier import (R10)**: out of scope — Zapier does not expose a public API for reading active Zaps. MVP ships without import. Investigate partner APIs post-MVP.

## Context & Research

### Relevant Code and Patterns

**Foundation (already exists):**
- `app/lib/nl/interpret.ts` — GPT-4o structured output → `AgentGraph`. DAG validation. 5-agent cap.
- `app/lib/nl/prompts.ts` — System prompt, `buildUserPrompt()`. Max 5 agents enforced.
- `app/components/canvas-panel.tsx` — Custom SVG grid + absolutely-positioned agent cards. No React Flow.
- `app/components/agent-card.tsx` — 160px cards, role-based border colors, status dot with CSS pulse.
- `app/components/connection-line.tsx` — SVG bezier curves, animated dash when running.
- `app/lib/runtime/runner.ts` — `InProcessRunner` with DAG execution, concurrency limit of 2.
- `app/lib/runtime/types.ts` — `Agent`, `AgentGraph`, `Runner` interfaces.
- `app/app/api/run/route.ts` — SSE streaming via `ReadableStream`. Format: `event: TYPE\ndata: JSON\n\n`
- `app/lib/db/schema.sql` — Vercel Postgres tables: `users`, `sessions`, `teams`, `credentials`, `runs`
- `app/lib/auth/session.ts` — HTTP-only session cookie, 30-day expiry.

**Architecture decisions (do not re-litigate):**
- MCP as integration layer (Zapier MCP server, 8,000+ integrations)
- Bearer token in HTTP `Authorization` header — NOT in JSON-RPC params
- `executeTool` as single tool call entry point with composed middleware layers
- `semanticType` tags for field-level dependency resolution (not TypeScript types)
- Per-tool-call approval with `Map<"${agentId}:${toolCallId}", PendingApproval>`
- HMAC-SHA256 signed reasoning events with point-in-time snapshot for approval modal
- 30-day standard / 90-day flagged GDPR retention; nightly cron enforcement

**Patterns to follow:**
- Discriminated union event types: `{ event: 'status', ... } | { event: 'done', ... }`
- SSE format: `event: TYPE\ndata: JSON\n\n` with explicit `controller.close()`
- Tagged template literals for DB queries from `@vercel/postgres`
- OpenAI `response_format: { type: 'json_schema', json_schema: {...} }` for structured output
- Token refresh: check `expires_at` before each call, refresh if expired

### Institutional Learnings

- The 5 architecture docs (DOC-01 through DOC-05) are the source of truth for the systems being built — read them before touching any implementation
- `inferInputs` is a user-prompt contract, NOT an AI extraction step — user is prompted directly for capability fields
- Approval is per-tool-call, not per-agent-run; `MAX_APPROVAL_ITERATIONS = 3`
- Reasoning events must NEVER re-enter LLM context — infinite loop / context poisoning risk
- `PHASE1_AGENTS` in `agent-registry.ts` is the Phase 1 placeholder — will be replaced by dynamic capability registry

### External References

- DOC-02 (MCP Client) references Zapier MCP server: bearer token auth, manifest pinning, idempotency keys
- DOC-03 (Reliability Middleware) specifies per-tool timeouts: `llm: 120s`, `gmail.read: 30s`, `gmail.send: 20s`, `web.search: 15s`
- DOC-04 (Human Approval UX) specifies DB schema: `pending_approvals` and `approval_decisions` tables
- DOC-05 (Reasoning Traces) specifies HMAC-SHA256 signing, ULID step counter, 500ms event aggregation window

## Key Technical Decisions

- **Canvas is the trust layer** — pipeline visualization and reasoning traces are the primary trust mechanisms, not raw LLM transparency. Design the canvas node first so the backend knows what status events to emit.
- **Backend infrastructure builds toward the canvas** — each backend unit emits events the canvas node consumes. Start with the canvas data contract and work backward.
- **NL interpretation is the differentiator** — existing `interpret.ts` is the core algorithm. Build the capability registry it queries against first, then enhance the prompt iteratively.
- **Corrected dependency DAG over linear phasing** — The true dependency graph is not a single linear chain:
  - Units 1, 2, and **4 can start immediately in parallel** (Unit 4 uses mock tool functions; only needs wiring into `runner.ts` after Unit 3 lands)
  - Unit 3 depends on Unit 2
  - **Unit 5a (SSE substrate)** depends on Unit 4: extracts the SSE event schema, per-run event buffer, and `capturePointInTime()` interface
  - **Unit 5 (Human Approval UX)** and **Unit 6 (Reasoning Traces)** both depend on Unit 5a and run in parallel — Unit 5's approval modal reads `capturePointInTime()` from Unit 5a's event buffer infrastructure
  - Unit 7 depends on Unit 6
  - **Why Units 5 and 6 run in parallel**: Both depend on the shared SSE substrate (Unit 5a). Building them in parallel after Unit 5a is complete eliminates the hard dependency cycle where Unit 5's approval modal was reading `reasoningSnapshot` produced by Unit 6 — that cycle is now broken with Unit 5a as the shared producer.
- **Phase 1 delivers operational reliability, not just visual scaffolding** — Units 1+2+4 running in parallel produce a ratified canvas node component spec (Unit 1), a capability registry (Unit 2), and a working retry/middleware layer (Unit 4, using mocks). Unit 1 produces a spec document, not a modified canvas. Without Unit 4, a transient Gmail 429 error crashes the pipeline visibly. Reliability matters for the demo.
- **Three-phase delivery**: Phase 1 = Units 1+2+4 (parallel); Phase 2 = Unit 3, then Unit 5a, then Units 5+6 (parallel); Phase 3 = Unit 7

## Open Questions

### Resolved During Planning

- **Canvas spec first vs. backend first**: Spec canvas first — UI is the product, it must feel right before investing in backend. Decision: Unit 1 is the canvas node component spec.

### Deferred to Implementation

- **Canvas node spec (R2)**: The hybrid milestone/status/timeline/approval UX needs a concrete React component spec. Specified as Unit 1.
- **NL interpretation prompt (R1)**: The prompt engineering for converting user goals to capability selections needs iterative tuning against the real capability registry. Deferred to Unit 3 and beyond.
- **Event aggregation tuning (R6)**: 500ms window, 500 event cap — numbers are specified but not user-validated. Deferred.
- **Trace encryption at rest (R6)**: Signing is specified; encryption at rest is not required for MVP. Deferred.
- **Admin notification defaults (R4)**: In-app only, no email/push for grant requests. Pending indefinitely if admin doesn't respond.
- **Durable run-state and restart-safe approval resumption (Unit 5)**: The `pending_approvals` DB table persists the approval *record*, but the in-memory `PendingApproval{resolve,reject}` promise map and open SSE stream are request-scoped. A server restart mid-approval leaves the DB row in a stale `pending` state — the paused tool call cannot automatically resume. True durable run-state would require persisting the paused tool invocation state (args, capability, position in DAG), persisting in-flight promise resolvers, a rehydration path on startup reconnecting pending rows to live SSE streams, and a mechanism for the approval PUT to resume execution even if the original process is gone. This is a meaningful distributed systems problem (distributed resume protocol, potential split-brain). **Deferred to post-MVP.** MVP assumes continuous server uptime for in-flight approvals.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
User: "follow up with leads who haven't replied in 7 days"
  │
  ▼
POST /api/assemble
  │ NL interpretation via GPT-4o
  │ Queries Capability Registry for matching capabilities
  │ Returns AgentGraph { agents[], connections[] }
  ▼
Canvas renders:
  ┌─────────────────┐     ┌─────────────────┐
  │  Email Reader   │────▶│  Lead Filter    │
  │  milestone:"Read │     │ milestone:"Find │
  │   emails"       │     │   replies"      │
  └─────────────────┘     └─────────────────┘
              │                    │
              ▼                    ▼
         ┌─────────────────┐
         │  Email Writer   │
         │ milestone:"Draft│───▶ [Approval Checkpoint] ──▶ User approves
         │  follow-ups"   │
         └─────────────────┘
              │
              ▼
      Reasoning Trace Timeline
      (milestone cards in sidebar)

Capability Registry (Unit 3):
  - Query by semanticType (email → email:read)
  - Trigger matching (cosine similarity ≥ 0.5)
  - Input schema validation
  - Output → semanticType tagging

MCP Client (Unit 3):
  - Connect to Zapier MCP server (bearer token)
  - Map MCP tools → AgentOS capabilities
  - Manifest caching with TTL
  - Idempotency keys on write ops

Reliability Middleware (Unit 4):
  - executeTool() = withAbort → withTimeout → withRetryBudget → withRetry → translateError
  - Token bucket retry budget per domain
  - PII redaction in logs

SSE Reasoning Substrate (Unit 5a):
  - Per-run event buffer with sequence numbering
  - `capturePointInTime()` atomic snapshot
  - SSE event schema (ReasoningEvent interface)
  - Per-run SSE channel emitter with cursor-based reconnection

Human Approval (Unit 5):
  - Per-tool-call pause
  - Point-in-time reasoning snapshot (from Unit 5a)
  - In-app approval modal
  - Append-only audit log

Reasoning Traces (Unit 6):
  - Builds SSE substrate (Unit 5a)
  - HMAC-SHA256 signed events
  - Milestone card aggregation
  - Virtual scrolling (500 cap)
```

## Implementation Units

- [ ] **Unit 1: Canvas Node Component Spec**

**Goal:** Define the concrete React component spec for agent cards on the canvas — milestone label, status indicator, approval badge, and what events the card receives from the backend. This drives what the backend must emit.

**Requirements:** R2 (Readable pipeline visualization)

**Dependencies:** None — starts immediately. Runs in parallel with Units 2 and 4.

**Files:**
- Create: `app/components/agent-node-spec.md` (component spec document — primary deliverable)
- Create: `app/components/__tests__/agent-card.test.tsx` (component test)

**Approach:**
The canvas node is not just a card — it is the user's window into what the agent is doing. Define the spec first so backend units know what status events to emit:

1. **Agent card anatomy**: Agent photo/avatar, agent name (e.g., "Alex the Researcher"), role badge, milestone label (e.g., "Reading emails — Found 12 unread"), status dot (idle/running/success/failed/awaiting-approval)
2. **Connection edge states**: Default (gray), running (animated dash), success (green), failed (red pulse)
3. **Approval badge**: Visual indicator when a node is awaiting human approval — pulsing amber dot + "Awaiting your approval" label
4. **Event contract**: Explicit mapping of SSE event types to state transitions — which event (`agent:status`, `approval:required`) causes which state change. This is the contract that Units 4, 5, and 6 must conform to.
5. **State machine**: Enumerate all card states and valid transitions: `idle → running → waiting (approval) → completed | error`. Include state entry/exit actions.

**What is NOT in this unit:**
- `app/components/agent-card.tsx` and `app/components/canvas-panel.tsx` modifications — these are implementation work that happens after the spec is ratified. The spec document is the unit's deliverable.
- Reasoning sidebar — `app/components/reasoning-panel.tsx` is owned by Unit 6. Unit 1's spec defines what events the card emits; Unit 6 consumes them.

**Patterns to follow:**
- Existing `agent-card.tsx` role color system: `roleColors` map (researcher=blue, writer=green, etc.)
- Existing CSS pulse animation on status dot
- Existing `ConnectionLine` SVG bezier with animated dash for running state

**Verification — concrete acceptance criteria** (not generic QA statements):
- `agent-node-spec.md` exists and contains all of: component tree, state machine, event contract (SSE event → state transition mapping), milestone label format specification, approval badge specification, connection edge state mapping, and TypeScript props interface
- Component test passes: card renders milestone label, status dot transitions, approval badge appears on `approval:required` event, missing agent name shows "Unnamed agent"
- Canvas panel integration note added to `agent-node-spec.md`: milestone labels and approval badge rendering expectations are documented as a contract for Phase 2 implementers

---

- [ ] **Unit 2: Capability Registry**

**Goal:** Replace the `PHASE1_AGENTS` const in `agent-registry.ts` with a proper structured capability registry that supports `semanticType` dependency resolution, trigger matching, and structured input schemas.

**Requirements:** R3 (Capability Registry with structured inputs)

**Dependencies:** None — starts immediately. Runs in parallel with Units 1 and 4.

**Files:**
- Create: `app/lib/registry/capability-registry.ts` (new registry implementation)
- Create: `app/lib/registry/types.ts` (`Capability`, `CapabilityMatch`, `ExecutionPlan`, `semanticType` interfaces)
- Create: `app/lib/registry/resolver.ts` (`resolveDependencies()` using `semanticType` equivalence)
- Create: `app/lib/registry/infer-inputs.ts` (user-prompt input extraction contract)
- Modify: `app/lib/nl/interpret.ts` (query registry instead of `PHASE1_AGENTS`)
- Modify: `app/lib/nl/agent-registry.ts` (remove `PHASE1_AGENTS` once migration complete)
- Test: `app/lib/registry/__tests__/capability-registry.test.ts`
- Test: `app/lib/registry/__tests__/interpret-registry-integration.test.ts` (mock LLM, verify interpret queries new registry and returns expected AgentGraph)

**Approach:**
1. Define `Capability` interface matching DOC-01: `id`, `triggers[]`, `tools[]`, `inputSchema` (with `semanticType` per field), `outputSchema` (with `semanticType` per field), `approvalConfig`
2. Build `resolveDependencies(graph: AgentGraph): ExecutionPlan` — walks the DAG, matches each step's input `semanticType` to upstream outputs
3. `inferInputs` — prompts user directly for required capability fields when NL session is in "upfront" mode; prompts per-step when in "lazy" mode (user chose at session start)
4. `matchCapabilities(userGoal: string): CapabilityMatch[]` — cosine similarity over trigger keywords, threshold 0.5
5. Flywheel tracking: increment counter when two capabilities appear together; surfaces "composite" patterns after >10 occurrences
6. Re-register existing Gmail tools, web search, delay, condition as proper `Capability` objects

**Patterns to follow:**
- DOC-01 `semanticType` field on every input/output schema field
- Existing `AVAILABLE_TOOLS` array pattern for tool validation
- Existing `interpret.ts` DAG validation (cycle check, root check, agent cap)

**Test scenarios:**
- Registry resolves dependencies correctly: `email:read` output `semanticType: "emailThread[]"` satisfies `email:send` input `semanticType: "emailThread[]"`
- Cosine similarity threshold 0.5: "send an email" matches `email:send` but not `calendar:query`
- `inferInputs` with upfront mode: returns all required fields before pipeline activation
- `inferInputs` with lazy mode: returns fields one-by-one as pipeline runs
- Integration test: mock LLM response, verify `interpret()` calls `matchCapabilities()` with the goal string, verify returned `AgentGraph` has expected shape and agent count

**Verification:**
- Registry resolves the 7 example capabilities from DOC-01 without error
- Cycle detection still works (no circular dependency crashes)
- Integration test: interpret.ts queries the new registry and returns a valid AgentGraph for a known test goal
- **Critical**: All 21 existing `test-suite.ts` role expectations must still match after new registry deployment. The registry must preserve the same trigger keyword → capability role mapping that `PHASE1_AGENTS` used. Validate this explicitly before declaring Unit 2 complete.

---

- [x] **Unit 3: MCP Client Integration**

**Goal:** Connect to Zapier MCP server for 8,000+ integrations. Map MCP tool manifests to AgentOS capabilities. Bearer token auth, manifest caching, tool name mapping.

**Requirements:** R9 (MCP integration for app connectivity)

**Dependencies:** Unit 2 (registry must exist to map MCP tools to capabilities). Runs after Unit 2 is complete.

**Files:**
- Create: `app/lib/mcp/mcp-client.ts` (`MCPClient` class: `connect()`, `listTools()`, `callTool()`, `disconnect()`)
- Create: `app/lib/mcp/token-refresh.ts` (atomic token refresh with distributed lock)
- Create: `app/lib/mcp/tool-mapper.ts` (bidirectional MCP tool name → AgentOS capability mapping)
- Create: `app/lib/mcp/manifest-cache.ts` (`manifestVersion` pinning with TTL cache)
- Modify: `app/lib/registry/capability-registry.ts` (add MCP-sourced capabilities)
- Modify: `app/lib/runtime/tools/` (wire MCP tools as AgentOS tool implementations)
- Test: `app/lib/mcp/__tests__/mcp-client.test.ts`

**Approach:**
1. `MCPClient.connect(userId, bearerToken)` — stores token, establishes connection to Zapier MCP endpoint
2. `listTools()` — fetches MCP manifest, maps each tool to a `Capability` object, caches with `manifestVersion` TTL
3. `callTool(name, args, idempotencyKey?)` — invokes MCP tool via JSON-RPC over SSE; bearer token in HTTP `Authorization` header
4. Token refresh: `Map<string, Promise<string>>` lock — one concurrent refresh per `userId`; others wait
5. `DANGEROUS_TOOLS` map: `stripe.chargeCustomer → PAYMENTS`, `shell.execute → EXECUTE_CODE`; requires capability check before invocation
6. Audit log: every tool call logged with `userId`, `toolName`, `args` (sanitized), `idempotencyKey`, `timestamp`, `status`
7. Payload size limit: respect `X-Max-Payload-Size` header; throw `MCPServerError('RESULT_PAYLOAD_TOO_LARGE')` if exceeded

**Patterns to follow:**
- DOC-02 bearer token in HTTP `Authorization` header (not JSON-RPC params)
- DOC-02 `refreshLocks: Map<string, Promise<string>>` for atomic refresh
- DOC-02 `idempotencyKey` in `meta` of JSON-RPC and `X-Idempotency-Key` HTTP header
- Existing `getCredential` pattern from `gmail.ts`

**Test scenarios:**
- MCP client connects with valid bearer token and returns tool manifest
- Tool call fails gracefully with 401 → retry flow (if token expired, refresh first)
- `stripe.chargeCustomer` blocked without PAYMENTS capability
- Manifest caches correctly; cache invalidated when `manifestVersion` changes

**Verification:**
- MCP client connects to Zapier MCP server (or mock server) without error
- At least one MCP tool callable end-to-end
- Token refresh works correctly under concurrent load

---

- [ ] **Unit 4: Reliability Middleware**

**Goal:** Wrap every tool call with retry logic, timeout handling, abort signals, and PII redaction. Make agent execution resilient and failures visible.

**Requirements:** R7 (Reliable execution with visible failure states)

**Dependencies:** None — starts immediately in parallel with Units 1 and 2. Develop and test using mock tool functions. Wiring into `runner.ts` and MCP client happens after Unit 3 lands (the middleware is tool-agnostic by design).

**Files:**
- Create: `app/lib/middleware/execute-tool.ts` (main entry point: `executeTool(config): Promise<ToolResult>`)
- Create: `app/lib/middleware/with-timeout.ts` (timeout wrapper with `TimeoutError`)
- Create: `app/lib/middleware/with-retry.ts` (exponential backoff + jitter, retryable predicate)
- Create: `app/lib/middleware/retry-budget.ts` (`RetryBudget` token bucket, `getRetryBudget(domain)`)
- Create: `app/lib/middleware/pii-redaction.ts` (recursive PII redaction by value + key)
- Create: `app/lib/middleware/error-translation.ts` (translate MCP/tool errors → `ToolResult`)
- Modify: `app/lib/runtime/runner.ts` (replace bare tool calls with `executeTool()`)
- Modify: `app/lib/mcp/mcp-client.ts` (tool calls go through `executeTool()` — done after Unit 3 lands)
- Test: `app/lib/middleware/__tests__/execute-tool.test.ts`

**Approach:**
1. `executeTool({ tool, args, signal?, domain })` composes: `withAbortSignal → withTimeout → withRetryBudget → withRetry → translateToolError`
2. **AbortSignal**: outer signal propagated to HTTP calls; each retry attempt gets its own `AbortController`; `checkAbortSignal()` called before each retry
3. **Timeout**: per-tool timeouts from DOC-03 defaults: `llm: 120s`, `gmail.read: 30s`, `gmail.send: 20s`, `web.search: 15s`; configurable per call
4. **RetryBudget**: token bucket per domain; `tryAcquire()` before retry; `release()` on success; `waitTime()` if bucket empty
5. **Retry**: exponential backoff + jitter; retryable: `429`, `500–504`, `ECONNABORTED`, timeout; NOT retryable: `401`, `403`, `400`; max 3 retries
6. **PII redaction**: `sanitizeValue()` recursive — email, phone, credit card, secret patterns by value; `PII_KEY_NAMES` Set by key name; truncate at 200 chars
7. **Return contract**: `ToolResult { data, llmMessage, userMessage, failed, errorCode, retriesAttempted, partialData, attemptSucceededOn }` — always resolves, never throws

**Patterns to follow:**
- DOC-03 middleware composition: `withAbortSignal → withTimeout → withRetryBudget → withRetry → translateToolError`
- Existing `signal?.aborted` checks in `runner.ts`
- Existing `ToolCallLog` schema (add `retriesAttempted` field)
- Existing PII handling in `gmail.ts` (sanitize before logging)

**Test scenarios:**
- Tool call succeeds on 3rd retry after two transient failures
- Abort signal cancels in-flight HTTP request within timeout window
- Non-retryable error (401) returns immediately without retry
- PII: email `john@example.com` redacted in logs, credit card `4111...` redacted
- Timeout: tool call fails with `TimeoutError` after configured duration

**Verification:**
- Middleware composes without breaking any existing tool call
- Retry logic verifiable via test suite
- PII redaction tested against known patterns

---

- [ ] **Unit 5a: SSE Reasoning Substrate**

**Goal:** Extract the shared SSE event infrastructure that both Human Approval UX (Unit 5) and Reasoning Traces (Unit 6) depend on. This eliminates the hard dependency cycle where Unit 5's approval modal reads `reasoningSnapshot` produced by Unit 6.

**Requirements:** R5 (Human-in-the-loop approval checkpoints), R6 (Readable reasoning trace per pipeline run)

**Dependencies:** Unit 4 (middleware must be working to emit structured events). Both Units 5 and 6 depend on this before running in parallel.

**Files:**
- Create: `app/lib/tracing/event-schema.ts` (DOC-05 `ReasoningEvent` interface: `event`, `runId`, `agentId`, `step: ULID`, `sequence: number`, `type`, `content`, `timestamp`, `version: 1`, `integrity?: {mac, tag}`)
- Create: `app/lib/tracing/event-buffer.ts` (per-run event buffer/store: `addEvent()`, `getEvents()`, `getSequence()`, `capturePointInTime()`)
- Create: `app/lib/tracing/sse-stream.ts` (channel-based SSE per-run emitter: `eventEmitter.on()` / `emit()` per-run channel)
- Create: `app/lib/tracing/snapshot.ts` (`capturePointInTime()` — atomic reasoning snapshot for approval modal, backed by event-buffer)
- Test: `app/lib/tracing/__tests__/event-buffer.test.ts`

**Approach:**
1. **Event schema** (DOC-05): `ReasoningEvent { event, runId, agentId, step: ULID, sequence: number, type, content, timestamp, version: 1, integrity?: {mac, tag} }` — the discriminated union schema both SSE channels use
2. **Per-run event buffer**: `EventBuffer` class — `addEvent()`, `getEvents(since?)`, `getSequence()`, `capturePointInTime()` — atomic snapshot of buffer at a point in time
3. **SSE stream per run**: `SSEStream` class — per-client channel, not shared singleton; `lastSequence` query param for cursor-based reconnection; `GET /api/runs/:runId/events`
4. **Snapshot**: `capturePointInTime()` on the buffer — synchronously copies current event buffer; approval modal reads from snapshot, not live stream

**Patterns to follow:**
- DOC-05 `ReasoningEvent` schema with HMAC-SHA256 signing fields
- DOC-05 `capturePointInTime()` atomic snapshot at approval request time
- DOC-05 cursor-based reconnection: `GET /api/runs/:runId/events?lastSequence=N`
- DOC-05 `requireRunOwnership` middleware on SSE endpoint
- Existing SSE format from `app/app/api/run/route.ts`: `event: TYPE\ndata: JSON\n\n`

**Test scenarios:**
- Event buffer adds events and returns correct sequence numbers
- `capturePointInTime()` returns same events as live buffer at capture time; subsequent additions not reflected in snapshot
- SSE stream delivers events to correct per-run channel
- Reconnection: client disconnects with `lastSequence=47`, reconnects → receives events from 48 onward

**Verification:**
- Event schema matches DOC-05 specification
- `capturePointInTime()` produces immutable snapshot readable by Unit 5's approval modal
- SSE endpoint at `/api/runs/:runId/events` serves per-run event stream with cursor-based reconnection

---

- [ ] **Unit 5: Human Approval UX**

**Goal:** Per-tool-call approval checkpoints with point-in-time reasoning snapshots. In-app approval modal with plain-English summary, edit capability, and append-only audit log.

**Requirements:** R4 (Role-based permission grants), R5 (Human-in-the-loop approval checkpoints)

**Dependencies:** Unit 5a (SSE event buffer and `capturePointInTime()` substrate). Runs in parallel with Unit 6 after Unit 5a is complete.

**Files:**
- Create: `app/lib/approval/approval-manager.ts` (`PendingApproval` map, `requestApproval()`, `resolveApproval()`)
- Create: `app/lib/approval/approval-queue.ts` (queue processor: waits for approval without blocking other agents)
- Create: `app/lib/approval/db-schema.sql` (add `pending_approvals` and `approval_decisions` tables)
- Modify: `app/app/api/run/route.ts` (pause on `requiresApproval: true`, emit `approval_required` SSE event)
- Modify: `app/lib/middleware/execute-tool.ts` (check `requiresApproval` on capability, pause if needed)
- Modify: `app/components/approval-modal.tsx` (new component: approval modal UI)
- Modify: `app/app/(app)/page.tsx` (integrated canvas + approval modal)
- Test: `app/lib/approval/__tests__/approval-manager.test.ts`

**Approach:**
1. **Capability approval config**: `Capability.approvalConfig.requiresApproval = true` for `PAYMENTS`, `ADMIN`, `EXECUTE_CODE`; `approvalConfig.fallback = "skip"` for non-critical
2. **Approval flow**: Tool call reaches middleware → `requiresApproval` is true → `requestApproval()` called → pauses tool call, stores `PendingApproval{resolve,reject}` promise in Map → emits `approval_required` SSE event with plain-English summary + field list → canvas shows approval badge on node
3. **User sees modal**: "Alex the agent wants to send this email to 47 people. [Approve] [Edit] [Cancel]". Edit → user modifies args → re-submit → re-approval required (iteration count incremented, capped at 3)
4. **Snapshot**: When approval is requested, `capturePointInTime()` is called on the event buffer (from Unit 5a) — freeze the reasoning trace at that moment for the modal display
5. **Skip path**: If user cancels or max iterations reached → `resolve({ skipped: true, partialInputs: [...] })` → downstream agents receive skip signal → they handle gracefully (don't crash)
6. **Persistence**: `pending_approvals` DB table persists the pending approval record; `approval_decisions` is append-only audit log. Note: DB persistence preserves the *record* of a pending approval across restarts, but the in-memory promise map and SSE stream are request-scoped — a server restart during a pending approval leaves the DB row in a stale state. True restart-safe durable run-state (resuming a paused tool call after process death) is out of scope for MVP and is documented in Open Questions.
7. **Timeout**: `pendingApprovalTimeoutMs = 30 minutes`; if timed out → auto-skip
8. **Permission grants**: `CapabilityGrantRequest` flow — user requests access to privileged capability → admin sees in-app notification → admin approves/denies → `ToolPermissions` updated for that user

**Patterns to follow:**
- DOC-04 `Map<"${agentId}:${toolCallId}", PendingApproval>` — concurrent multi-agent approvals
- DOC-04 `approval_required` SSE event with `content: { summary, fields[] }`
- DOC-04 `MAX_APPROVAL_ITERATIONS = 3`
- DOC-04 `pendingApprovalTimeoutMs = 30 minutes`
- DOC-04 ownership check: `run.userId === session.userId` on every approval PUT

**Test scenarios:**
- Approval modal appears when `gmail.send` is called on a capability requiring approval
- User approves → tool call resumes and completes
- User edits args → re-approval required (iteration 2)
- After 3rd edit → `MAX_APPROVAL_ITERATIONS` reached → tool skipped
- Server restart during pending approval → DB row left stale; operator resolution required (documented as known limitation, not tested)
- Admin grants PAYMENTS capability → user can now call payment tools

**Verification:**
- Approval flow end-to-end: goal → pipeline → approval modal → approval → tool executes
- Concurrent approvals: two agents paused simultaneously → both show in UI → both resolvable
- Audit log: every approval decision recorded with IP address and original/revised args

---

- [ ] **Unit 6: Reasoning Trace Infrastructure**

**Goal:** SSE event stream of reasoning milestones per pipeline run. HMAC-SHA256 integrity signing. Event aggregation. Virtual scrolling cap. Cursor-based reconnection. Reasoning sidebar panel.

**Requirements:** R6 (Readable reasoning trace per pipeline run)

**Dependencies:** Unit 5a (SSE event buffer and `capturePointInTime()` substrate). Runs in parallel with Unit 5 after Unit 5a is complete. Unit 6's `trace-emitter.ts` writes to the event buffer that Unit 5a provides. **Unit 6 also introduces the `reasoning_traces` table schema and `trace-store.ts` — cursor-based SSE reconnection and Unit 7's GDPR cron both depend on this persistence layer from day one.**

**Files:**
- Create: `app/lib/tracing/trace-emitter.ts` (Pattern B: `emitObservation()`, `emitClassification()`, `emitDecision()`, `emitAction()`, `emitWarning()`)
- Create: `app/lib/tracing/event-aggregator.ts` (500ms window; collapse consecutive identical observations)
- Create: `app/lib/tracing/hmac-signing.ts` (HMAC-SHA256 per-run signing with sequence number)
- Create: `app/lib/tracing/sanitize.ts` (`sanitizeEvidence()` — PII regex patterns)
- Create: `app/lib/tracing/trace-store.ts` (trace persistence layer: `saveTrace()`, `getTrace()`, `listTraces()`, `deleteTrace()` — required by cursor-based reconnection and by Unit 7's GDPR cron)
- Modify: `app/lib/db/schema.sql` (add `reasoning_traces` table with `retention_days` and `flagged` columns; add `CREATE INDEX idx_reasoning_traces_expires ON reasoning_traces(expires_at)` for efficient range scans; B-tree index on `expires_at`)
- Modify: `app/lib/runtime/runner.ts` (instrument with trace calls at each milestone)
- Modify: `app/app/api/run/route.ts` (add SSE endpoint for `/api/runs/:runId/events`)
- Modify: `app/components/reasoning-panel.tsx` (new: reasoning trace sidebar with virtual scrolling)
- Test: `app/lib/tracing/__tests__/trace-emitter.test.ts`

**Note:** `app/lib/tracing/snapshot.ts` and `app/lib/tracing/sse-stream.ts` are created by Unit 5a. Unit 6 consumes them.

**Approach:**
1. **Event schema** (DOC-05): `ReasoningEvent { event, runId, agentId, step: ULID, sequence: number, type, content, timestamp, version: 1, integrity?: {mac, tag} }`
2. **Pattern B** (recommended): Each agent has dedicated `emit*` methods — `emitObservation("Checking inbox")`, `emitDecision({ alternatives[], chosen }`, `emitAction("Sending email", { recipientCount: 47 })`
3. **HMAC-SHA256 signing**: Per-run secret (not transmitted over SSE); MAC covers `sequence|type|confidence|JSON.stringify(evidence)|JSON.stringify(alternatives)`; sequence in MAC prevents reorder/replay
4. **Event aggregation**: 500ms window; consecutive identical `observation` events collapsed to `text (xN)`; custom aggregation for classification/decision events (not collapsed)
5. **PII sanitization**: `sanitizeEvidence()` applied before every emission — email, phone, credit card regex patterns; names redacted heuristically
6. **Snapshot for approval**: Unit 5a's `capturePointInTime()` — synchronously copies current event buffer at the moment approval is requested; approval modal reads from snapshot, not live stream
7. **SSE stream per run**: `eventEmitter.on(\`run-${runId}\`, handler)` — per-client channel, not shared singleton; `lastSequence` query param for cursor-based reconnection
8. **Virtual scrolling cap**: `MAX_RENDERED_EVENTS = 500`; reasoning panel renders only visible window; `StreamEndEvent` with `finalSequence` sent when stream closes
9. **Reasoning panel UI**: Scrolling timeline of milestone cards — not raw tokens; each milestone shows agent name, step type icon, plain-English description, timestamp
10. **Trace persistence**: `reasoning_traces` table schema (`id ULID, run_id, agent_id, events JSON, retention_days int, flagged boolean, created_at, expires_at`) with B-tree index on `expires_at`. `trace-store.ts` implements `saveTrace()`, `getTrace()`, `listTraces()`, `deleteTrace()`. `retention_days` is set at trace creation (30 standard, 90 if flagged); `expires_at = created_at + retention_days`. This layer is required by cursor-based SSE reconnection and by Unit 7's GDPR cron.

**Patterns to follow:**
- DOC-05 HMAC-SHA256 signing with per-run secret
- DOC-05 `reasoningSnapshot` atomic capture at approval request time
- DOC-05 cursor-based reconnection: `GET /api/runs/:runId/events?lastSequence=N`
- DOC-05 `requireRunOwnership` middleware on SSE endpoint
- Existing SSE format from `app/app/api/run/route.ts`: `event: TYPE\ndata: JSON\n\n`

**Test scenarios:**
- Trace emits `observation`, `classification`, `decision`, `action`, `warning` events in correct sequence
- HMAC verification passes for unmodified event stream; fails if sequence tampered
- Aggregation: 10 consecutive identical observations → 1 event + " (x10)" suffix
- Snapshot: approval modal displays same events visible at capture time (live stream appended after, not shown in modal)
- Reconnection: client disconnects with `lastSequence=47`, reconnects → receives events from 48 onward

**Verification:**
- Reasoning panel shows milestone timeline within 500ms of event emission
- HMAC signature verifiable against known per-run secret
- Approval modal displays point-in-time snapshot (not live-updating stream)

---

- [ ] **Unit 7: GDPR Retention Cron**

**Goal:** Nightly cron job that enforces the 30-day / 90-day retention policy. Deletes reasoning traces past their window. **Unit 6 already provides the `reasoning_traces` table schema and `trace-store.ts`; Unit 7 only operationalizes the scheduled deletion.** Retention policy is infrastructure, not convention.

**Requirements:** R8 (GDPR retention with automated enforcement)

**Dependencies:** Unit 6 (tracing infrastructure must exist to delete traces)

**Files:**
- Create: `app/lib/cron/delete-retention-policy.ts` (nightly job: query `reasoning_traces` table for rows where `expires_at < NOW()`, delete in batches of 1000 with cursor pagination by `expires_at`)
- Create: `app/app/api/cron/retention/route.ts` (Vercel Cron endpoint — Next.js App Router in monorepo uses `app/app/` path)
- Modify: `app/vercel.json` (add `crons` array with daily 02:00 UTC schedule)
- Test: `app/lib/cron/__tests__/delete-retention-policy.test.ts`

**Approach:**
1. **Trace table schema and persistence**: Already provided by Unit 6 (`reasoning_traces` table with `retention_days`, `flagged`, `created_at`, `expires_at`; `trace-store.ts`). Unit 7 does not re-implement them.
2. **Nightly cron**: Vercel Cron route `app/app/api/cron/retention/route.ts` runs daily at 02:00 UTC. Cron handler can `await db.sql()` directly — no internal HTTP call needed. Query: `SELECT id FROM reasoning_traces WHERE expires_at < NOW() LIMIT 1000`. Delete in batches of 1000 with cursor pagination by `expires_at` to avoid long-running transactions.
3. **Cron authentication**: Vercel cron uses `VERCEL_CRON_SECRET` header; reject if missing or mismatched.

**Note on paths**: The Next.js App Router app directory is `app/app/` in this monorepo (double `app`). The cron route is at `app/app/api/cron/retention/route.ts`. Vercel config is at `app/vercel.json` (project root for the app deployment, per CLAUDE.md: `vercel.com/project/agentos-app`).

**Patterns to follow:**
- DOC-05 `RETENTION_DAYS = {standard: 30, flagged: 90}`
- Vercel Cron configuration (standard Vercel `vercel.json` cron syntax)
- Existing `app/lib/db/schema.sql` table patterns

**Test scenarios:**
- Trace created with `retention_days=30`, `created_at=today` → deleted after 31 days
- Trace flagged at creation → `retention_days=90` → not deleted after 31 days
- Trace not flagged but contains high-severity warning → `retention_days=90`
- Cron endpoint rejects request without `VERCEL_CRON_SECRET`

**Verification:**
- Cron job runs without error
- Traces past retention window confirmed deleted from DB
- Traces within retention window still queryable

---

## System-Wide Impact

- **Execution flow changes**: `runner.ts` is the hub — it must call `executeTool()` (Unit 4) for every tool, emit trace events (Unit 6) at each milestone, and check `requiresApproval` (Unit 5) before sensitive tools
- **SSE endpoint changes**: `/api/run` currently emits status events only. Unit 5 adds `approval_required` events; Unit 6 adds `reasoning:*` event types. Frontend must subscribe to both channels.
- **DB schema additions**: Three new table groups: (1) `pending_approvals` + `approval_decisions` (Unit 5), (2) `reasoning_traces` (Unit 6), (3) `capability_grants` (Unit 4/5). Existing `runs` table unchanged.
- **Auth changes**: None for MVP. `session.userId` ownership is already checked on `/api/run`; add same check to approval PUT and trace SSE endpoint.
- **NL interpretation**: `interpret.ts` must be updated to query the new capability registry (Unit 2) instead of `PHASE1_AGENTS`. The `AgentGraph` output shape stays the same.
- **`test-suite.ts` coupling**: The existing NL interpretation test suite (`app/lib/nl/test-suite.ts`) has 21 test pairs with hardcoded `expectedRoles` values (e.g., `'email_reader'`, `'response_drafter'`) derived from `PHASE1_AGENTS` keys. When Unit 2 replaces `PHASE1_AGENTS`, the LLM prompt must produce the same role identifiers. This is the critical validation for Unit 2 — all 21 test pair role expectations must continue to match. Additionally, add `app/lib/registry/__tests__/interpret-registry-integration.test.ts` with a mock LLM to verify interpret queries the new registry correctly (this is more reliable than depending on the full LLM-dependent test-suite for integration coverage).

## Integration Test Matrix

> Cross-unit integration tests that span multiple implementation units. Each test exercises the interaction surface between components, not isolated unit behavior. Assigned to the unit whose verification section owns the test; other units are noted as participants.

| # | Test Name | What It Exercises | Success Criteria |
|---|-----------|-------------------|------------------|
| INT-1 | **Approval Pause/Resume + SSE + Downstream Skip** | The full approval lifecycle: runner calls a tool requiring approval → middleware pauses the tool call and emits `approval_required` SSE → UI displays the modal → user approves (or cancels/max iterations) → runner resumes or skips the tool → downstream agents receive skip signal and handle gracefully. | Tool pauses at middleware when `requiresApproval=true`; `approval_required` SSE event delivered to client; approval resolution (approve/edit/skip) unblocks the tool call; cancelled/skipped tool does not crash downstream agents; skip signal propagates correctly through the DAG |
| INT-2 | **SSE Reconnect/Replay from `lastSequence`** | SSE cursor-based reconnection: client disconnects mid-run with `lastSequence=N`; reconnects to `/api/runs/:runId/events?lastSequence=N`; receives only events after sequence N, not a full replay. | Reconnect request with `lastSequence` returns events starting at N+1; no duplicate events delivered; stream resumes correctly even if the original SSE connection was open for a long time |
| INT-3 | **Degraded MCP Mode with Stale Cache** | MCP client behaves correctly when the Zapier MCP server is unavailable or returning errors: manifest is served from stale cache (within TTL), tool calls fail gracefully with user-facing error surfaced in canvas, not crash. | When MCP server is unreachable, cached manifest (if within TTL) is used; tool call failure surfaces a meaningful error in canvas ("Unable to connect to your apps") not a raw exception; when TTL expired, new connection attempt is made and appropriate error delivered |
| INT-4 | **Capability Grant Lifecycle** | The full capability grant flow: non-admin user attempts privileged tool (PAYMENTS) → middleware blocks it and surfaces grant UI → admin grants PAYMENTS capability → `ToolPermissions` updated → user retries tool → call succeeds. Also covers: admin denies, user never receives grant, grant revoked mid-run. | Privileged tool blocked before grant; grant request appears in admin inbox; admin approval updates `ToolPermissions` for user; subsequent tool call succeeds; denial and revocation scenarios handled correctly |

**Assignment notes:**
- **INT-1** is verified in Unit 5 (Human Approval UX) verification, with runner (Unit 4) and SSE (Unit 6) as participants
- **INT-2** is verified in Unit 6 (Reasoning Trace Infrastructure) verification, consuming the SSE reconnect contract from the run route
- **INT-3** is verified in Unit 3 (MCP Client Integration) verification, exercising the manifest cache and error translation from Unit 4
- **INT-4** is verified in Unit 5 (Human Approval UX) verification, covering the `CapabilityGrantRequest` flow described in Unit 5's approach

## Risks & Dependencies

- **Risk: MCP server unavailability** — If Zapier MCP server is down, no tools are available. Mitigate: surface meaningful error in canvas ("Unable to connect to your apps"), don't crash the NL interpretation.
- **Risk: Circular dependency between Unit 2 and Unit 3** — Capability registry (Unit 2) needs to know what tools exist to register them; MCP client (Unit 3) maps tools to capabilities. Mitigate: design capability schema first, then MCP mapper references the schema.
- **Risk: Canvas node spec (Unit 1) reveals needed backend changes** — If the spec demands real-time features (live milestone updates while agent is running), Unit 6's SSE architecture may need to be more sophisticated. Mitigate: spec is directional; adjust Unit 6 if needed.
- **Risk: GDPR cron on Vercel** — Vercel Cron has execution time limits. If `reasoning_traces` table grows large (many runs), the nightly DELETE may hit timeouts. Mitigate: batch deletions (1000 rows per iteration), use cursor-based pagination.

## Documentation / Operational Notes

- Add `app/docs/ARCHITECTURE-06-canvas-node-spec.md` after Unit 1 is complete (captures the decisions made in the spec work)
- Add `app/docs/RETENTION.md` describing the cron job, retention tiers, and operational runbook
- Add entry to `app/CLAUDE.md` documenting the new architecture units for future agents
- Vercel Cron requires `vercel.json` with `crons` array — confirm this with `/setup-deploy` before Unit 7

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-30-agentos-v3-nl-canvas-requirements.md](docs/brainstorms/2026-03-30-agentos-v3-nl-canvas-requirements.md)
- **Architecture docs:**
  - [docs/ARCHITECTURE-01-capability-registry.md](docs/ARCHITECTURE-01-capability-registry.md)
  - [docs/ARCHITECTURE-02-mcp-client.md](docs/ARCHITECTURE-02-mcp-client.md)
  - [docs/ARCHITECTURE-03-reliability-middleware.md](docs/ARCHITECTURE-03-reliability-middleware.md)
  - [docs/ARCHITECTURE-04-human-approval-ux.md](docs/ARCHITECTURE-04-human-approval-ux.md)
  - [docs/ARCHITECTURE-05-reasoning-trace.md](docs/ARCHITECTURE-05-reasoning-trace.md)
- **Existing implementation:**
  - `app/lib/nl/interpret.ts` — NL interpretation
  - `app/components/canvas-panel.tsx` — Canvas renderer
  - `app/lib/runtime/runner.ts` — Agent runner
  - `app/app/api/run/route.ts` — SSE streaming
- Related PRs/issues: N/A (new MVP build)
