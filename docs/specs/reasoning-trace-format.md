# Spec: Reasoning Trace Format

**Date:** 2026-04-01
**Status:** Draft
**Owner:** Engineering
**PRD Ref:** `docs/PRD.md` v4 — MVP Feature 3 (Real-Time Reasoning Traces); Durable Execution plan §2.4

---

## Goal

Define the JSON schema and SSE (Server-Sent Events) contract for streaming reasoning trace events from the agent runtime to the Canvas UI. This is the shared contract — engineers building the durable runner and engineers building the reasoning panel both implement from this document.

---

## Overview

The agent runtime emits a stream of **step events** as an agent works. Each step is a JSON object delivered over SSE. The Canvas UI renders these steps in real time as Maria watches her agent think.

```
Agent Runtime (DurableRunner)
    │
    │  SSE stream — one JSON event per step
    ▼
Canvas UI (ReasoningPanel)
    │  Renders: tool call → result → decision → ...
    ▼
Maria sees: "Checking inbox... Found 12 emails... Escalating 1..."
```

---

## Step Event Schema

Every event is a JSON object with a `type` field that determines the shape of the rest of the object.

### Base Fields (all events)

```typescript
interface BaseStep {
  step_id: string;        // ULID — stable, sortable by creation time
  run_id: string;          // The parent run this step belongs to
  agent_id: string;        // The agent producing this step
  seq: number;             // Monotonic sequence number within the run (0, 1, 2...)
  timestamp: string;       // ISO 8601 — when the step was created
  type: StepType;         // Discriminator
}
```

### Step Types

```typescript
type StepType =
  | 'agent_started'
  | 'tool_call'
  | 'tool_result'
  | 'decision'
  | 'escalate'
  | 'completed'
  | 'error'
  | 'heartbeat'
  | 'checkpoint_saved';
```

---

## Event Definitions

### `agent_started`

Emitted once when the agent begins a new run.

```typescript
interface AgentStartedStep extends BaseStep {
  type: 'agent_started';
  payload: {
    agent_name: string;
    agent_id: string;
    run_id: string;
    trigger: {
      type: 'scheduled' | 'manual' | 'event';
      detail?: string;       // e.g., cron expression or event name
    };
    instructions: string;    // The agent's system prompt / instructions
    tools: string[];        // Tool IDs available to this agent
  };
}
```

**Canvas rendering:** Adds a header to the reasoning panel: "Email Agent started • 10:32am"

---

### `tool_call`

Emitted when the agent invokes a tool. One per tool invocation.

```typescript
interface ToolCallStep extends BaseStep {
  type: 'tool_call';
  payload: {
    tool_name: string;       // e.g., "read_email", "send_email", "gmail_search"
    tool_input: {
      // Tool-specific input — schema varies per tool
      // See §Tool Schemas below
    };
    concurrency_key?: string;  // Present if this tool is concurrency-partitioned
  };
}
```

**Canvas rendering:**

```
🔧 10:32:04 — Tool: read_email
   Input: { count: 5, filter: "unread" }
```

---

### `tool_result`

Emitted when a tool completes (success or failure).

```typescript
interface ToolResultStep extends BaseStep {
  type: 'tool_result';
  payload: {
    tool_name: string;
    tool_output: {
      // Tool-specific output — schema varies per tool
      // See §Tool Schemas below
    };
    duration_ms: number;    // How long the tool took to execute
    success: boolean;
    error?: string;         // Present if success === false
  };
}
```

**Canvas rendering:**

```
✅ 10:32:05 — read_email returned 5 emails
   (collapsible — expand to see email list)
```

---

### `decision`

Emitted when the agent makes a reasoning decision — choosing what to do next.

```typescript
interface DecisionStep extends BaseStep {
  type: 'decision';
  payload: {
    reasoning: string;      // The LLM's chain-of-thought — what it concluded
    action: string;         // Human-readable description of what it will do next
    confidence: number;    // 0.0 – 1.0 — only present if confidence scoring enabled
    tools_invoking?: string[]; // Tools this decision will call next
  };
}
```

**Canvas rendering:**

```
💭 10:32:06 — Decision
   "3 new leads found. Prioritizing by recency. Will draft responses for 2,
    escalating the $50K enterprise inquiry to Maria for approval."
   Next: draft_email (2x), escalate (1x)
```

---

### `escalate`

Emitted when the agent decides it needs human input before proceeding.

```typescript
interface EscalateStep extends BaseStep {
  type: 'escalate';
  payload: {
    reason: string;         // Human-readable explanation of why escalation happened
    confidence: number;    // 0.0 – 1.0
    threshold: number;     // The confidence threshold that was not met
    proposed_action: {
      action_type: 'send_email' | 'approve_request' | 'reply_to_customer' | 'other';
      summary: string;      // One-line description of what the agent wants to do
      detail: object;      // Action-specific payload (email draft, approval details, etc.)
    };
    notification_sent: boolean;  // Was Maria notified via push?
    escalation_id: string;   // ULID — used to track this escalation through to resolution
  };
}
```

