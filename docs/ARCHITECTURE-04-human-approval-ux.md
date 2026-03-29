# ARCHITECTURE-04: Human Approval UX

**Status:** Proposed
**Owner:** Engineering
**Last Updated:** 2026-03-29

---

## 1. Why Human Approval Is Non-Negotiable

Non-technical users will not trust a fully automated email-sending system. One accidental send — a misconfigured recipient, a wrong body, an agent acting on stale context — is a trust catastrophe that is extremely difficult to recover from.

Human-in-the-loop is not a limitation of the system. It is the product's core value proposition. The research is unambiguous:

- **AI + automation sweet spot:** Fully autonomous AI fails in high-stakes, low-regularity actions. The research on "appropriate trust" shows that users disengage from automation they cannot influence or inspect.
- **Appropriate trust, not maximum automation:** The goal is not to automate everything. The goal is to automate the tedious parts (reading, drafting, summarizing) while preserving human agency for the irreversible parts (sending, deleting, posting).
- **One accidental send = trust death:** For a non-technical business user, an agent sending an email they did not explicitly approve is a catastrophic failure mode. No amount of accuracy on the read side compensates for this.

The AgentOS platform sits firmly in the **AI + automation sweet spot**: agents do the reading, searching, and drafting work; humans make the irreversible decisions.

---

## 2. The `requiresApproval` Flag

### Where It Lives

The `requiresApproval` flag is a property on each **tool registration** in the capability registry. It is not a property of the agent, nor of the agent role — it is a property of the tool being invoked.

In the codebase, the tool registry is defined in `app/lib/nl/agent-registry.ts`:

```typescript
// app/lib/nl/agent-registry.ts
export const AVAILABLE_TOOLS = ['gmail.read', 'gmail.send', 'llm', 'web.search', 'web.fetch'] as const
export type Phase1Tool = typeof AVAILABLE_TOOLS[number]
```

The tool definitions are currently implicit in `InProcessRunner.execute()` in `app/lib/runtime/runner.ts`. The approval flag will be added to a new `ToolRegistry` type.

### What It Means

When `requiresApproval: true` for a tool, the execution pipeline **pauses** before invoking that tool. The tool is not cancelled — it is held in a pending state while the UI prompts the user for a decision. Once the user responds, execution resumes with the approved (or revised) arguments.

When `requiresApproval: false`, the tool runs to completion automatically. This is appropriate for read-only or low-stakes tools like `gmail.read`, `llm` (for drafting), and `web.search`.

### Two Approval Modes

```typescript
// app/lib/runtime/types.ts (proposed extension)

export type ToolDefinition = {
  name: string
  requiresApproval: boolean
  description: string
  inputFields: ToolInputField[]
}

export type ToolInputField = {
  key: string
  label: string
  type: 'string' | 'text' | 'email' | 'url'
  editable: boolean  // whether the user can edit this field in the approval modal
}
```

Example tool registry entries:

```typescript
// gmail.send — requires approval every time
const gmailSendToolDef: ToolDefinition = {
  name: 'gmail.send',
  requiresApproval: true,
  description: 'Send an email from your Gmail account',
  inputFields: [
    { key: 'to',      label: 'To',      type: 'email',  editable: true },
    { key: 'subject', label: 'Subject', type: 'string', editable: true },
    { key: 'body',    label: 'Body',    type: 'text',    editable: true },
  ],
}

// gmail.read — automatic, no approval needed
const gmailReadToolDef: ToolDefinition = {
  name: 'gmail.read',
  requiresApproval: false,
  description: 'Read emails from your Gmail inbox',
  inputFields: [
    { key: 'query', label: 'Search query', type: 'string', editable: false },
  ],
}

// llm (drafting) — automatic; the draft itself is the output
const llmToolDef: ToolDefinition = {
  name: 'llm',
  requiresApproval: false,
  description: 'Generate text using AI',
  inputFields: [
    { key: 'prompt', label: 'Prompt', type: 'text', editable: false },
  ],
}
```

### The Tool Registry Service

A new `ToolRegistry` service (`app/lib/runtime/tool-registry.ts`) provides lookup:

