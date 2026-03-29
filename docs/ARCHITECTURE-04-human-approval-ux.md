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

The `InProcessRunner` is extended to support pausing. **Concurrent multi-agent execution requires a Map** because multiple agents may independently request approval simultaneously — a single `pendingApproval` scalar cannot represent that state.

```typescript
// app/lib/runtime/runner.ts (proposed changes)

type PendingApproval = {
  agentId: string
  toolName: string
  toolCallId: string        // unique per tool-call invocation; disambiguates concurrent approvals
  args: Record<string, unknown>
  approvalIterationCount: number  // how many edit→re-approve cycles have occurred
  resolve: (args: Record<string, unknown> | null) => void  // null = skip
  reject: (err: Error) => void                            // timeout / system cancel
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 30 * 60 * 1000  // 30 minutes
const MAX_APPROVAL_ITERATIONS = 3                    // max edit→re-approve cycles per tool-call

export class InProcessRunner implements Runner {
  // Map key: `${agentId}:${toolCallId}` — supports concurrent multi-agent pending approvals
  private pendingApprovals = new Map<string, PendingApproval>()

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
      for (const toolCallId of tools) {
        const toolName = toolCallId  // renamed for clarity
        const args = this.resolveToolArgs(toolName, completions) // derive args from upstream outputs

        if (toolRequiresApproval(toolName)) {
          // CRITICAL: capture iteration count for this specific tool-call
          const approvalIterationCount = 0

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
            toolCallId,
            step: currentStep++,
            content: {
              summary: buildSummary(toolName, args),
              fields: buildApprovalFields(toolName, args),
            },
            timestamp: Date.now()
          })

          // AWAIT user decision — this is the pause point
          const approvedArgs = await this.waitForApproval(runId, agentId, toolCallId, args, approvalIterationCount, callbacks)
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

    // ... queue processing — non-dependent agents continue even while one is pending ...

    // Multi-agent starvation fix: the queue processor must continue dispatching
    // agents whose dependencies are satisfied, regardless of whether another agent
    // is paused on pending_approval. Only the paused agent's downstream agents block.
    const processQueue = async () => {
      while (queue.length > 0 || Object.keys(inFlightAgents).length > 0) {
        // Find all agents whose dependencies are met and are not already in-flight or pending
        const readyAgents = queue.filter(agentId =>
          this.allDependenciesMet(agentId) && !inFlightAgents[agentId]
        )
        for (const agentId of readyAgents) {
          queue.splice(queue.indexOf(agentId), 1)
          inFlightAgents[agentId] = true
          executeAgent(agentId)  // fire without awaiting — concurrent execution
        }
        await sleep(10)  // poll interval; in production, use an event-driven signal
      }
    }

    processQueue()
  }

  private waitForApproval(
    runId: string,
    agentId: string,
    toolCallId: string,
    args: Record<string, unknown>,
    approvalIterationCount: number,
    callbacks: ExecutionCallbacks,
  ): Promise<Record<string, unknown> | null> {
    const key = `${agentId}:${toolCallId}`
    return new Promise((resolve, reject) => {
      const timeoutMs = DEFAULT_APPROVAL_TIMEOUT_MS
      const timeoutHandle = setTimeout(() => {
        this.pendingApprovals.delete(key)
        const err = new Error(`Approval timeout after ${timeoutMs}ms for ${toolName}`)
        callbacks.onError({
          event: 'error',
          runId,
          agentId,
          message: err.message,
          timestamp: Date.now()
        })
        reject(err)
      }, timeoutMs)

      const entry: PendingApproval = {
        agentId,
        toolName: args._toolName as string,  // enriched from context
        toolCallId,
        args,
        approvalIterationCount,
        resolve: (resolvedArgs) => {
          clearTimeout(timeoutHandle)
          this.pendingApprovals.delete(key)  // MINOR: clean up Map entry on resolution
          resolve(resolvedArgs)
        },
        reject: (err) => {
          clearTimeout(timeoutHandle)
          this.pendingApprovals.delete(key)
          reject(err)
        },
      }
      this.pendingApprovals.set(key, entry)
    })
  }

  // CRITICAL: Capture to local variable before nulling — prevents race on this.pendingApproval
  resolveApproval(
    runId: string,
    agentId: string,
    toolCallId: string,
    decision: 'approved' | 'edited' | 'skipped',
    revisedArgs?: Record<string, unknown>,
    sessionUserId?: string,  // MAJOR: auth — must match session owner
  ): void {
    const key = `${agentId}:${toolCallId}`
    // CRITICAL FIX: read BEFORE delete — prevents stale closure over `this.pendingApproval`
    const approval = this.pendingApprovals.get(key)
    if (!approval) {
      console.warn(`resolveApproval: no pending approval for key=${key}`)
      return
    }

    // MAJOR: Auth — only the session user who owns this runId may resolve approvals
    if (sessionUserId && approval.agentId !== sessionUserId) {
      console.error(`resolveApproval: unauthorized — user=${sessionUserId} cannot approve agent=${approval.agentId}`)
      approval.reject(new Error('Unauthorized: user does not own this run'))
      return
    }

    // MAJOR: Enforce iteration cap on edit→re-approve loops
    if (decision === 'edited') {
      if (approval.approvalIterationCount >= MAX_APPROVAL_ITERATIONS) {
        const err = new Error(
          `Approval iteration cap reached (${MAX_APPROVAL_ITERATIONS}). ` +
          `Please approve, skip, or cancel the run.`
        )
        callbacks.onError({ event: 'error', runId, agentId, message: err.message, timestamp: Date.now() })
        approval.reject(err)
        return
      }
      // Re-queue for another approval pass with incremented counter
      // (The runner will emit a new approval_required event with iterationCount+1)
      const reApprovalArgs = revisedArgs ?? approval.args
      const reApprovalEntry: PendingApproval = {
        ...approval,
        args: reApprovalArgs,
        approvalIterationCount: approval.approvalIterationCount + 1,
        resolve: approval.resolve,
        reject: approval.reject,
      }
      this.pendingApprovals.set(key, reApprovalEntry)
      // Re-emit approval_required with the user's edits as new defaults
      callbacks.onApprovalRequired({
        event: 'approval_required',
        runId,
        agentId,
        tool: approval.toolName,
        toolCallId,
        step: 0,  // determined by runner
        content: {
          summary: buildSummary(approval.toolName, reApprovalArgs),
          fields: buildApprovalFields(approval.toolName, reApprovalArgs),
        },
        timestamp: Date.now(),
      })
      return
    }

    // Remove from map BEFORE calling resolve — avoid double-resolution race
    this.pendingApprovals.delete(key)

    if (decision === 'skipped') {
      approval.resolve(null)
    } else {
      approval.resolve(revisedArgs ?? approval.args)
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
  toolCallId: string         // NEW: unique per tool-call invocation
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
  toolCallId: string         // NEW: must match the corresponding approval_required toolCallId
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

## 4. Database Schema for Approval State Persistence

**CRITICAL: In-memory Map dies on server restart.** Approval state must be persisted so that pending approvals survive server restarts and can be resolved by a later request.

### `pending_approvals` Table

Created when an agent pauses for approval; deleted when the user resolves or the timeout fires.

```sql
CREATE TABLE pending_approvals (
  id              TEXT PRIMARY KEY,           -- `${runId}:${agentId}:${toolCallId}`
  run_id          TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  tool_call_id    TEXT NOT NULL,
  tool_name       TEXT NOT NULL,
  args            TEXT NOT NULL,              -- JSON — original tool arguments
  iteration_count INTEGER NOT NULL DEFAULT 0, -- edit→re-approve cycle count
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,       -- created_at + pendingApprovalTimeoutMs
  user_id         TEXT NOT NULL,              -- session owner; validated on PUT
  UNIQUE(run_id, agent_id, tool_call_id)
);