**Canvas rendering:**

```
⚠️  10:32:07 — ESCALATE
    Confidence: 0.31 / threshold: 0.85
    Reason: "Budget mentioned ($50K) but not confirmed > $10K approval limit"

    ┌─────────────────────────────────────────┐
    │  Email Agent wants to send this email: │
    │  To: lead@hitech.com                   │
    │  Subject: Re: Enterprise Pricing       │
    │  [Preview full email...]               │
    │                                         │
    │  [Approve & Send] [Edit & Approve]    │
    │  [I Will Reply] [Cancel]              │
    └─────────────────────────────────────────┘
```

---

### `completed`

Emitted when the agent run finishes successfully.

```typescript
interface CompletedStep extends BaseStep {
  type: 'completed';
  payload: {
    exit_reason: 'completed';   // Always 'completed' for this type
    summary: string;           // Human-readable run summary
    steps_completed: number;   // Total steps in this run
    tools_used: string[];       // Unique tool IDs called
    emails_handled?: number;   // Present if email agent
    escalated_count: number;
    handled_count: number;
    duration_ms: number;
  };
}
```

**Canvas rendering:**

```
✅ 10:45:00 — Completed
   Handled 14 emails. 2 escalated. 12 auto-replied.
   Duration: 13 minutes
```

---

### `error`

Emitted when the agent run fails.

```typescript
interface ErrorStep extends BaseStep {
  type: 'error';
  payload: {
    exit_reason: 'error';
    error_code: string;         // e.g., 'TOOL_TIMEOUT', 'RATE_LIMIT', 'CONTEXT_OVERFLOW'
    message: string;           // Human-readable error description
    recoverable: boolean;       // If true, the run can be retried
    retry_after_ms?: number;    // Present if recoverable === true
    last_successful_step_id?: string;  // The step before the error
  };
}
```

**Canvas rendering:**

```
❌ 10:45:00 — Error: RATE_LIMIT
   Gmail API rate limit hit. Will retry in 30 seconds.
   [Retry Now] [Stop Agent]
```

---

### `heartbeat`

Emitted periodically during long-running agents to show the agent is still active.

```typescript
interface HeartbeatStep extends BaseStep {
  type: 'heartbeat';
  payload: {
    memory_fact_count: number;    // Current working memory size
    tokens_used: number;          // Approximate token count for this run
    tokens_remaining: number;      // Estimated tokens left in context window
    run_duration_ms: number;
  };
}
```

**Canvas rendering:** Not shown as a visible step in the reasoning panel (too noisy). Used for the agent card status bar only.

---

### `checkpoint_saved`

Emitted after a successful checkpoint is persisted to Postgres.

```typescript
interface CheckpointSavedStep extends BaseStep {
  type: 'checkpoint_saved';
  payload: {
    checkpoint_id: string;      // The ULID of the saved checkpoint
    run_id: string;
    step_id: string;           // The step_id this checkpoint represents
    tokens_at_checkpoint: number;
    saved_at: string;          // ISO 8601
  };
}
```

**Canvas rendering:** Not shown in the reasoning panel. Internal durability signal. Used for debugging only.

---

## SSE Transport Contract

### Endpoint

```
GET /api/agents/{agentId}/runs/{runId}/stream
Authorization: Bearer {session_token}
Accept: text/event-stream
```

### SSE Message Format

Each event is sent as a **separate SSE comment block**:

```
event: step
data: {"step_id":"01AR7MK...","run_id":"01AR7MJ...","agent_id":"01AR7MH...","seq":0,"timestamp":"2026-04-01T10:32:04.123Z","type":"agent_started","payload":{...}}

event: step
data: {"step_id":"01AR7ML...","run_id":"01AR7MJ...","agent_id":"01AR7MH...","seq":1,"timestamp":"2026-04-01T10:32:04.456Z","type":"tool_call","payload":{...}}

```