```typescript
// app/lib/runtime/tool-registry.ts

import { ToolDefinition } from './types'

const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  'gmail.send': {
    name: 'gmail.send',
    requiresApproval: true,
    description: 'Send an email from your Gmail account',
    inputFields: [
      { key: 'to',      label: 'To',      type: 'email',  editable: true },
      { key: 'subject', label: 'Subject', type: 'string', editable: true },
      { key: 'body',    label: 'Body',    type: 'text',   editable: true },
    ],
  },
  'gmail.read': {
    name: 'gmail.read',
    requiresApproval: false,
    description: 'Read emails from your Gmail inbox',
    inputFields: [
      { key: 'query', label: 'Search query', type: 'string', editable: false },
    ],
  },
  'llm': {
    name: 'llm',
    requiresApproval: false,
    description: 'Generate text using AI',
    inputFields: [
      { key: 'prompt', label: 'Prompt', type: 'text', editable: false },
    ],
  },
  'web.search': {
    name: 'web.search',
    requiresApproval: false,
    description: 'Search the web for information',
    inputFields: [
      { key: 'query', label: 'Query', type: 'string', editable: false },
    ],
  },
}

export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS[toolName]
}

export function toolRequiresApproval(toolName: string): boolean {
  return getToolDefinition(toolName)?.requiresApproval ?? false
}
```

---

## 3. The Approval Pause Flow

The pause flow is implemented as a state machine inside `InProcessRunner.execute()`. The key change from the current implementation is that tool execution is no longer a synchronous call — it is wrapped in an async pause/resume mechanism.

### Sequence Diagram

```
Agent generates email draft
    ↓
executeTool() calls toolRequiresApproval('gmail.send') → true
    ↓
Tool execution PAUSES (not cancelled, not errored)
    ↓
AgentOutput marked as { status: 'pending_approval', pendingTool: 'gmail.send', pendingArgs: {...} }
    ↓
SSE event: { event: 'approval_required', tool: 'email:send', draft: {...} }
    ↓
UI shows approval modal to user
    ↓
User chooses: [Edit] [Skip] [Approve & Send]
    ↓
SSE event: { event: 'approval_decision', decision: 'approved', revisedArgs?: {...} }
    ↓
Tool execution RESUMES with approved arguments
    ↓
Tool result returned as normal
    ↓
AgentOutput updated to { status: 'completed', data: result }
```

### Runner State Machine

The `InProcessRunner` is extended to support pausing:

```typescript
// app/lib/runtime/runner.ts (proposed changes)

type PendingApproval = {
  agentId: string
  toolName: string
  args: Record<string, unknown>
  resolve: (args: Record<string, unknown> | null) => void  // null = skip
}

export class InProcessRunner implements Runner {
  private pendingApproval: PendingApproval | null = null

  async execute(
    callbacks: ExecutionCallbacks,
    options: RunOptions
  ): Promise<void> {
    // ... existing graph setup ...

    const executeAgent = async (agentId: string): Promise<void> => {
      // ... status callbacks ...

      const tools = agent.tools

      if (signal?.aborted) {
        callbacks.onError({ event: 'error', runId, agentId, message: 'Run was cancelled', timestamp: Date.now() })
        return
      }

      // For each tool the agent requests, check approval requirement
      for (const toolName of tools) {
        const args = this.resolveToolArgs(toolName, completions) // derive args from upstream outputs

        if (toolRequiresApproval(toolName)) {
          // PAUSE: mark output as pending_approval
          const pausedOutput: AgentOutput = {
            agentId,
            role: agent.role,
            status: 'pending_approval',
            data: { tool: toolName, args },
          }
          callbacks.onStatus({
            event: 'status',
            runId,
            agentId,
            status: 'pending_approval',
            result: pausedOutput,
            timestamp: Date.now()
          })

          // Emit SSE approval_required event
          callbacks.onApprovalRequired({
            event: 'approval_required',
            runId,
            agentId,
            tool: toolName,
            step: currentStep++,
            content: {
              summary: buildSummary(toolName, args),
              fields: buildApprovalFields(toolName, args),
            },
            timestamp: Date.now()
          })

          // AWAIT user decision — this is the pause point
          const approvedArgs = await this.waitForApproval(toolName, args)
          if (approvedArgs === null) {
            // User skipped
            completions.set(agentId, [{
              agentId,
              role: agent.role,
              status: 'skipped',
              data: { tool: toolName, skipped: true },
            }])
            callbacks.onStatus({ event: 'status', runId, agentId, status: 'skipped', timestamp: Date.now() })
            return  // do not continue to next tool or downstream
          }

          // User approved (possibly with edits) — resume with approvedArgs
          args = approvedArgs
        }

        // Execute the tool (approval was already confirmed or tool doesn't require it)
        const result = await this.callTool(toolName, args)
        // ... handle result, queue downstream ...
      }
    }

    // ... queue processing ...
  }

  private waitForApproval(toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      this.pendingApproval = { toolName, args, resolve }
    })
  }

  // Called by the API route when it receives an approval_decision SSE event from the client
  resolveApproval(decision: 'approved' | 'edited' | 'skipped', revisedArgs?: Record<string, unknown>): void {
    if (!this.pendingApproval) return
    const { resolve } = this.pendingApproval
    this.pendingApproval = null
    if (decision === 'skipped') {
      resolve(null)
    } else {
      resolve(revisedArgs ?? this.pendingApproval.args)
    }
  }
}
```