CREATE INDEX idx_pending_approvals_run_id  ON pending_approvals(run_id);
CREATE INDEX idx_pending_approvals_user_id  ON pending_approvals(user_id);
CREATE INDEX idx_pending_approvals_expires ON pending_approvals(expires_at);
```

### `approval_decisions` Table

Append-only audit log. Never updated or deleted.

```sql
CREATE TABLE approval_decisions (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  tool_call_id    TEXT NOT NULL,
  tool_name       TEXT NOT NULL,
  decision        TEXT NOT NULL,              -- 'approved' | 'edited' | 'skipped' | 'timeout'
  original_args   TEXT,                       -- JSON; null when decision=skipped
  revised_args    TEXT,                       -- JSON; present when decision=edited or approved
  iteration_count INTEGER NOT NULL,
  user_id         TEXT NOT NULL,
  ip_address      TEXT,                       -- client IP for audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_approval_decisions_run_id ON approval_decisions(run_id);
CREATE INDEX idx_approval_decisions_user_id ON approval_decisions(user_id);
CREATE INDEX idx_approval_decisions_created ON approval_decisions(created_at);
```

---

## 5. SSE Endpoint Changes

The `/api/run/route.ts` must be extended to:
1. Forward `approval_required` events from the runner to the SSE stream
2. Accept incoming `approval_decision` events via a separate endpoint (or a secondary stream channel)
3. **CRITICAL: Authenticate all requests.** The session's `userId` must own the `runId`.

```typescript
// app/app/api/run/route.ts (proposed)

export async function POST(req: NextRequest) {
  // MAJOR: Auth — validate session
  const session = await getSession(req)
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { graph } = await req.json() as { graph: AgentGraph }

  if (!graph || !graph.agents || !graph.connections) {
    return NextResponse.json({ error: 'Invalid graph' }, { status: 400 })
  }

  const runId = nanoid()
  const userApprovalResolver = new ApprovalResolver()

  // MAJOR: Persist run record with userId ownership
  await db.insert(runs).values({ id: runId, userId: session.userId, status: 'running' })

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
// MAJOR: Full auth — validate userId owns runId before resolving
export async function PUT(req: NextRequest) {
  // Auth: must have valid session
  const session = await getSession(req)
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { runId, agentId, toolCallId, decision, revisedArgs } = await req.json()

  // MAJOR: Ownership check — only the user who created the run may approve it
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) })
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  if (run.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden: you do not own this run' }, { status: 403 })
  }

  // CRITICAL: Load pending_approval from DB and validate it exists
  const key = `${agentId}:${toolCallId}`
  const pending = await db.query.pendingApprovals.findFirst({
    where: and(
      eq(pendingApprovals.runId, runId),
      eq(pendingApprovals.agentId, agentId),
      eq(pendingApprovals.toolCallId, toolCallId)
    )
  })
  if (!pending) {
    return NextResponse.json({ error: 'No pending approval found' }, { status: 404 })
  }

  // MAJOR: Append to audit log
  const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null
  await db.insert(approvalDecisions).values({
    id: nanoid(),
    runId,
    agentId,
    toolCallId,
    toolName: pending.toolName,
    decision,
    originalArgs: pending.args,
    revisedArgs: revisedArgs ?? null,
    iterationCount: pending.iterationCount,
    userId: session.userId,
    ipAddress,
  })

  // Delete the pending_approvals row after logging the decision
  await db.delete(pendingApprovals).where(eq(pendingApprovals.id, `${runId}:${agentId}:${toolCallId}`))

  // Resolve via in-memory map (still needed for the in-flight Promise)
  runner.resolveApproval(runId, agentId, toolCallId, decision, revisedArgs, session.userId)

  return NextResponse.json({ ok: true })
}
```

---

## 6. Edit → Revision Flow

When the user clicks **[Edit]** in the approval modal, the modal enters edit mode. The user modifies one or more fields (e.g., changes the recipient, edits the body). When they click **[Save Edits]**:

```
User modifies the email body in the modal
    ↓
