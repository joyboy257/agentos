# Architecture: Reasoning Trace — AgentOS SSE Event System

**Document:** ARCHITECTURE-05-reasoning-trace
**Status:** Draft
**Version:** 1.0
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

interface ReasoningContent {
  /** What the agent is thinking or doing — human-readable */
  text: string
  /** The observable facts or signals the reasoning is based on */
  evidence?: string[]
  /** Certainty score for classification events, 0–1 */
  confidence?: number
  /** Other options that were considered before this decision */
  alternativesConsidered?: string[]
}

interface ReasoningEvent {
  event: 'reasoning'
  runId: string
  agentId: string
  step: number
  type: ReasoningEventType
  content: ReasoningContent
  timestamp: number  // Unix ms, for ordering and latency analysis
}
```

### JSON Examples

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": 1,
  "type": "observation",
  "content": {
    "text": "Read 14 unread emails from today"
  },
  "timestamp": 1743270000000
}
```

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": 2,
  "type": "classification",
  "content": {
    "text": "Classified as urgent: email from john@client.com",
    "evidence": ["subject contains 'asap'", "sender in priority_contacts list"],
    "confidence": 0.92
  },
  "timestamp": 1743270001500
}
```

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": 3,
  "type": "decision",
  "content": {
    "text": "Using template 'Pricing Response v2' for this email",
    "alternativesConsidered": ["Pricing Response v1", "Custom draft from scratch", "Defer to user"]
  },
  "timestamp": 1743270002000
}
```

```json
{
  "event": "reasoning",
  "runId": "run_01HXYZ",
  "agentId": "agent_email_01",
  "step": 4,
  "type": "warning",
  "content": {
    "text": "Could not classify 2 emails — holding for your review"
  },
  "timestamp": 1743270002500
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
    step: context.nextStep(),
    type: 'decision',
    content: {
      text: toolCall.args.thought,
    },
    timestamp: Date.now(),
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

  // Agent calls this when it makes a classification
  emitClassification(params: {
    runId: string
    agentId: string
    text: string
    evidence: string[]
    confidence: number
  }) {
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: this.nextStep(),
      type: 'classification',
      content: {
        text: params.text,
        evidence: params.evidence,
        confidence: params.confidence,
      },
      timestamp: Date.now(),
    }
    this.eventEmitter.emit('reasoning', event)
  }

  // Agent calls this when it makes a decision
  emitDecision(params: {
    runId: string
    agentId: string
    text: string
    alternativesConsidered?: string[]
  }) {
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: this.nextStep(),
      type: 'decision',
      content: {
        text: params.text,
        alternativesConsidered: params.alternativesConsidered,
      },
      timestamp: Date.now(),
    }
    this.eventEmitter.emit('reasoning', event)
  }

  // Agent calls this when it observes something
  emitObservation(params: {
    runId: string
    agentId: string
    text: string
  }) {
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: this.nextStep(),
      type: 'observation',
      content: { text: params.text },
      timestamp: Date.now(),
    }
    this.eventEmitter.emit('reasoning', event)
  }

  // Agent calls this when it encounters a warning
  emitWarning(params: {
    runId: string
    agentId: string
    text: string
  }) {
    const event: ReasoningEvent = {
      event: 'reasoning',
      runId: params.runId,
      agentId: params.agentId,
      step: this.nextStep(),
      type: 'warning',
      content: { text: params.text },
      timestamp: Date.now(),
    }
    this.eventEmitter.emit('reasoning', event)
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

### SSE Endpoint Integration

```typescript
// src/routes/runs.ts