### Updated ExecutionCallbacks Type

```typescript
// app/lib/runtime/types.ts (proposed)

export type ApprovalRequiredEvent = {
  event: 'approval_required'
  runId: string
  agentId: string
  tool: string
  step: number
  content: {
    summary: string          // e.g. "Send email to jane@acme.com"
    fields: ApprovalField[]  // editable fields with current values
  }
  timestamp: number
}

export type ApprovalDecisionEvent = {
  event: 'approval_decision'
  runId: string
  agentId: string
  decision: 'approved' | 'edited' | 'skipped'
  revisedArgs?: Record<string, unknown>
  timestamp: number
}

export type ExecutionCallbacks = {
  onStatus: (event: AgentStatusEvent) => void
  onDone: (event: RunDoneEvent) => void
  onError: (event: RunErrorEvent) => void
  onApprovalRequired: (event: ApprovalRequiredEvent) => void  // NEW
}
```

### Updated AgentStatusEvent

The `pending_approval` status is added to the union:

```typescript
export type AgentStatusEvent = {
  event: 'status'
  runId: string
  agentId: string
  status: 'ready' | 'running' | 'waiting' | 'pending_approval' | 'completed' | 'error' | 'skipped'
  result?: AgentOutput
  timestamp: number
}
```

---

## 4. SSE Endpoint Changes

The `/api/run/route.ts` must be extended to:
1. Forward `approval_required` events from the runner to the SSE stream
2. Accept incoming `approval_decision` events via a separate endpoint (or a secondary stream channel)

```typescript
// app/app/api/run/route.ts (proposed)

export async function POST(req: NextRequest) {
  const { graph } = await req.json() as { graph: AgentGraph }

  if (!graph || !graph.agents || !graph.connections) {
    return NextResponse.json({ error: 'Invalid graph' }, { status: 400 })
  }

  const runId = nanoid()
  const userApprovalResolver = new ApprovalResolver()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      const runner = new InProcessRunner()

      await runner.execute(
        {
          onStatus: (e) => send('status', e),
          onDone: (e) => send('done', e),
          onError: (e) => send('error', e),
          onApprovalRequired: (e) => {
            userApprovalResolver.setPending(runId, e)
            send('approval_required', e)
          },
        },
        { runId, graph, signal: req.signal }
      )

      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// Secondary endpoint to receive approval decisions from the UI
export async function PUT(req: NextRequest) {
  const { runId, decision, revisedArgs } = await req.json()
  // Resolve the pending approval for this runId
  approvalResolvers.get(runId)?.resolve(decision, revisedArgs)
  return NextResponse.json({ ok: true })
}
```

---

## 5. Edit → Revision Flow

When the user clicks **[Edit]** in the approval modal, the modal enters edit mode. The user modifies one or more fields (e.g., changes the recipient, edits the body). When they click **[Save Edits]**:

```
User modifies the email body in the modal
    ↓
Client sends SSE: { event: 'approval_decision', decision: 'edited', revisedArgs: { to, subject, body } }
    ↓
PUT /api/run { runId, decision: 'edited', revisedArgs: { ... } }
    ↓
runner.resolveApproval('edited', revisedArgs) is called
    ↓
Tool execution RESUMES with revisedArgs — but the tool re-generates before sending
    ↓
Agent receives: "user revised the draft" — agent re-confirms or adjusts
    ↓
New approval_required event emitted (with the user's edits incorporated as defaults)
    ↓
New approval modal shown
```

This creates a confirmation loop: **user edits → agent re-drafts or accepts → approval required again**. The loop continues until the user clicks **[Approve & Send]** or **[Skip]**.