Client sends SSE: { event: 'approval_decision', decision: 'edited', revisedArgs: { to, subject, body } }
    ↓
PUT /api/run { runId, agentId, toolCallId, decision: 'edited', revisedArgs: { ... } }
    ↓
runner.resolveApproval(runId, agentId, toolCallId, 'edited', revisedArgs) is called
    ↓
Tool execution does NOT auto-resume — runner checks iteration count
    ↓
Runner emits a NEW approval_required event with user's edits as default values
    ↓
New approval modal shown (edit → re-approve loop)
```

**MAJOR: Iteration cap.** After `MAX_APPROVAL_ITERATIONS` (3) edit→re-approve cycles, the runner surfaces an error to the user and cancels the pending action. The user must Approve-as-is or Skip. This prevents infinite loops where an agent and user ping-pong edits endlessly.

The agent is informed of edits via a special signal appended to its input context:

```typescript
// When resuming after edits, the agent's context is augmented:
const revisedContext = `${originalContext}

Human user revised the draft with the following changes:
${diff(originalArgs, revisedArgs)}

Please re-confirm the content before it is sent.`
```

---

## 7. Skip Flow

When the user clicks **[Skip]**:

```
AgentOutput marked as 'skipped'
    ↓
Execution continues to next tool in the same agent (if any)
    ↓