### SSE Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no      # Disable Nginx buffering for SSE
```

### Connection Lifecycle

1. Client opens SSE connection
2. Server sends `agent_started` as first event (seq: 0)
3. Server sends steps sequentially (seq: 1, 2, 3...)
4. Terminal step (`completed` or `error`) is last event — client should close connection after receiving it
5. If client disconnects early, server continues running (idempotent — state is in Postgres)

### Reconnection

If the client disconnects and reconnects:
1. Client calls `GET /api/agents/{agentId}/runs/{runId}/steps?after_seq={last_seq}`
2. Server returns all steps after `last_seq` (up to 1000 per page)
3. Client renders missed steps, then opens new SSE connection from seq: current

---

## REST API — Step Polling

For clients that don't support SSE (or for paginated history):

### List Steps

```
GET /api/agents/{agentId}/runs/{runId}/steps?after_seq={n}&limit={100}
```

**Response 200:**

```json
{
  "steps": [...],
  "has_more": true,
  "next_seq": 42
}
```

### Get Single Step

```
GET /api/agents/{agentId}/runs/{runId}/steps/{stepId}
```

### Get Run Summary

```
GET /api/agents/{agentId}/runs/{runId}
```

```json
{
  "run_id": "01AR7MJ...",
  "agent_id": "01AR7MH...",
  "status": "running",
  "current_step_seq": 37,
  "started_at": "2026-04-01T10:32:04.123Z",
  "exit_reason": null
}
```

---

## Tool Schemas

Each tool has a defined input/output schema.

### `read_email`

**Input:**

```typescript
{
  count?: number;        // Default: 5, max: 50
  filter?: 'unread' | 'all';  // Default: 'unread'
  labels?: string[];     // e.g., ['INBOX'] — Gmail labels
}
```

**Output:**

```typescript
{
  emails: Array<{
    id: string;           // Gmail message ID
    from: string;
    to: string;
    subject: string;
    snippet: string;      // First 200 chars
    date: string;        // ISO 8601
    labels: string[];
    thread_id: string;
    has_attachments: boolean;
  }>;
  total_matched: number;  // Total emails matching filter (may exceed count)
}
```

---

### `send_email`

**Input:**

```typescript
{
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;          // Plain text or HTML
  thread_id?: string;    // For reply/forward — threads the message
  draft_id?: string;     // If editing an existing draft
}
```

**Output:**

```typescript
{
  message_id: string;
  thread_id: string;
  to: string[];
  subject: string;
  sent_at: string;       // ISO 8601
}
```

---

### `search_emails`

**Input:**

```typescript
{
  query: string;         // Gmail search syntax: "from:boss subject:urgent"
  count?: number;        // Default: 10, max: 100
  after?: string;        // ISO 8601 date filter
  before?: string;       // ISO 8601 date filter
}
```

**Output:** Same as `read_email` output shape.

---

### Escalation Resolution Events (from Canvas → Runtime)

When Maria acts on an escalation, the Canvas sends a resolution back:

```
POST /api/agents/{agentId}/runs/{runId}/escalations/{escalationId}/resolve
```

```typescript
// Request
{
  action: 'approve' | 'edit_approve' | 'human_will_reply' | 'cancel';
  edited_payload?: object;    // Present if action === 'edit_approve'
  notes?: string;             // Optional notes from Maria
}

// Response 200
{
  escalation_id: string;
  resolved: true;
  agent_notified: boolean;
}
```

---

## Error Codes

| Code | Meaning | Recoverable? |
|------|---------|--------------|
| `TOOL_TIMEOUT` | Tool took > 30s | Yes — retry |
| `TOOL_RATE_LIMIT` | API rate limit hit | Yes — wait + retry |
| `TOOL_AUTH_ERROR` | OAuth token expired | Yes — refresh token |
| `CONTEXT_OVERFLOW` | Token limit would be exceeded | No — compact or fail |
| `AGENT_LOOP_DETECTED` | Same tool called 5x consecutively | No — escalate |
| `CHECKPOINT_FAILED` | Could not save checkpoint | Yes — retry 3x then fail |
| `RUN_TIMEOUT` | Run exceeded max duration | No — stop + report |
| `HEARTBEAT_MISSED` | 3 consecutive heartbeats missed | Yes — resume from checkpoint |

---

## Idempotency

Every step has a stable `step_id` (ULID) derived from the durable runner's state. If the SSE stream is interrupted and reconnected, the client must deduplicate by `step_id` — the server may replay the same step on reconnection.

Clients MUST use `step_id` as the deduplication key, not `seq`. `seq` is monotonically increasing but not stable across reconnections.

---

## Open Questions (Deferred to Implementation)

| Question | Why Deferred | How Resolved |
|---|---|---|
| Max step buffer size on server? | Memory pressure during long runs | Config flag, default 10,000 steps per run |
| Step TTL / retention? | Storage cost for long histories | 90-day retention in Postgres (matches activity log) |
| Streaming compression (gzip)? | SSE can be large for text-heavy traces | Enable gzip in Vercel Edge config |
| Batch vs. individual emit? | Efficiency vs. latency tradeoff | Emit every step individually for real-time feel |

---

## Implementation Dependencies

- **Durable Execution plan (Unit 2):** `DurableRunner.emitStep()` must conform to this schema
- **Canvas UI plan (Unit 3):** `ReasoningPanel` renders events matching this schema
- **NL-to-Agent plan (Unit 1):** Escalation resolution API called by escalation modal

---

## Files to Create

| File | Purpose |
|------|---------|
| `app/lib/agent/steps.ts` | Step type definitions + factory functions |
| `app/lib/agent/step-emitter.ts` | SSE emitter class wrapping Node.js `EventEmitter` |
| `app/app/api/agents/[agentId]/runs/[runId]/stream/route.ts` | SSE streaming endpoint |
| `app/app/api/agents/[agentId]/runs/[runId]/steps/route.ts` | REST step polling endpoint |
| `app/app/api/agents/[agentId]/runs/[runId]/escalations/[escalationId]/resolve/route.ts` | Escalation resolution |
| `app/types/steps.ts` | Exported TypeScript types (used by Canvas) |