The agent is informed of edits via a special signal appended to its input context:

```typescript
// When resuming after edits, the agent's context is augmented:
const revisedContext = `${originalContext}

Human user revised the draft with the following changes:
${diff(originalArgs, revisedArgs)}

Please re-confirm the content before it is sent.`
```

---

## 6. Skip Flow

When the user clicks **[Skip]**:

```
AgentOutput marked as 'skipped'
    ↓
Execution continues to next tool in the same agent (if any)
    ↓
Downstream agents that depend on this agent's output receive an empty/skipped signal
    ↓
Final SSE done event notes what was skipped: "Run completed: 4 agents succeeded, 1 skipped."
```

The `AgentOutput` for a skipped tool:

```typescript
const skippedOutput: AgentOutput = {
  agentId,
  role: agent.role,
  status: 'skipped',
  data: { tool: toolName, skipped: true },
}
```

Skipped outputs are passed to downstream agents as `{ skipped: true, tool: toolName }`. Downstream agents that depend on the output of a skipped agent should handle this gracefully — typically by skipping their own dependent actions.

---

## 7. SSE Events for Approval

These are the two new SSE event types introduced by the approval system.

### `approval_required`

Emitted by the runner when it encounters a tool with `requiresApproval: true`. The client uses this to render the approval modal.

```typescript
type ApprovalRequiredEvent = {
  event: 'approval_required'
  runId: string
  agentId: string
  tool: string              // e.g. 'gmail.send'
  step: number              // which step in the execution plan (for UX ordering)
  content: {
    summary: string         // human-readable: "Send email to jane@acme.com"
    fields: ApprovalField[] // current values + whether editable
  }
  timestamp: number
}

type ApprovalField = {
  key: string               // 'to' | 'subject' | 'body'
  label: string             // 'To' | 'Subject' | 'Body'
  type: 'string' | 'text' | 'email' | 'url'
  value: string             // current value
  editable: boolean         // can the user modify this?
}
```

Example:

```json
{
  "event": "approval_required",
  "runId": "abc123",
  "agentId": "sender-1",
  "tool": "gmail.send",
  "step": 3,
  "content": {
    "summary": "Send email to jane@acme.com",
    "fields": [
      { "key": "to",      "label": "To",      "type": "email",  "value": "jane@acme.com",        "editable": true  },
      { "key": "subject", "label": "Subject", "type": "string", "value": "Re: Your inquiry",     "editable": true  },
      { "key": "body",    "label": "Body",    "type": "text",   "value": "Hi Jane,\n\nThank you...", "editable": true  }
    ]
  },
  "timestamp": 1743270000000
}
```

### `approval_decision`

Emitted by the client (sent via PUT) when the user makes a decision in the modal. The runner resumes or aborts based on this.

```typescript
type ApprovalDecisionEvent = {
  event: 'approval_decision'
  runId: string
  agentId: string
  decision: 'approved' | 'edited' | 'skipped'
  revisedArgs?: Record<string, unknown>  // present when decision is 'edited'
  timestamp: number
}
```

Example (approve):

```json
{
  "event": "approval_decision",
  "runId": "abc123",
  "agentId": "sender-1",
  "decision": "approved",
  "timestamp": 1743270060000
}
```

Example (edit):

```json
{
  "event": "approval_decision",
  "runId": "abc123",
  "agentId": "sender-1",
  "decision": "edited",
  "revisedArgs": {
    "to": "jane@acme.com",
    "subject": "Re: Your inquiry — Follow up",
    "body": "Hi Jane,\n\nThank you for reaching out...\n\nBest,\nDeon"
  },
  "timestamp": 1743270060000
}
```

Example (skip):

```json
{
  "event": "approval_decision",
  "runId": "abc123",
  "agentId": "sender-1",
  "decision": "skipped",
  "timestamp": 1743270060000
}
```

---

## 8. What the User Sees in the UI

### Canvas State During Approval

The canvas (`app/app/(app)/canvas/page.tsx`) is the primary UI surface. When an agent's tool hits an approval requirement, the canvas reflects this state on the **agent card itself**, not in a separate panel.

**Agent Card States:**

| Status | Badge Color | Badge Text | Behavior |
|--------|-------------|------------|----------|
| `ready` | gray | — | Static, waiting to run |
| `running` | blue (pulsing) | — | Animated, agent working |
| `pending_approval` | yellow (pulsing) | "Awaiting Approval" | Card highlighted, badge visible, tool details shown inline |
| `completed` | green | — | Static, result available |
| `error` | red | "Error" | Static, error shown |
| `skipped` | gray | "Skipped" | Static, grayed out |