Downstream agents that depend on this agent's output receive a skipped signal
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

### MAJOR: Downstream Contract When Partial Skip

When a fan-in downstream agent has multiple upstream dependencies and **some (but not all)** are skipped, the downstream agent must handle this gracefully:

- **If any upstream dependency is skipped:** the downstream agent receives `{ skipped: true, partialInputs: [...] }` for that dependency, and must decide whether to:
  - Skip its own action entirely (safe default)
  - Proceed with the remaining non-skipped inputs (if the tool semantics allow)
- **If all upstream dependencies are skipped:** the downstream agent is itself marked `skipped`.
- **Contract:** agents that have fan-in dependencies MUST check `skipped: true` on each incoming dependency and handle null/skipped input gracefully. Tools must not error or crash when receiving a `null` argument — they should either skip their own action or surface an informative error.

This behavior is documented in the tool contract spec. All fan-in agents should be designed to handle partial skipped inputs without crashing.

---

## 8. Approval Timeout

**MAJOR: `pendingApprovalTimeoutMs` (default 30 minutes).**

After the timeout fires:

1. The pending approval is removed from `pendingApprovals` Map **and** deleted from `pending_approvals` DB.
2. An `error` event is emitted on the SSE stream: `{ event: 'error', agentId, message: 'Approval timed out after 30 minutes' }`.
3. The pending tool-call is treated as **skipped** — downstream agents receive `{ skipped: true, reason: 'timeout' }`.
4. The timeout is recorded in `approval_decisions` with `decision = 'timeout'`.

The timeout is per tool-call, not global. Multiple concurrent pending approvals each have independent timers.

---

## 9. Multi-Agent Starvation Prevention

**MAJOR: Non-dependent agents must continue while one is paused.**

The runner maintains a DAG execution model. When agent A is paused on `pending_approval`:

- Agent B and Agent C (which have no dependency on A) continue executing normally.
- Only agents that depend directly or transitively on A block until A resolves.
- The runner's `processQueue()` loop continuously scans for ready agents — it does not wait for a paused agent to resume before dispatching other ready agents.

This is implemented via the `processQueue()` async loop described in Section 3: agents are fired with `executeAgent(agentId)` (no `await`) so they run concurrently. The queue processor continues looping as long as there are non-blocked ready agents, regardless of paused agents elsewhere in the DAG.

---

## 10. SSE Events for Approval

These are the two new SSE event types introduced by the approval system.

### `approval_required`

Emitted by the runner when it encounters a tool with `requiresApproval: true`. The client uses this to render the approval modal.

```typescript
type ApprovalRequiredEvent = {
  event: 'approval_required'
  runId: string
  agentId: string
  tool: string              // e.g. 'gmail.send'
  toolCallId: string         // unique per tool-call invocation
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
  "toolCallId": "gmail.send-1718198456000",
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
  toolCallId: string
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
  "toolCallId": "gmail.send-1718198456000",
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
  "toolCallId": "gmail.send-1718198456000",
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
  "toolCallId": "gmail.send-1718198456000",
  "decision": "skipped",
  "timestamp": 1743270060000
}
```

---

## 11. Append-Only Audit Log

**MAJOR: Every approval decision is permanently logged.**

The `approval_decisions` table (Section 4) serves as the audit log. Each row captures:

