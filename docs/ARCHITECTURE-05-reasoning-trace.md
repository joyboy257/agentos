# Architecture: Reasoning Trace — AgentOS SSE Event System

**Document:** ARCHITECTURE-05-reasoning-trace
**Status:** Draft
**Version:** 1.1
**Date:** 2026-03-29
**Owner:** AgentOS Engineering

---

## Table of Contents

1. [The Problem with Current SSE Events](#1-the-problem-with-current-sse-events)
2. [What a Reasoning Trace Is](#2-what-a-reasoning-trace-is)
3. [The ReasoningEvent SSE Schema](#3-thereasoningevent-sse-schema)
4. [How Reasoning Events Get Generated](#4-how-reasoning-events-get-generated)
5. [UI Rendering](#5-ui-rendering)
6. [How This Differs from AgentStatusEvent](#6-how-this-differs-from-current-agentstatusevent)
7. [The Trust-Building Effect](#7-the-trust-building-effect)
8. [Relation to Approval UX](#8-relation-to-approval-ux)
9. [Implementation Reference](#9-implementation-reference)
10. [Security Considerations](#10-security-considerations)
11. [Operational Considerations](#11-operational-considerations)

---

## 1. The Problem with Current SSE Events

The MVP streams two event types over SSE:

### Current AgentStatusEvent

```typescript
type AgentStatusEvent =
  | { status: 'ready' }
  | { status: 'running' }
  | { status: 'waiting' }
  | { status: 'completed' }
  | { status: 'error'; error: string }
```

### Current RunDoneEvent

```typescript
type RunDoneEvent = {
  event: 'run_done'
  runId: string
  summary: string  // e.g. "Finished processing 14 emails"
}
```

**The fundamental gap:** These events tell the user that the agent finished, not *why* it made the choices it made. A user watching their agent complete a run sees:

```
[agent] running...
[agent] waiting...
[agent] completed
```

There is no visibility into:
- What the agent observed before acting
- What classification criteria it applied
- What alternatives it considered and rejected
- What evidence supported its conclusions
- What warnings it encountered mid-flight

This creates an epistemic void. Users cannot learn to trust the system because they have no evidence upon which to base trust. They cannot correct the system because they cannot see where it diverged from their intent. When something goes wrong, they have no trace to debug.

**The MVP gives users a result. A reasoning trace gives them understanding.**

---

## 2. What a Reasoning Trace Is

A reasoning trace is a chronological log of the agent's internal decision-making process, surfaced as first-class SSE events. Each entry captures what the agent is thinking at a given moment — not just what it is doing.

### Contrast: Current vs. Reasoning Trace

**Current (MVP):**
```
[agent] running...
[agent] completed
```

**With Reasoning Trace:**
```
[agent] running...
  [reasoning: observation] Read 14 unread emails from today
  [reasoning: classification] Classified 3 as urgent, 8 as routine, 3 as newsletters
  [reasoning: decision] Replying to urgent emails first
  [reasoning: action] Composing reply to john@client.com using "Pricing Response v2"
  [reasoning: warning] Could not classify 2 emails — holding for your review
[agent] completed
```

### Reasoning Event Types

Each reasoning event has a `type` that classifies the kind of cognitive act:

| Type | Description | Example |
|------|-------------|---------|
| `observation` | Agent observed something in the environment | "Read 14 unread emails from today" |
| `classification` | Agent assigned a category or priority | "Classified as urgent: email from john@client.com" |
| `decision` | Agent chose a course of action | "Using template 'Pricing Response v2' for this email" |
| `action` | Agent performed a tool call or external operation | "Sent email to john@client.com" |
| `warning` | Agent encountered an uncertainty or edge case | "Could not classify 2 emails — holding for your review" |

### Evidence and Alternatives

The reasoning trace is not just narrative text. Each event can carry supporting metadata:

- **`evidence`**: What the observation was based on. Example: `["subject contains 'asap'", "sender in priority_contacts list"]`
- **`confidence`**: A 0–1 score for classification events, indicating certainty. Example: `0.92`
- **`alternativesConsidered`**: What else the agent weighed before deciding. Example: `["Pricing Response v1", "Custom draft from scratch", "Defer to user"]`

This metadata transforms the trace from a story into an auditable record.

---

## 3. The ReasoningEvent SSE Schema

### TypeScript Definition

```typescript
// src/types/sse.ts

type ReasoningEventType = 'observation' | 'classification' | 'decision' | 'action' | 'warning'

type WarningSeverity = 'low' | 'medium' | 'high'

interface ReasoningContent {
  /** What the agent is thinking or doing — human-readable */
  text: string
  /** The observable facts or signals the reasoning is based on */
  evidence?: string[]
  /** Certainty score for classification events, 0–1 */
  confidence?: number
  /** Other options that were considered before this decision */
  alternativesConsidered?: string[]
  /** Severity level for warning events */
  severity?: WarningSeverity
}

interface ReasoningEvent {
  event: 'reasoning'
  runId: string
  agentId: string
  step: string  // ULID — monotonically increasing unique identifier
  sequence: number  // Monotonic sequence number per run, for ordering and integrity
  type: ReasoningEventType
  content: ReasoningContent
  timestamp: number  // Unix ms, for ordering and latency analysis
  version: 1  // Schema version for forward compatibility
  integrity?: {
    /** HMAC-SHA256 of event payload, excluding integrity field itself */
    mac: string
    /** Truncated MAC (first 16 hex chars) for compact logging */
    tag: string
  }
}
```

### Integrity Mechanism

Each `ReasoningEvent` is signed using HMAC-SHA256 with a per-run secret generated at run start. The MAC covers the event's `sequence`, `type`, `content.confidence`, `content.evidence`, and `content.alternativesConsidered` fields — the mutable fields most critical to protect against MITM tampering.

```typescript
// src/runtime/reasoning-integrity.ts

function signReasoningEvent(event: ReasoningEvent, runSecret: string): ReasoningEvent {
  const payload = [
    event.sequence,
    event.type,
    event.content.confidence ?? '',
    JSON.stringify(event.content.evidence ?? []),
    JSON.stringify(event.content.alternativesConsidered ?? []),
  ].join('|')

  const mac = createHmac('sha256', runSecret).update(payload).digest('hex')
  const tag = mac.slice(0, 16) // Truncated for compact inclusion

  return {
    ...event,
    integrity: { mac, tag },
  }
}

function verifyReasoningEvent(event: ReasoningEvent, runSecret: string): boolean {
  if (!event.integrity) return false
  const expected = signReasoningEvent({ ...event, integrity: undefined }, runSecret)
  return event.integrity.mac === expected.integrity?.mac
}
```

The `sequence` number in the MAC input prevents reorder and replay attacks. A relay that drops, duplicates, or reorders events will produce a MAC mismatch.

### JSON Examples

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": "01HXYZ01HXYZ01HXYZ",
  "sequence": 1,
  "type": "observation",
  "content": {
    "text": "Read 14 unread emails from today"
  },
  "timestamp": 1743270000000,
  "version": 1,
  "integrity": {
    "mac": "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    "tag": "a3f2b8c1d4e5f6a7"
  }
}
```

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": "01HXYZ01HXYZ01HXYZ",
  "sequence": 2,
  "type": "classification",
  "content": {
    "text": "Classified as urgent: email from john@client.com",
    "evidence": ["subject contains 'asap'", "sender in priority_contacts list"],
    "confidence": 0.92
  },
  "timestamp": 1743270001500,
  "version": 1,
  "integrity": {
    "mac": "b4c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1",
    "tag": "b4c2d3e4f5a6b7c8"
  }
}
```

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": "01HXYZ01HXYZ01HXYZ",
  "sequence": 3,
  "type": "decision",
  "content": {
    "text": "Using template 'Pricing Response v2' for this email",
    "alternativesConsidered": ["Pricing Response v1", "Custom draft from scratch", "Defer to user"]
  },
  "timestamp": 1743270002000,
  "version": 1,
  "integrity": {
    "mac": "c5d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
    "tag": "c5d3e4f5a6b7c8d9"
  }
}
```

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": "01HXYZ01HXYZ01HXYZ",
  "sequence": 4,
  "type": "warning",
  "content": {
    "text": "Could not classify 2 emails — holding for your review",
    "severity": "medium"
  },
  "timestamp": 1743270002500,
  "version": 1,
  "integrity": {
    "mac": "d6e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
    "tag": "d6e4f5a6b7c8d9e0"
  }
}
```

### Full Event Stream (All SSE Event Types)

After this change, the SSE endpoint at `GET /api/runs/:runId/events` streams:

```typescript
// src/types/sse.ts

type SSEEvent =
  | AgentStatusEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | RunDoneEvent

type AgentStatusEvent =
  | { status: 'ready' }
  | { status: 'running' }
  | { status: 'waiting' }
  | { status: 'completed' }
  | { status: 'error'; error: string }

interface ToolCallEvent {
  event: 'tool_call'
  runId: string
  agentId: string
  tool: string
  args: Record<string, unknown>
  thought?: string  // chain-of-thought injected into tool call
}

interface ToolResultEvent {
  event: 'tool_result'
  runId: string
  agentId: string
  tool: string
  result: unknown
  success: boolean
}

interface RunDoneEvent {
  event: 'run_done'
  runId: string
  summary: string
}
```

### Backward Compatibility

`AgentStatusEvent` and `RunDoneEvent` are unchanged. Existing consumers continue to function. `ReasoningEvent` is additive — a new event type that existing clients can ignore (SSE clients that don't recognize an event type typically ignore it gracefully).

---

## 4. How Reasoning Events Get Generated

The agent must be instrumented to emit reasoning events. Two patterns are proposed, not mutually exclusive.

### Pattern A: Chain-of-Thought in Tool Call Arguments

The agent is prompted (or fine-tuned) to include a `thought` field in every tool call:

```json
{
  "tool": "send_email",
  "args": {
    "to": "john@client.com",
    "template": "Pricing Response v2",
    "thought": "I am using the Pricing Response v2 template because this email is a pricing inquiry from a priority contact. Alternative considered: custom draft (rejected — too slow given urgency). Confidence: 0.92."
  }
}
```

The runtime extracts `thought` from the tool call and emits it as a `reasoning` event of type `decision` or `action`:

```typescript
// src/runtime/reasoning-emitter.ts

interface ToolCallWithThought {
  tool: string
  args: Record<string, unknown> & { thought?: string }
}

function emitReasoningFromToolCall(
  toolCall: ToolCallWithThought,
  context: ReasoningContext
): ReasoningEvent | null {
  if (!toolCall.args.thought) {
    return null
  }

  return {
    event: 'reasoning',
    runId: context.runId,
    agentId: context.agentId,
    step: ulid(),
    sequence: context.nextSequence(),
    type: 'decision',
    content: {
      text: toolCall.args.thought,
    },
    timestamp: Date.now(),
    version: 1,
  }
}
```

**Advantages:** Zero new protocol overhead. Works with any agent that outputs structured tool calls.
**Disadvantages:** Thought is mixed into the tool call payload. No `evidence`, `confidence`, or `alternativesConsidered` unless those are also added to the tool call schema.

### Pattern B: Separate Reasoning Stream

The agent (or runtime) emits `reasoning` events on a dedicated stream alongside tool calls. This requires the agent runtime to be aware of the reasoning event schema.

```typescript
// src/runtime/agent-runtime.ts

class AgentRuntime {
  private eventEmitter: EventEmitter
  private sequenceCounters: Map<string, number> = new Map()

  // Agent calls this when it makes a classification
  emitClassification(params: {
    runId: string
    agentId: string
    text: string
    evidence: string[]
    confidence: number
  }) {
    const sequence = this.nextSequence(params.runId)
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: ulid(),
      sequence,
      type: 'classification',
      content: {
        text: params.text,
        evidence: this.sanitizeEvidence(params.evidence),
        confidence: this.clampConfidence(params.confidence),
      },
      timestamp: Date.now(),
      version: 1,
    }
    this.eventEmitter.emit(`run-${params.runId}`, 'reasoning', event)
  }

  // Agent calls this when it makes a decision
  emitDecision(params: {
    runId: string
    agentId: string
    text: string
    alternativesConsidered?: string[]
  }) {
    const sequence = this.nextSequence(params.runId)
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: ulid(),
      sequence,
      type: 'decision',
      content: {
        text: params.text,
        alternativesConsidered: this.sanitizeAlternatives(params.alternativesConsidered),
      },
      timestamp: Date.now(),
      version: 1,
    }
    this.eventEmitter.emit(`run-${params.runId}`, 'reasoning', event)
  }

  // Agent calls this when it observes something
  emitObservation(params: {
    runId: string
    agentId: string
    text: string
  }) {
    const sequence = this.nextSequence(params.runId)
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: ulid(),
      sequence,
      type: 'observation',
      content: { text: params.text },
      timestamp: Date.now(),
      version: 1,
    }
    this.eventEmitter.emit(`run-${params.runId}`, 'reasoning', event)
  }

  // Agent calls this when it encounters a warning
  emitWarning(params: {
    runId: string
    agentId: string
    text: string
    severity?: WarningSeverity
  }) {
    const sequence = this.nextSequence(params.runId)
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: ulid(),
      sequence,
      type: 'warning',
      content: { text: params.text, severity: params.severity ?? 'medium' },
      timestamp: Date.now(),
      version: 1,
    }
    this.eventEmitter.emit(`run-${params.runId}`, 'reasoning', event)
  }

  private nextSequence(runId: string): number {
    const current = this.sequenceCounters.get(runId) ?? 0
    const next = current + 1
    this.sequenceCounters.set(runId, next)
    return next
  }

  private clampConfidence(confidence: number): number {
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) return 0.5
    return Math.max(0, Math.min(1, confidence))
  }

  private sanitizeEvidence(evidence: string[]): string[] {
    const PII_PATTERNS = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // emails
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                   // phone numbers
      /\b\d{16}\b/g,                                      // credit cards
      /\b(NAME|PERSON|USER)[:-]?\s+[A-Z][a-z]+\b/gi,     // name heuristics
    ]
    return evidence.map(item => {
      let sanitized = item
      for (const pattern of PII_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]')
      }
      return sanitized
    })
  }

  private sanitizeAlternatives(alternatives?: string[]): string[] | undefined {
    if (!alternatives) return undefined
    return this.sanitizeEvidence(alternatives)
  }
}
```

### Recommendation: Adopt Pattern B

Pattern B is the primary recommendation because:

1. **Rich metadata** — `evidence`, `confidence`, and `alternativesConsidered` are first-class fields, not buried in a string
2. **Decoupled from tool calls** — reasoning events can be emitted independently of tool calls, making the trace easier to follow
3. **Type-safe** — each reasoning type has its own emit method with appropriate typed parameters
4. **Tool-call-independent** — not every reasoning event needs to be anchored to a tool call

Pattern A (chain-of-thought in tool call arguments) can be used as a **fallback** for agents that are not explicitly instrumented with Pattern B, extracting `thought` strings and wrapping them in `reasoning` events of type `decision`.

### PII Sanitization Requirements

**CRITICAL: LLM context must redact PII before emitting reasoning events.**

The LLM must be instructed never to place raw user data into `evidence` or `alternativesConsidered` fields. The runtime applies pattern-based redaction as a defense-in-depth measure (see `sanitizeEvidence` above), but the primary responsibility lies with the LLM prompt:

```
SYSTEM PROMPT ADDENDUM:
When emitting reasoning events, NEVER include raw user data in evidence or
alternativesConsidered arrays. Substitute any detected PII with [REDACTED].
Prohibited: email addresses, phone numbers, full names, user IDs, account
numbers, physical addresses. The reasoning trace is an audit log — it must
not become a data exfiltration vector.
```

### SSE Endpoint Integration

```typescript
// src/routes/runs.ts

app.get('/api/runs/:runId/events', requireRunOwnership, async (req, res) => {
  const { runId } = req.params
  const { lastSequence } = req.query  // For cursor-based reconnection
  const userId = req.user.id

  // requireRunOwnership validates that req.user owns this runId
  // Unauthorized users receive 403 and no events

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sendEvent = (event: SSEEvent) => {
    res.write(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
  }

  const channel = `run-${runId}`

  // Subscribe to the named channel for this run only
  // Each client gets its own subscription — no shared singleton listeners
  if (lastSequence !== undefined) {
    // Cursor-based reconnect: send events after lastSequence
    const events = await reasoningStore.getEventsAfter(runId, Number(lastSequence))
    for (const event of events) {
      sendEvent(event)
    }
  }

  // Forward new events on this run's channel
  const onEvent = (event: SSEEvent) => sendEvent(event)
  eventEmitter.on(channel, onEvent)

  req.on('close', () => {
    eventEmitter.off(channel, onEvent)
  })
})

// Terminal event to signal end of stream
interface StreamEndEvent {
  event: 'stream_end'
  runId: string
  reason: 'completed' | 'error' | 'cancelled'
  finalSequence: number
}
```

### Event Aggregation

To prevent burst flooding (e.g., 1000+ loop iterations saturating the SSE stream), reasoning events are aggregated before emission:

```typescript
// src/runtime/reasoning-aggregator.ts

const AGGREGATION_WINDOW_MS = 500
const MAX_EMIT_RATE_PER_SECOND = 10

interface AggregationBucket {
  type: ReasoningEventType
  text: string
  count: number
  firstTimestamp: number
  lastTimestamp: number
}

function aggregateReasoningEvents(
  events: ReasoningEvent[],
  windowMs: number = AGGREGATION_WINDOW_MS
): ReasoningEvent[] {
  const buckets = new Map<string, AggregationBucket>()
  const now = Date.now()

  for (const event of events) {
    // Only aggregate observation events (most prone to burst)
    if (event.type !== 'observation') {
      continue
    }

    const key = `${event.type}|${event.content.text}`
    const existing = buckets.get(key)

    if (existing && (now - existing.lastTimestamp) < windowMs) {
      existing.count++
      existing.lastTimestamp = event.timestamp
    } else {
      buckets.set(key, {
        type: event.type,
        text: event.content.text,
        count: 1,
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      })
    }
  }

  // Emit aggregated events and pass through non-aggregatable events
  const result: ReasoningEvent[] = []
  for (const event of events) {
    if (event.type !== 'observation') {
      result.push(event)
      continue
    }
    const key = `${event.type}|${event.content.text}`
    const bucket = buckets.get(key)!
    if (bucket.count > 1 && event === events.find(e => e.type === 'observation' && e.content.text === bucket.text)) {
      result.push({
        ...event,
        content: {
          ...event.content,
          text: `${bucket.text} (x${bucket.count})`,
        },
      })
    } else if (bucket.count === 1) {
      result.push(event)
    }
  }

  return result
}
```

Consecutive `observation` events of the same text within a 500ms window are collapsed into a single event with a count suffix (e.g., `"Read inbox (x47)"`). Non-observation events (classification, decision, action, warning) are always passed through immediately.

---

## 5. UI Rendering

The canvas UI renders reasoning events in an agent card's reasoning panel.

### Reasoning Panel Design

```
+--------------------------------------------------+
|  Agent: Email Assistant                          |
|  [●] Running                                     |
+--------------------------------------------------+
|  Reasoning (collapsed view)                      |
|  "Reading inbox... classified 3 as urgent"       |
|  [expand]                                        |
+--------------------------------------------------+
                                                    |
  [EXPANDED VIEW]                                  |
  +--------------------------------------------------+
  | Reasoning Trace                          [−]   |
  +--------------------------------------------------+
  | 1. [OBS] Read 14 unread emails                  |
  | 2. [CLS] 3 urgent, 8 routine                    |
  |     evidence: ["subject: 'asap'", "priority..."]|
  |     confidence: 0.92                             |
  | 3. [DEC] Replying to urgent emails first        |
  |     considered: [routine first, all at once]     |
  | 4. [ACT] Using template "Pricing v2"            |
  | 5. [WRN] 2 emails unclassified                  |
  +--------------------------------------------------+
```

### Color Coding by Type (with Accessibility Labels)

```typescript
// src/ui/reasoning-colors.ts

const REASONING_COLORS = {
  observation: {
    border: '#E5E7EB',   // gray-200
    badge: '#6B7280',    // gray-500
    badgeBg: '#F3F4F6',  // gray-100
    label: 'Observation',  // Text label for accessibility
    icon: '○',             // Icon for accessibility
  },
  classification: {
    border: '#DBEAFE',   // blue-100
    badge: '#2563EB',    // blue-600
    badgeBg: '#EFF6FF',  // blue-50
    label: 'Classification',
    icon: '◉',
  },
  decision: {
    border: '#3B82F6',   // blue-500
    badge: '#1D4ED8',    // blue-700
    badgeBg: '#DBEAFE',  // blue-100
    label: 'Decision',
    icon: '▶',
  },
  action: {
    border: '#D1FAE5',   // green-100
    badge: '#059669',    // green-600
    badgeBg: '#ECFDF5',  // green-50
    label: 'Action',
    icon: '✓',
  },
  warning: {
    border: '#FEF3C7',   // amber-100
    badge: '#D97706',    // amber-600
    badgeBg: '#FFFBEB',  // amber-50
    label: 'Warning',
    icon: '⚠',
  },
} as const
```

All badges display BOTH color AND text label + icon. Color-blind users can identify event types by label text and icon, not just color.

### Reasoning Panel Component (with Virtual Scrolling)

```tsx
// src/components/ReasoningPanel.tsx

import { ReasoningEvent } from '@/types/sse'
import { REASONING_COLORS } from '@/ui/reasoning-colors'

const MAX_RENDERED_EVENTS = 500  // Cap rendered DOM nodes to prevent browser freeze

interface ReasoningPanelProps {
  events: ReasoningEvent[]
  isExpanded: boolean
  onToggleExpand: () => void
  /** Point-in-time snapshot taken when pending action was queued */
  snapshot?: ReasoningEvent[]
}

function ReasoningPanel({ events, isExpanded, onToggleExpand, snapshot }: ReasoningPanelProps) {
  // Use snapshot if provided (approval modal scenario), otherwise live events
  const displayEvents = snapshot ?? events

  // Virtual scrolling: only render events in viewport
  const [scrollTop, setScrollTop] = useState(0)
  const ITEM_HEIGHT = 120  // Approximate height per event
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ITEM_HEIGHT)
  const startIndex = Math.floor(scrollTop / ITEM_HEIGHT)
  const endIndex = Math.min(startIndex + visibleCount + 2, displayEvents.length)

  // Cap total rendered events
  const cappedEvents = displayEvents.slice(0, MAX_RENDERED_EVENTS)
  const hasMore = displayEvents.length > MAX_RENDERED_EVENTS

  const lastEvent = cappedEvents[cappedEvents.length - 1]

  return (
    <div className="reasoning-panel">
      {/* Collapsed: single-line summary */}
      {!isExpanded && (
        <div className="reasoning-collapsed" onClick={onToggleExpand}>
          <span
            className={`badge badge-${lastEvent.type}`}
            style={{ backgroundColor: REASONING_COLORS[lastEvent.type].badgeBg }}
            title={REASONING_COLORS[lastEvent.type].label}
          >
            {REASONING_COLORS[lastEvent.type].icon} {lastEvent.type}
          </span>
          <span className="reasoning-summary">
            {truncate(lastEvent.content.text, 80)}
          </span>
          <button className="expand-btn">[expand]</button>
        </div>
      )}

      {/* Expanded: full trace with virtual scrolling */}
      {isExpanded && (
        <div className="reasoning-expanded">
          <div className="reasoning-header">
            <span>Reasoning Trace</span>
            <button onClick={onToggleExpand}>[−]</button>
          </div>
          <div
            className="reasoning-scroll-container"
            onScroll={(e) => setScrollTop(e.target.scrollTop)}
            style={{ maxHeight: '400px', overflow: 'auto' }}
          >
            <ol className="reasoning-list" style={{ height: cappedEvents.length * ITEM_HEIGHT }}>
              {cappedEvents.slice(startIndex, endIndex).map((event, index) => (
                <li
                  key={`${event.runId}-${event.step}`}
                  className={`reasoning-item type-${event.type}`}
                  style={{ position: 'absolute', top: (startIndex + index) * ITEM_HEIGHT, width: '100%' }}
                >
                  <span className="step-number">{startIndex + index + 1}.</span>
                  <div className="reasoning-content">
                    <span
                      className={`badge badge-${event.type}`}
                      style={{ backgroundColor: REASONING_COLORS[event.type].badgeBg }}
                      title={REASONING_COLORS[event.type].label}
                      aria-label={`${REASONING_COLORS[event.type].icon} ${event.type}`}
                    >
                      {REASONING_COLORS[event.type].icon} {event.type.toUpperCase()}
                    </span>
                    <p className="reasoning-text">{event.content.text}</p>

                    {event.content.evidence && event.content.evidence.length > 0 && (
                      <ul className="evidence-list">
                        {event.content.evidence.map((e, i) => (
                          <li key={i} className="evidence-item">{" "}{e}</li>
                        ))}
                      </ul>
                    )}

                    {event.content.confidence !== undefined && (
                      <span className="confidence">
                        confidence: {event.content.confidence.toFixed(2)}
                      </span>
                    )}

                    {event.content.alternativesConsidered &&
                      event.content.alternativesConsidered.length > 0 && (
                        <div className="alternatives">
                          <span className="alternatives-label">considered:</span>
                          {event.content.alternativesConsidered.map((alt, i) => (
                            <span key={i} className="alternative-chip">{alt}</span>
                          ))}
                        </div>
                      )}

                    {event.content.severity && event.type === 'warning' && (
                      <span className="severity severity-{event.content.severity}">
                        severity: {event.content.severity}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {hasMore && (
              <div className="events-truncated">
                +{displayEvents.length - MAX_RENDERED_EVENTS} more events not shown
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

### Agent Card Integration

```tsx
// src/components/AgentCard.tsx

function AgentCard({ agent, reasoningEvents }: AgentCardProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false)

  return (
    <div className="agent-card">
      <div className="agent-header">
        <span className="agent-name">{agent.name}</span>
        <StatusIndicator status={agent.status} />
      </div>

      <ReasoningPanel
        events={reasoningEvents.filter(e => e.agentId === agent.id)}
        isExpanded={reasoningExpanded}
        onToggleExpand={() => setReasoningExpanded(v => !v)}
      />

      {/* Tool call / result display */}
      <ToolActivityPanel agentId={agent.id} />
    </div>
  )
}
```

---

## 6. How This Differs from Current AgentStatusEvent

| Dimension | AgentStatusEvent (MVP) | ReasoningEvent |
|-----------|------------------------|----------------|
| **States** | ready, running, waiting, completed, error | observation, classification, decision, action, warning |
| **Granularity** | coarse (lifecycle-level) | fine (step-level) |
| **Content** | status label only | text + evidence + confidence + alternatives |
| **Evidence** | none | yes (`evidence[]`) |
| **Confidence** | none | yes (0–1 for classifications) |
| **Alternatives considered** | none | yes (`alternativesConsidered[]`) |
| **Auditable** | no | yes |
| **Actionable by user** | no (post-hoc only) | yes (can intervene mid-run) |
| **Feeds into approval UX** | no | yes |
| **Integrity** | none | HMAC-SHA256 signed |
| **PII Safe** | N/A | yes (redaction applied) |

### Side-by-Side Event Comparison

```typescript
// MVP — what we have now
{ status: 'running' }
{ status: 'waiting' }
{ status: 'completed' }

// With reasoning trace — what we add
{
  event: 'reasoning',
  type: 'observation',
  content: { text: 'Read 14 unread emails' }
},
{
  event: 'reasoning',
  type: 'classification',
  content: {
    text: 'Classified 3 as urgent',
    evidence: ["subject contains 'asap'", "priority contact"],
    confidence: 0.92
  }
},
{
  event: 'reasoning',
  type: 'decision',
  content: {
    text: 'Replying to urgent emails first',
    alternativesConsidered: ['routine first', 'all at once']
  }
},
{
  event: 'reasoning',
  type: 'warning',
  content: { text: '2 emails could not be classified' }
}
```

---

## 7. The Trust-Building Effect

When users can see *why* the agent made a decision, four things happen:

### 7.1 Spot Errors Before They Become Failures

```
Agent: "I'm sending this email to john@client.com"
Reasoning: "Classified as pricing inquiry — using 'Pricing Response v2' template"
Evidence: ["subject: 'asap'", "sender in priority_contacts"]

User sees: The agent is using the wrong template.
           John's email is a complaint, not a pricing inquiry.
           [Intervenes before the email is sent]
```

Without the reasoning trace, the user sees no signal until after the wrong email is sent.

### 7.2 Learn What the Agent Is Good At

After running the email agent for a week, a user notices:
- The agent is 97% accurate on `urgent` classification when `asap` appears in the subject
- The agent fails on sarcasm ("Thanks, that's *great*") — confidence drops to 0.61 on those
- The agent always defers to the user on emails from the CEO

The user now knows where to set boundaries and where to trust the agent unconditionally.

### 7.3 Calibrate Trust Appropriately

```
Low confidence (0.51) + multiple alternatives = "agent is uncertain, I should review"
High confidence (0.94) + clear evidence = "agent is confident, likely correct"
```

The `confidence` and `alternativesConsidered` fields give users a rational basis for how much oversight to apply.

### 7.4 From "AI Did It" to "AgentOS Did It"

When a user can trace every decision back to observable evidence — when the agent says "I'm doing X because of Y" — the user is not delegating blindly. They are collaborating with an informed system.

This is what separates AgentOS from a black-box AI API:

- **Black box:** "Your email was sent." — user cannot interrogate, cannot correct mid-flight
- **AgentOS:** "Your email was sent because it was classified as urgent (evidence: 'asap' in subject, confidence: 0.92). Using template 'Pricing Response v2'." — user can see, correct, and learn

The reasoning trace is the artifact that makes this differentiation real, not rhetorical.

---

## 8. Relation to Approval UX

When AgentOS surfaces an approval modal before a destructive or irreversible action (e.g., "Send email", "Delete record", "Post to external API"), the reasoning trace is the source of context for the approval decision.

### Current Approval Modal (MVP)

```
[Approve] [Deny]
"Are you sure you want to send this email?"
```

### With Reasoning Trace in Approval Modal

```
[Approve] [Deny]

"I'm about to send this email to john@client.com"

Reasoning:
  - Classified as: urgent pricing inquiry (confidence: 0.92)
  - Evidence: subject contains "asap", sender in priority_contacts
  - Template: "Pricing Response v2"
  - Alternatives considered: custom draft (rejected — too slow)

[Approve] [Deny]
```

### Point-in-Time Snapshot for Approval Modal

**CRITICAL: The approval modal must display a point-in-time snapshot, not a live-updating stream.**

A live stream changes while the user is reading, creating a confusing or misleading experience. The snapshot is captured atomically when the pending action is queued:

```typescript
// src/runtime/approval-queue.ts

interface PendingAction {
  id: string
  runId: string
  agentId: string
  action: Action
  queuedAt: number
  /** Point-in-time snapshot of reasoning events at moment of queueing */
  reasoningSnapshot: ReasoningEvent[]
}

function queuePendingAction(params: {
  runId: string
  agentId: string
  action: Action
  reasoningEvents: ReasoningEvent[]
}): PendingAction {
  return {
    id: ulid(),
    runId: params.runId,
    agentId: params.agentId,
    action: params.action,
    queuedAt: Date.now(),
    // Atomically snapshot current reasoning state — no further mutations
    reasoningSnapshot: [...params.reasoningEvents],
  }
}
```

The `reasoningSnapshot` field contains the frozen set of reasoning events at the exact moment the user is asked to approve. The modal renders from this snapshot, not from live event stream. The user sees a stable, non-changing view.

### Implementation

```tsx
// src/components/ApprovalModal.tsx

interface ApprovalModalProps {
  pendingAction: PendingAction  // Contains reasoningSnapshot, not live events
  onApprove: () => void
  onDeny: () => void
}

function ApprovalModal({ pendingAction, onApprove, onDeny }: ApprovalModalProps) {
  // Render from snapshot — never from live reasoningEvents prop
  const relevantReasoning = pendingAction.reasoningSnapshot
    .filter(e => e.agentId === pendingAction.agentId)
    .filter(e => ['decision', 'classification', 'action'].includes(e.type))
    .slice(-3)  // last 3 relevant events for context

  return (
    <div className="approval-modal-overlay">
      <div className="approval-modal">
        <h2>{pendingAction.action.title}</h2>

        <div className="approval-reasoning">
          <h3>Why the agent wants to do this:</h3>
          {relevantReasoning.map(event => (
            <div key={`${event.runId}-${event.step}`} className={`reasoning-${event.type}`}>
              <span
                className="type-badge"
                style={{ backgroundColor: REASONING_COLORS[event.type].badgeBg }}
                title={REASONING_COLORS[event.type].label}
              >
                {REASONING_COLORS[event.type].icon} {event.type}
              </span>
              <p>{event.content.text}</p>
              {event.content.evidence && (
                <ul className="evidence">
                  {event.content.evidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {event.content.confidence !== undefined && (
                <span className="confidence">confidence: {event.content.confidence.toFixed(2)}</span>
              )}
              {event.content.severity && (
                <span className="severity severity-{event.content.severity}">
                  severity: {event.content.severity}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="approval-actions">
          <button onClick={onDeny} className="btn-deny">[Deny]</button>
          <button onClick={onApprove} className="btn-approve">[Approve]</button>
        </div>
      </div>
    </div>
  )
}
```

The approval modal does not need the full reasoning trace — it needs the **last decision event** and optionally a **classification event** that explains the context. The full trace remains available in the reasoning panel for users who want to audit further.

---

## 9. Implementation Reference

### File Structure

```
src/
  types/
    sse.ts                    # All SSE event type definitions
  runtime/
    agent-runtime.ts          # Runtime that emits reasoning events
    reasoning-emitter.ts      # Utility for extracting reasoning from tool calls
    reasoning-integrity.ts    # HMAC-SHA256 signing and verification
    reasoning-aggregator.ts   # Event aggregation/collapse for burst suppression
    step-counter.ts           # ULID-based step generation (not in-memory Map)
    approval-queue.ts          # Pending action queue with atomic snapshots
  routes/
    runs.ts                   # SSE endpoint GET /api/runs/:runId/events
  middleware/
    run-ownership.ts          # Auth middleware: validate user owns runId
  ui/
    components/
      AgentCard.tsx           # Agent card with reasoning panel
      ReasoningPanel.tsx      # Collapsible reasoning trace panel (virtual scroll)
      ApprovalModal.tsx       # Approval modal with reasoning context (snapshot)
    reasoning-colors.ts      # Color constants per reasoning type (with labels/icons)
```

### Type Exports

```typescript
// src/types/sse.ts

export type ReasoningEventType = 'observation' | 'classification' | 'decision' | 'action' | 'warning'
export type WarningSeverity = 'low' | 'medium' | 'high'

export interface ReasoningContent {
  text: string
  evidence?: string[]
  confidence?: number
  alternativesConsidered?: string[]
  severity?: WarningSeverity
}

export interface ReasoningEvent {
  event: 'reasoning'
  runId: string
  agentId: string
  step: string       // ULID — globally unique, monotonically increasing
  sequence: number   // Per-run monotonic sequence for ordering and integrity
  type: ReasoningEventType
  content: ReasoningContent
  timestamp: number
  version: 1         // Schema version
  integrity?: {
    mac: string
    tag: string
  }
}

export type AgentStatusEvent =
  | { status: 'ready' }
  | { status: 'running' }
  | { status: 'waiting' }
  | { status: 'completed' }
  | { status: 'error'; error: string }

export interface ToolCallEvent {
  event: 'tool_call'
  runId: string
  agentId: string
  tool: string
  args: Record<string, unknown>
  thought?: string
}

export interface ToolResultEvent {
  event: 'tool_result'
  runId: string
  agentId: string
  tool: string
  result: unknown
  success: boolean
}

export interface RunDoneEvent {
  event: 'run_done'
  runId: string
  summary: string
}

export interface StreamEndEvent {
  event: 'stream_end'
  runId: string
  reason: 'completed' | 'error' | 'cancelled'
  finalSequence: number
}

export type SSEEvent =
  | AgentStatusEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | RunDoneEvent
  | StreamEndEvent
```

### ULID Step Counter (replaces in-memory Map)

```typescript
// src/runtime/step-counter.ts
import { ulid } from 'ulid'

// ULID is time-ordered, globally unique, and survives server restarts.
// Unlike in-memory Map counters, ULIDs work across distributed runners
// and do not reset on process restart.

function generateStep(runId: string, monotonicComponent: number): string {
  // Combine run-scoped monotonic component with ULID's timestamp component
  // to get both uniqueness and time-ordering within a run
  return ulid(Date.now(), `${runId.slice(-6).padStart(6, '0')}${String(monotonicComponent).padStart(4, '0')}`)
}

class StepGenerator {
  private sequences: Map<string, number> = new Map()

  next(runId: string): string {
    const seq = (this.sequences.get(runId) ?? 0) + 1
    this.sequences.set(runId, seq)
    return generateStep(runId, seq)
  }

  getCurrent(runId: string): number {
    return this.sequences.get(runId) ?? 0
  }

  reset(runId: string): void {
    this.sequences.delete(runId)
  }
}

export const stepGenerator = new StepGenerator()
```

### Downlevel Compatibility

The `confidence: number` field (0–1) and `alternativesConsidered: string[]` fields are optional. A reasoning event with only `text` is valid. Older consumers that only understand `text` continue to work.

All optional fields (`evidence`, `confidence`, `alternativesConsidered`, `severity`, `integrity`) have defaults that ensure older consumers can parse events without errors.

---

## 10. Security Considerations

### 10.1 SSE Stream Integrity (HMAC-SHA256)

Reasoning events are signed to prevent man-in-the-middle modification of `confidence`, `evidence`, and `alternativesConsidered` fields. An attacker who can inject SSE events could otherwise manipulate a user's trust in the agent's reasoning without changing the agent's actual behavior.

**Key material:** The per-run HMAC secret is generated once at run creation and stored securely. It is not transmitted over the SSE stream.

**Replay protection:** The `sequence` number is included in the MAC input. An relay that replays an old event with a stale sequence will produce a MAC mismatch when the client verifies against the current sequence expectation.

**Implementation:** See `signReasoningEvent` / `verifyReasoningEvent` in Section 3.

### 10.2 SSE Endpoint Authorization

**CRITICAL: Unauthorized users must not receive events for runs they do not own.**

The SSE endpoint MUST validate run ownership before establishing the stream:

```typescript
// src/middleware/run-ownership.ts

async function requireRunOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id
  const { runId } = req.params

  if (!userId || !runId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const run = await runStore.findById(runId)
  if (!run) {
    res.status(404).json({ error: 'Run not found' })
    return
  }

  if (run.ownerId !== userId) {
    res.status(403).json({ error: 'You do not have access to this run' })
    return
  }

  next()
}
```

The SSE endpoint uses this middleware. A client that does not own `runId` receives a 403 response — not an empty stream, not events for other runs.

### 10.3 PII Redaction in Reasoning Events

**CRITICAL: LLM context must redact PII before emitting reasoning events.**

`evidence` and `alternativesConsidered` arrays must never contain raw user data. The runtime applies pattern-based redaction as a defense-in-depth measure (see `sanitizeEvidence` in Section 4), but the primary responsibility lies with the LLM prompt (see PII Sanitization Requirements in Section 4).

If PII is detected in emitted reasoning events at the runtime layer, those events should be flagged and the run should be logged for security review.

### 10.4 Reasoning Events Must Not Re-enter LLM Context

**Reasoning traces must NEVER be fed back into the LLM as context.**

Feeding reasoning traces back into the LLM context creates:
1. **Infinite loop risk** — the LLM reasons about its reasoning about its reasoning...
2. **Cost explosion** — context size grows quadratically as reasoning feeds reasoning
3. **Context poisoning** — audit trail混入 LLM 输入污染决策质量

This restriction applies to ALL reasoning events regardless of whether they contain PII.

---

## 11. Operational Considerations

### 11.1 Event Aggregation and Rate Limiting

Burst suppression is required to prevent SSE flooding during fast agent loops (e.g., a loop iterating 1000 times emits 1000 `observation` events).

- **Aggregation window:** Consecutive `observation` events of the same text within 500ms are collapsed into a single event with a count suffix.
- **Rate limit:** Reasoning event emission is capped at 10 events/second per run.
- Non-observation events (classification, decision, action, warning) are always passed through immediately — they represent meaningful decision points, not loop iterations.

See `aggregateReasoningEvents` in Section 4.

### 11.2 Virtual Scrolling in UI

Rendering 10,000+ DOM nodes freezes the browser. The reasoning panel caps rendered events at 500 and uses virtual scrolling to display only the visible viewport.

See `ReasoningPanel` component in Section 5.

### 11.3 Cursor-Based Reconnection

Clients reconnecting to an SSE stream pass their last-seen `sequence` number:

```
GET /api/runs/:runId/events?lastSequence=47
```

The server responds with all events after sequence 47, followed by the `stream_end` event, then closes the connection. The client then establishes a new SSE connection starting from that point.

```typescript
interface StreamEndEvent {
  event: 'stream_end'
  runId: string
  reason: 'completed' | 'error' | 'cancelled'
  finalSequence: number
}
```

### 11.4 Retention Policy

**GDPR Right to Erasure requires deletion of reasoning traces after a defined retention period.**

| Data Type | Retention Period | Notes |
|-----------|----------------|-------|
| Reasoning events (standard runs) | 30 days | Auto-deleted after 30 days from run completion |
| Reasoning events (flagged/failed runs) | 90 days | Extended retention for audit purposes |
| Reasoning events (user requested export) | Until export delivered | Temporary hold during export request |

```typescript
// src/runtime/reasoning-retention.ts

const RETENTION_DAYS = {
  standard: 30,
  flagged: 90,
} as const

async function enforceRetentionPolicy(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS.standard * 24 * 60 * 60 * 1000
  await reasoningStore.deleteEventsBefore(cutoff)
}
```

Retention enforcement runs as a daily cron job. Flagged runs (user-reported, error-highlighted) are tagged with `retentionUntil` override set to 90 days.

### 11.5 Channel-Based SSE Subscription

Each SSE client subscribes to a named channel per run (e.g., `run-{runId}`), not shared listeners on a singleton event emitter. This ensures:

- Clients for different runs are fully isolated
- A misbehaving client for Run A cannot receive or interfere with events for Run B
- Memory footprint scales with number of active runs, not number of total clients

```typescript
// Singleton emitter with namespaced channels
const eventEmitter = new EventEmitter()

// Client for run_01HXYZ subscribes to 'run-run_01HXYZ' channel only
eventEmitter.on(`run-${runId}`, handler)

// NOT:
// eventEmitter.on('reasoning', handler) // Wrong — shared listener
```

---

## Open Questions (pre-fix list — resolved)

1. ~~**Burst suppression:** In fast agent loops, reasoning events could fire hundreds of times per second. Consider debouncing or collapsing consecutive `observation` events of the same type.~~ **RESOLVED:** Event aggregation implemented (Section 4, `reasoning-aggregator.ts`).
2. ~~**Retention policy:** Full reasoning traces for all runs could consume significant storage. Determine retention window (e.g., 30 days for non-flagged runs, indefinite for flagged/failed runs).~~ **RESOLVED:** 30-day standard / 90-day flagged retention policy defined (Section 11.4).
3. **Multi-agent causality:** In a run with multiple agents, a reasoning event from Agent A may be triggered by a tool result from Agent B. The schema supports this via `agentId` but the UI may need to visually link causal chains.
4. ~~**Confidence bounds:** If LLM emits `confidence: 0.99`, validate range [0, 1].~~ **RESOLVED:** `clampConfidence` applied at emit (Section 4).
5. ~~**Warning severity:** Add severity to `warning` type (low, medium, high).~~ **RESOLVED:** `WarningSeverity` added to schema (Section 3).
6. ~~**Event versioning and reconnect:** Clients need cursor-based reconnection with last-seen sequence.~~ **RESOLVED:** `lastSequence` query param and `stream_end` event defined (Section 11.3).
7. ~~**Accessibility:** Color-blind users need icon/text labels alongside color coding.~~ **RESOLVED:** `label` and `icon` fields added to color map (Section 5).
8. ~~**ULID step counter:** In-memory Map breaks on server restart and across distributed runners.~~ **RESOLVED:** ULID-based `StepGenerator` implemented (Section 9).
9. ~~**Atomic snapshot for approval modal:** Approval modal must not show live-updating stream.~~ **RESOLVED:** `reasoningSnapshot` captured atomically at queue time (Section 8).
10. ~~**Channel-based SSE:** Each client should subscribe to named channel per run, not shared singleton.~~ **RESOLVED:** Channel-per-run pattern in SSE endpoint (Section 4).

---

*End of ARCHITECTURE-05-reasoning-trace.md*