### Approval Indicator on the Card

When `status === 'pending_approval'`, the agent card:

1. **Shows a yellow pulsing badge** with the text "Awaiting Approval"
2. **Expands inline** to show the full content that needs approval (the email subject, body, and recipient)
3. **Shows the [Edit] [Skip] [Approve & Send] buttons** directly on the card
4. **Isolates visually** from other cards — a soft yellow border/glow indicates "this card needs your attention"

```
┌─────────────────────────────────────┐
│  [Email Sender]           [badge]  │  ← yellow "Awaiting Approval" badge
│  ─────────────────────────────────  │
│  To:      jane@acme.com        [✎] │  ← editable in modal
│  Subject: Re: Your inquiry     [✎] │
│  ─────────────────────────────────  │
│  Body:                              │
│  Hi Jane,                    [✎]   │
│                                  │
│  Thank you for reaching out... │
│  ─────────────────────────────────  │
│  [Edit Draft]  [Skip]  [✓ Approve] │
└─────────────────────────────────────┘
```

### Approval Modal

The modal is a centered overlay that appears when the user clicks on a `pending_approval` card (or automatically for high-stakes tools). It is not a redirect — it overlays the canvas so the user does not lose context.

**Modal contents:**

- **Header:** "Review before sending" with the agent name ("Email Sender wants to send this email")
- **Plain-language summary:** "You're about to send an email to jane@acme.com with the subject 'Re: Your inquiry'"
- **Full editable content:**
  - `To` field (email input, editable)
  - `Subject` field (text input, editable)
  - `Body` field (textarea, editable)
- **Three action buttons:**
  - **[Edit Draft]** — opens edit mode; saves edits and re-submits for approval
  - **[Skip]** — does not send; marks as skipped
  - **[Approve & Send]** — sends with current values

**Button behavior:**
- **[Edit Draft]:** Changes modal to edit mode. Fields become writable. [Save Edits] replaces [Edit Draft]. [Skip] and [Approve & Send] remain visible.
- **[Skip]:** Closes modal, sends `approval_decision { decision: 'skipped' }`. Agent card shows `skipped` state.
- **[Approve & Send]:** Closes modal, sends `approval_decision { decision: 'approved' }`. Agent card shows `running` then `completed` or `error`.

### Canvas Level Indicators

The canvas itself also shows a **top-level indicator** when any agent is waiting for approval:

- A subtle amber banner: "1 action pending your review" (links to the pending card)
- The agent card for the pending agent is brought to visual foreground (elevated z-index, subtle glow)

---

## 9. Revised AgentOutput Type

The `AgentOutput` type in `app/lib/nl/types.ts` is extended to support the new states:

```typescript
// app/lib/nl/types.ts

export type AgentOutput = {
  agentId: string
  role: string
  status: 'completed' | 'error' | 'pending_approval' | 'skipped'
  data: unknown
  error?: string
  pendingArgs?: Record<string, unknown>   // present when status === 'pending_approval'
  pendingTool?: string                     // present when status === 'pending_approval'
}
```

---

## 10. Key Design Decisions

1. **Paused, not cancelled.** The tool execution thread holds the result, not throws it away. This is critical — cancellation loses the draft entirely. Pausing preserves it for revision or re-approval.

2. **Approval is per-tool-call, not per-agent-run.** An agent may call multiple tools. Each tool with `requiresApproval: true` triggers its own pause. This means a single agent run can pause multiple times.

3. **Edit always triggers re-approval.** Any edit to the draft requires a fresh approval pass. The agent re-confirms the content after user edits, and the user must explicitly approve the final version. This prevents an edit from short-circuiting the approval loop.

4. **Skip is non-fatal.** Skipping does not error the run. Downstream agents receive `{ skipped: true }` as input and handle it gracefully. The final summary notes what was skipped.

5. **No debouncing of approval.** Every `approval_required` event waits for a corresponding `approval_decision`. There is no automatic timeout or auto-approve. The user is always the final authority.

6. **SSE is the single channel.** All events (status updates, approval requirements, errors) flow over the same SSE stream established by `POST /api/run`. Approval decisions are sent via `PUT /api/run` to avoid mixing bidirectional traffic on a server-sent stream.