```typescript
type AuditLogEntry = {
  userId: string              // who made the decision
  runId: string               // which run
  agentId: string             // which agent
  toolCallId: string          // which specific tool-call
  tool: string                // tool name (e.g. 'gmail.send')
  originalArgs: Record<string, unknown>  // original arguments presented for approval
  revisedArgs?: Record<string, unknown> // user's edited args (only on 'edited' or 'approved' with edits)
  decision: 'approved' | 'edited' | 'skipped' | 'timeout'
  approvalIterationCount: number  // which cycle this was (1 = first approval, 2 = after first edit, etc.)
  ipAddress: string | null   // client IP at time of decision
  timestamp: number
}
```

The log is **append-only**: rows are never updated or deleted. This enables full reconstruction of what the user saw, what they changed, and what they decided — critical for debugging, compliance, and trust.

---

## 12. What the User Sees in the UI

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

### Mobile-Responsive Approval Modal

**MINOR: Mobile-responsive layout.**

On mobile viewports (< 768px):
- The modal becomes full-screen (or near-full-screen with 8px margin) rather than a centered overlay.
- Action buttons stack vertically: [Approve & Send] primary, then [Edit Draft] and [Skip] as secondary actions.
- Fields use full-width inputs with increased touch target sizes (min 44px tap areas).
- The summary text is abbreviated to a single line; full detail is visible after tapping "Show details."

### Desktop/Mobile Push Notifications

**MINOR: Push notification hooks for pending approvals.**

When a new `approval_required` event arrives on the SSE stream, the client may optionally dispatch push notifications:

```typescript
// Desktop: use the Web Push API
if ('Notification' in window && Notification.permission === 'granted') {
  new Notification('AgentOS — Approval Required', {
    body: `${agentId} wants to ${tool} — tap to review`,
    icon: '/icon.png',
    tag: `approval-${runId}-${agentId}`,  // prevents duplicate notifications
    data: { runId, agentId, toolCallId },
  })
}

// Mobile: use the Push API (service worker required) or
// fall back to a visible in-app toast/banner for PWA contexts
```

Notification dispatch is gated on user consent (`Notification.permission === 'granted'`). The notification `tag` ensures that if the user has multiple pending approvals, each gets a distinct notification rather than collapsing into one.

---

## 13. Revised AgentOutput Type

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
  pendingTool?: string                    // present when status === 'pending_approval'
  skipped?: boolean                       // present when status === 'skipped'
  skippedReason?: 'user_skip' | 'timeout' // distinguishes skip reasons
}
```

---

## 14. Key Design Decisions

1. **Paused, not cancelled.** The tool execution thread holds the result, not throws it away. This is critical — cancellation loses the draft entirely. Pausing preserves it for revision or re-approval.

2. **Approval is per-tool-call, not per-agent-run.** An agent may call multiple tools. Each tool with `requiresApproval: true` triggers its own pause. This means a single agent run can pause multiple times.

3. **Edit always triggers re-approval.** Any edit to the draft requires a fresh approval pass. The agent re-confirms the content after user edits, and the user must explicitly approve the final version. This prevents an edit from short-circuiting the approval loop.

4. **Skip is non-fatal.** Skipping does not error the run. Downstream agents receive `{ skipped: true }` as input and handle it gracefully. The final summary notes what was skipped.

5. **No debouncing of approval.** Every `approval_required` event waits for a corresponding `approval_decision`. There is no automatic timeout or auto-approve. The user is always the final authority.

6. **SSE is the single channel.** All events (status updates, approval requirements, errors) flow over the same SSE stream established by `POST /api/run`. Approval decisions are sent via `PUT /api/run` to avoid mixing bidirectional traffic on a server-sent stream.

7. **Auth is mandatory on all endpoints.** Every `POST` and `PUT` to `/api/run` validates the session's `userId` against the `runId` ownership. Any authenticated user cannot approve another user's run.

8. **Concurrent multi-agent approvals are supported.** `pendingApprovals: Map<agentId:toolCallId, PendingApproval>` allows multiple agents to independently pause for approval at the same time, as long as their tool-calls have distinct keys.

9. **Pending approval state survives server restarts.** The `pending_approvals` DB table mirrors the in-memory Map. On startup, the runner loads any un-expired pending approvals and re-registers them with the in-memory Map so they can still be resolved by a later PUT.

10. **Audit log is append-only and includes IP.** Every approval decision (approve, edit, skip, timeout) is permanently recorded with the user's ID, IP address, original arguments, revised arguments (if edited), and iteration count.