app.get('/api/runs/:runId/events', async (req, res) => {
  const { runId } = req.params

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sendEvent = (event: SSEEvent) => {
    res.write(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
  }

  // Subscribe to all event types
  agentRuntime.on('status', (status) => sendEvent(status))
  agentRuntime.on('reasoning', (reasoning: ReasoningEvent) => sendEvent(reasoning))
  agentRuntime.on('tool_call', (tool: ToolCallEvent) => sendEvent(tool))
  agentRuntime.on('tool_result', (result: ToolResultEvent) => sendEvent(result))
  agentRuntime.on('run_done', (done: RunDoneEvent) => sendEvent(done))

  // Cleanup on client disconnect
  req.on('close', () => {
    agentRuntime.removeAllListeners('status')
    agentRuntime.removeAllListeners('reasoning')
    agentRuntime.removeAllListeners('tool_call')
    agentRuntime.removeAllListeners('tool_result')
    agentRuntime.removeAllListeners('run_done')
  })
})
```

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
  | 1. [observation] Read 14 unread emails          |
  | 2. [classification] 3 urgent, 8 routine         |
  |    evidence: ["subject: 'asap'", "priority..."] |
  |    confidence: 0.92                             |
  | 3. [decision] Replying to urgent emails first   |
  |    alternatives: [routine first, all at once]   |
  | 4. [action] Using template "Pricing v2"         |
  | 5. [warning] 2 emails unclassified              |
  +--------------------------------------------------+
```

### Color Coding by Type

```typescript
// src/ui/reasoning-colors.ts

const REASONING_COLORS = {
  observation: {
    border: '#E5E7EB',   // gray-200
    badge: '#6B7280',   // gray-500
    badgeBg: '#F3F4F6', // gray-100
  },
  classification: {
    border: '#DBEAFE',  // blue-100
    badge: '#2563EB',   // blue-600
    badgeBg: '#EFF6FF', // blue-50
  },
  decision: {
    border: '#3B82F6',  // blue-500
    badge: '#1D4ED8',  // blue-700
    badgeBg: '#DBEAFE', // blue-100
  },
  action: {
    border: '#D1FAE5',  // green-100
    badge: '#059669',   // green-600
    badgeBg: '#ECFDF5', // green-50
  },
  warning: {
    border: '#FEF3C7',  // amber-100
    badge: '#D97706',  // amber-600
    badgeBg: '#FFFBEB', // amber-50
  },
} as const
```

### Reasoning Panel Component

```tsx
// src/components/ReasoningPanel.tsx

import { ReasoningEvent } from '@/types/sse'
import { REASONING_COLORS } from '@/ui/reasoning-colors'

interface ReasoningPanelProps {
  events: ReasoningEvent[]
  isExpanded: boolean
  onToggleExpand: () => void
}

function ReasoningPanel({ events, isExpanded, onToggleExpand }: ReasoningPanelProps) {
  const lastEvent = events[events.length - 1]

  return (
    <div className="reasoning-panel">
      {/* Collapsed: single-line summary */}
      {!isExpanded && (
        <div className="reasoning-collapsed" onClick={onToggleExpand}>
          <span className={`badge badge-${lastEvent.type}`}>
            {lastEvent.type}
          </span>
          <span className="reasoning-summary">
            {truncate(lastEvent.content.text, 80)}
          </span>
          <button className="expand-btn">[expand]</button>
        </div>
      )}

      {/* Expanded: full trace */}
      {isExpanded && (
        <div className="reasoning-expanded">
          <div className="reasoning-header">
            <span>Reasoning Trace</span>
            <button onClick={onToggleExpand}>[−]</button>
          </div>
          <ol className="reasoning-list">
            {events.map((event, index) => (
              <li
                key={`${event.runId}-${event.step}`}
                className={`reasoning-item type-${event.type}`}
              >
                <span className="step-number">{index + 1}.</span>
                <div className="reasoning-content">
                  <span className={`badge badge-${event.type}`}>
                    {event.type}
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
                      confidence: {event.content.confidence}
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
                </div>
              </li>
            ))}
          </ol>
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

### Implementation

```tsx
// src/components/ApprovalModal.tsx

interface ApprovalModalProps {
  pendingAction: PendingAction
  reasoningEvents: ReasoningEvent[]  // filtered to relevant agent/run
  onApprove: () => void
  onDeny: () => void
}

function ApprovalModal({ pendingAction, reasoningEvents, onApprove, onDeny }: ApprovalModalProps) {
  // Get the most recent decision event related to this action
  const relevantReasoning = reasoningEvents
    .filter(e => e.agentId === pendingAction.agentId)
    .filter(e => ['decision', 'classification', 'action'].includes(e.type))
    .slice(-3)  // last 3 relevant events for context

  return (
    <div className="approval-modal-overlay">
      <div className="approval-modal">
        <h2>{pendingAction.title}</h2>

        <div className="approval-reasoning">
          <h3>Why the agent wants to do this:</h3>
          {relevantReasoning.map(event => (
            <div key={`${event.runId}-${event.step}`} className={`reasoning-${event.type}`}>
              <span className="type-badge">{event.type}</span>
              <p>{event.content.text}</p>
              {event.content.evidence && (
                <ul className="evidence">
                  {event.content.evidence.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {event.content.confidence !== undefined && (
                <span className="confidence">confidence: {event.content.confidence}</span>
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
  routes/
    runs.ts                   # SSE endpoint GET /api/runs/:runId/events
  ui/
    components/
      AgentCard.tsx           # Agent card with reasoning panel
      ReasoningPanel.tsx      # Collapsible reasoning trace panel
      ApprovalModal.tsx       # Approval modal with reasoning context
    reasoning-colors.ts      # Color constants per reasoning type
```

### Type Exports

```typescript
// src/types/sse.ts

export type ReasoningEventType = 'observation' | 'classification' | 'decision' | 'action' | 'warning'

export interface ReasoningContent {
  text: string
  evidence?: string[]
  confidence?: number
  alternativesConsidered?: string[]
}

export interface ReasoningEvent {
  event: 'reasoning'
  runId: string
  agentId: string
  step: number
  type: ReasoningEventType
  content: ReasoningContent
  timestamp: number
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

export type SSEEvent =
  | AgentStatusEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | RunDoneEvent
```

### Step Counter

Step numbers must be monotonically increasing within a run. The runtime maintains a per-run counter:

```typescript
// src/runtime/step-counter.ts

class StepCounter {
  private counters: Map<string, number> = new Map()

  next(runId: string): number {
    const current = this.counters.get(runId) ?? 0
    const next = current + 1
    this.counters.set(runId, next)
    return next
  }

  reset(runId: string): void {
    this.counters.delete(runId)
  }
}

export const stepCounter = new StepCounter()
```

### Downlevel Compatibility

The `confidence: number` field (0–1) and `alternativesConsidered: string[]` fields are optional. A reasoning event with only `text` is valid. Older consumers that only understand `text` continue to work.

### Open Questions

1. **Burst suppression:** In fast agent loops, reasoning events could fire hundreds of times per second. Consider debouncing or collapsing consecutive `observation` events of the same type.
2. **Retention policy:** Full reasoning traces for all runs could consume significant storage. Determine retention window (e.g., 30 days for non-flagged runs, indefinite for flagged/failed runs).
3. **Multi-agent causality:** In a run with multiple agents, a reasoning event from Agent A may be triggered by a tool result from Agent B. The schema supports this via `agentId` but the UI may need to visually link causal chains.

---

*End of ARCHITECTURE-05-reasoning-trace.md*
