# Phase 3 — Multi-Agent Orchestration Design

**Date:** 2026-04-07
**Type:** feat / design
**Status:** draft
**Origin:** PRD.md Section 12 (Phase 3 — Scale, Days 180–270)
**Dependencies:** Phase 2 (Team Lead exists on canvas, agents have IDs, SSE works)

---

## Overview

Multi-agent orchestration in AgentOS follows the **coordinator pattern** from Claude Code / claw-code: one visible Team Lead agent node coordinates a team of sandboxed worker agents, passing output artifacts along wires rather than sharing context tokens.

This document reverse-engineers the key patterns from `ultraworkers/claw-code` (Rust port of Claude Code) and adapts them for AgentOS's canvas-based TypeScript/Node.js stack.

---

## Source: `ultraworkers/claw-code` Multi-Agent Patterns

The claw-code Rust implementation provides five key primitives for multi-agent coordination:

### 1. Session Fork (`session.rs`)

Each agent has its own `Session` — a persistent, append-only transcript. The `fork()` method creates a child session:

```rust
pub fn fork(&self, branch_name: Option<String>) -> Self {
    Self {
        session_id: generate_session_id(),  // New unique ID
        messages: self.messages.clone(),     // Inherit history
        fork: Some(SessionFork {
            parent_session_id: self.session_id.clone(),
            branch_name: normalize_optional_string(branch_name),
        }),
        persistence: None,  // New fork has no attached file
    }
}
```

**Key property:** Forked sessions track lineage (`parent_session_id`, `branch_name`) but do NOT share context tokens. Each agent has isolated context. Wires pass output artifacts, not raw transcript.

### 2. Task Registry (`task_registry.rs`)

An in-memory registry tracking task lifecycles:

```
Created → Running → Completed
                   ↘ Failed
    ↘ Stopped (from Created/Running only)
```

Tasks accumulate message history (`Vec<TaskMessage>`) and can be assigned to teams. The registry is thread-safe (`Arc<Mutex<>>`).

### 3. Lane Events (`lane_events.rs`)

Typed event stream for inter-agent communication:

- Event names: `lane.started`, `lane.blocked`, `lane.commit.created`, `lane.merged`
- Status: `Running | Blocked | Green | Failed | Completed`
- Structured payloads: `LaneCommitProvenance` (commit/branch lineage)
- Coordinator subscribes to events; agents publish and await signals

### 4. Worker Boot (`worker_boot.rs`)

Agent process lifecycle state machine:

```
Spawning → TrustRequired → ReadyForPrompt → Running → Finished
```

Key features:
- **Trust gate**: Path allowlist; auto-resolves known paths
- **Ready detection**: Monitors for "Ready for input" terminal cue
- **Prompt misdelivery recovery**: Detects wrong-shell and replays
- **Failure classification**: `Compile | Test | McpStartup | Infra`

### 5. Sandbox Isolation (`sandbox.rs`)

Filesystem-level isolation for agent subprocesses:

- **Modes**: `off | workspace-only | allow-list`
- **Linux**: `unshare` for user/mount/IPC/PID/UTS namespaces
- **Container detection**: Docker, Podman, Kubernetes
- Filesystem mode passed via `CLAWD_SANDBOX_FILESYSTEM_MODE` env var

---

## AgentOS Adaptation

### Key Design Decisions

**Coordinator is a real agent, not a message broker.** The Team Lead is a full LLM agent with its own session, tools, and reasoning trace. It appears as a distinct node on the canvas. It does NOT route messages — it reasons about task decomposition and assigns work.

**Workers are sandboxed subprocess agents.** Each worker runs in an isolated context with bounded memory. Workers do NOT share context tokens. Workers communicate via artifacts passed over wires.

**Wires carry output artifacts, not context.** When Worker A completes, it produces a structured artifact (email draft, lead profile, research summary). The Team Lead receives this artifact and decides what to pass to Worker B.

**Sidechain transcripts for audit.** Every worker run produces a sidechain transcript stored separately from the main run transcript. Maria can inspect any agent's full reasoning.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      TEAM LEAD (canvas node)                        │
│  • Full LLM agent with own Session                                  │
│  • Reasons about: task decomposition, wire routing, escalation    │
│  • Own tools: team state, worker orchestration, escalation routing  │
│  • Subscribes to lane events from all workers                       │
│  • Visible on canvas — distinct border/icon from workers            │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  Worker A   │     │  Worker B   │     │  Worker C   │
   │  (Ingest)   │     │ (Process)   │     │ (Distill)   │
   │  Sandbox:   │     │  Sandbox:   │     │  Sandbox:   │
   │  gmail      │     │  gmail+     │     │  web search │
   │  Isolated  │     │  Isolated   │     │  Isolated   │
   │  Session   │     │  Session    │     │  Session    │
   │  + artifact│     │  + artifact │     │  + artifact │
   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
          │                    │                    │
          └────────────────────┴────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Wire carries:  │
                    │  Output artifact │
                    │  (email draft,   │
                    │   lead profile)   │
                    │  NOT context     │
                    └─────────────────┘
```

---

## Data Model

### Session (per agent)

```typescript
interface AgentSession {
  session_id: string           // ULID
  parent_session_id?: string   // Fork lineage
  branch_name?: string        // e.g. "lead-research-1"
  messages: ConversationMessage[]
  compaction?: {
    count: number
    removed_message_count: number
    summary: string
  }
  created_at: number
  updated_at: number
}
```

### Task (per agent run)

```typescript
interface AgentTask {
  task_id: string
  agent_id: string
  team_id: string
  status: 'created' | 'running' | 'completed' | 'failed' | 'stopped'
  messages: TaskMessage[]
  output_artifact?: unknown   // Passed to next agent via wire
  created_at: number
  updated_at: number
}
```

### Team

```typescript
interface AgentTeam {
  team_id: string
  canvas_id: string
  name: string
  task_ids: string[]
  coordinator_session_id: string  // Team Lead's session
  status: 'created' | 'running' | 'completed' | 'deleted'
  created_at: number
  updated_at: number
}
```

### LaneEvent (SSE event stream)

```typescript
type LaneEventName =
  | 'lane.started'
  | 'lane.blocked'
  | 'lane.progress'
  | 'lane.commit.created'
  | 'lane.merged'
  | 'lane.completed'
  | 'lane.failed'

interface LaneEvent {
  type: LaneEventName
  team_id: string
  task_id: string
  agent_id: string
  status: 'running' | 'blocked' | 'green' | 'failed' | 'completed'
  timestamp: number
  payload?: {
    commit_sha?: string
    artifact?: unknown
    error?: string
  }
}
```

---

## Execution Flow

### 1. Team Creation (NL → Canvas)

When Maria types "add a research team that finds leads and drafts follow-ups":

1. NL interpretation produces an agent graph: `[Researcher, Drafter, Reviewer]` with wires
2. Canvas creates a **Team** record with `coordinator_session_id` = Team Lead's session
3. Each worker agent gets its own `AgentSession` (forked from Team Lead's empty session initially)
4. Team Lead's session is the root; workers are children with `parent_session_id` set

### 2. Fan-Out Execution

`DurableRunner.executeTeam(team)`:

```typescript
async function executeTeam(team: AgentTeam): Promise<void> {
  const graph = loadAgentGraph(team.canvas_id)
  const roots = findRootAgents(graph)  // Agents with no incoming wires
  const queue = [...roots]
  const running = new Map<string, Task>()
  const MAX_CONCURRENT = 2

  while (queue.length > 0 || running.size > 0) {
    // Fill up to MAX_CONCURRENT slots
    while (queue.length > 0 && running.size < MAX_CONCURRENT) {
      const agent = queue.shift()!
      const task = await spawnWorker(agent, team.coordinator_session_id)
      running.set(agent.id, task)
    }

    // Wait for any task to complete
    const completed = await waitForFirst(running.values())
    running.delete(completed.agent_id)

    // Emit lane.completed event
    emitLaneEvent('lane.completed', completed)

    // Enqueue downstream agents (whose inputs are now satisfied)
    for (const wire of graph.wires where wire.source === completed.agent_id) {
      const downstreamReady = graph.agents.every(
        a => !graph.incomingWires(a).some(w => !taskStore.isComplete(w.source))
      )
      if (downstreamReady) queue.push(wire.target)
    }
  }
}
```

### 3. Worker Sandbox Boot

Each worker boots as a sandboxed subprocess:

```typescript
async function spawnWorker(
  agent: CanvasAgent,
  coordinatorSessionId: string
): Promise<WorkerTask> {
  // 1. Create isolated session (forked from coordinator)
  const session = await createIsolatedSession({
    parent_session_id: coordinatorSessionId,
    branch_name: `${agent.name}-${ulid()}`,
  })

  // 2. Build agent context: tools + prompt + memory
  const context = await buildAgentContext(agent, session)

  // 3. Spawn subprocess with sandbox constraints
  const child = spawn('node', ['worker-entry.js'], {
    env: {
      ...sanitizeEnv(process.env),
      CLAWD_SANDBOX_FILESYSTEM_MODE: 'workspace-only',
      AGENT_SESSION_ID: session.session_id,
      AGENT_TOOLS: JSON.stringify(agent.tools),
    },
    // Namespace isolation on Linux via nssetup
  })

  // 4. Wait for ready signal
  await waitForReady(child)

  // 5. Send prompt
  child.stdin.write(JSON.stringify(context))
  child.stdin.end()

  return { session, child, status: 'running' }
}
```

### 4. Wire Artifact Passing

When Worker A completes:

```typescript
// Worker A's final tool result → output artifact
const artifact = {
  type: 'lead_profile',
  company: 'Acme Corp',
  value: '$50K',
  summary: 'High-value HVAC lead, new company',
  draft_email: { subject, body, recipients: ['john@acme.com'] },
  provenance: {
    session_id: workerSession.session_id,
    step_count: lastCheckpoint.step,
    tools_used: [...],
  }
}

// Stored in task record
taskStore.setOutput(task_id, artifact)

// Team Lead receives lane.commit.created event with artifact
// Team Lead validates artifact and routes to downstream workers
```

### 5. Team Lead Coordination

The Team Lead node runs its own `DurableRunner` loop but with team-level tools:

- `team_status()`: "How is each worker doing?"
- `worker_output()`: "What did Worker A produce?"
- `assign_task()`: "Worker B, here is your input artifact"
- `escalate()`: "Maria, Worker C is blocked on a decision"

Team Lead subscribes to the SSE lane event stream and reasons about:
- Which workers are blocked and why
- Whether to reassign, wait, or escalate
- When to aggregate worker outputs into final result

### 6. Sidechain Transcripts

Every worker run produces a sidechain transcript stored separately:

```
/sessions/{session_id}.jsonl   ← Main coordinator transcript
/sidechains/{task_id}.jsonl   ← Worker transcript (append-only)
```

Sidechain transcripts are:
- Used for audit: Maria can inspect exactly what any worker did
- NOT passed to other workers (preserves isolation)
- Summarized by Team Lead into main transcript when worker completes

---

## SSE Lane Event Contract

Workers emit lane events via SSE. The Team Lead (and canvas UI) subscribe.

```typescript
// Worker: POST /api/teams/{teamId}/lane-events
{
  type: 'lane.progress',
  task_id: 'task_001',
  agent_id: 'agent_001',
  team_id: 'team_001',
  status: 'running',
  timestamp: 1744100000000,
  payload: {
    step: 14,
    tool_name: 'gmail.read',
    tool_input: { thread_id: 'xyz' },
  }
}

// Worker: POST /api/teams/{teamId}/lane-events
{
  type: 'lane.completed',
  task_id: 'task_001',
  agent_id: 'agent_001',
  team_id: 'team_001',
  status: 'completed',
  timestamp: 1744100050000,
  payload: {
    artifact: { ... },  // Output passed to downstream via wire
    steps_completed: 47,
    tokens_used: 3200,
  }
}
```

---

## Sandbox Isolation Model

On Linux, workers use namespace isolation:

```bash
unshare --user --mount --ipc --pid --uts \
  --map-root-user \
  --mount-proc \
  --fork \
  node worker-entry.js
```

On macOS (local dev), fall back to `workspace-only` mode (process chroot to project dir).

**Filesystem mode:**
- `off`: No restriction
- `workspace-only`: `$CANVAS_DIR` and `/tmp` only
- `allow-list`: Only configured mount points (e.g., `/Users/maria/Desktop`)

---

## Implementation Units

```
Unit A: Team Data Model + TeamRegistry
Unit B: Session Fork + Sidechain Transcripts
Unit C: Worker Boot + Sandbox Isolation
Unit D: Lane Event SSE Stream
Unit E: DurableRunner.executeTeam (fan-out loop)
Unit F: Team Lead Agent Node (canvas UI)
Unit G: Wire Artifact Passing + Downstream Routing
Unit H: Escalation + Completion
```

### Unit A: Team Data Model + TeamRegistry

**Files:**
- Create: `app/lib/db/migrations/015_teams.sql`
- Create: `app/lib/db/queries.ts` — add team CRUD + task CRUD
- Create: `app/lib/runtime/team-registry.ts` — in-memory `TeamRegistry` + `TaskRegistry`
- Create: `app/app/api/teams/route.ts` — `GET/POST /api/teams`
- Create: `app/app/api/teams/[teamId]/route.ts` — `GET/PATCH/DELETE`

### Unit B: Session Fork + Sidechain Transcripts

**Files:**
- Create: `app/lib/runtime/session.ts` — `Session` class with fork(), persistence to JSONL
- Create: `app/lib/runtime/sidechain-transcript.ts` — sidechain transcript storage + retrieval
- Modify: `app/lib/runtime/durable-runner.ts` — add `fork(sessionId, branchName)` and `createSidechain(taskId)`

**Approach:**
1. `Session.fork(branchName)` creates new session with `parent_session_id` set
2. Sessions persist to `.agentos/sessions/{session_id}.jsonl` (append-only JSONL)
3. Sidechain transcripts stored at `.agentos/sidechains/{task_id}.jsonl`
4. On worker completion: summarize sidechain into Team Lead's session as one assistant message

### Unit C: Worker Boot + Sandbox Isolation

**Files:**
- Create: `app/lib/runtime/worker-boot.ts` — `WorkerRegistry` state machine
- Create: `app/lib/runtime/sandbox.ts` — namespace isolation (`unshare` on Linux)
- Create: `app/workers/agent-worker.ts` — subprocess entry point for sandboxed agents
- Create: `app/lib/runtime/worker-pool.ts` — manages pool of worker processes

**State machine:**
```
spawning → trust_required → ready → running → completed
                        ↓
                   blocked (waiting for input)
```

### Unit D: Lane Event SSE Stream

**Files:**
- Create: `app/lib/runtime/lane-events.ts` — `LaneEvent` types + emitter
- Create: `app/app/api/teams/[teamId]/lane-events/route.ts` — SSE endpoint
- Modify: `app/lib/tracing/sse-stream.ts` — add lane event subscription

**Event types:** `lane.started | lane.progress | lane.blocked | lane.completed | lane.failed`

### Unit E: DurableRunner.executeTeam (fan-out loop)

**Files:**
- Modify: `app/lib/runtime/durable-runner.ts` — add `executeTeam(teamId)` method
- Create: `app/lib/runtime/coordinator-loop.ts` — fan-out algorithm

**Algorithm:** Root agents (no incoming wires) enqueued first. Max `MAX_CONCURRENT = 2`. Downstream agents enqueued when all their inputs are satisfied.

### Unit F: Team Lead Agent Node (canvas UI)

**Files:**
- Create: `app/app/components/canvas/TeamLeadNode.tsx` — distinct node type (different border, icon)
- Modify: `app/app/components/canvas/AgentNode.tsx` — worker variant
- Modify: `app/app/components/canvas/CanvasProvider.tsx` — add `teamId` + lane event subscription
- Modify: `app/app/components/canvas/InfiniteCanvas.tsx` — render Team Lead differently

### Unit G: Wire Artifact Passing + Downstream Routing

**Files:**
- Modify: `app/lib/runtime/durable-runner.ts` — wire output artifact to downstream inputs
- Create: `app/lib/runtime/artifacts.ts` — artifact schema (email_draft, lead_profile, research_summary)
- Modify: `app/lib/db/queries.ts` — add `updateTaskOutput()`

**Approach:**
1. Worker completes → output artifact stored in task record
2. `executeTeam` checks each wire: if source task is complete, pass artifact to target task's context
3. Target agent receives artifact as part of its prompt: "Your input: {artifact}"

### Unit H: Escalation + Completion

**Files:**
- Modify: `app/lib/runtime/durable-runner.ts` — lane events for escalation
- Modify: `app/app/components/canvas/EscalationCard.tsx` — add team escalation context
- Create: `app/lib/runtime/team-escalation.ts` — Team Lead escalation reasoning

**Completion:**
1. All root-to-leaf paths complete → `lane.completed` emitted
2. Team Lead aggregates artifacts into final summary
3. Activity log entry: "Team completed: {n} agents, {m} artifacts produced"
4. Canvas node status → `completed` (green checkmark)

---

## Execution Order

```
A → B → C → D → E → F → G → H
```

Each unit is gated: unit N+1 requires unit N to be stable.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Worker crash leaves zombie processes | High | Process group kill (`kill(-pid)`), timeout per worker |
| Namespace isolation requires Linux | Medium | Fall back to workspace-only mode on macOS/Darwin |
| Fan-out loop deadlock (circular wires) | Medium | Detect cycles in graph at team creation; reject |
| Sidechain transcript explosion | Low | Compact after N messages; keep summary |
| MAX_CONCURRENT tuning | Low | Start at 2; expose as config |

---

## Env Vars

| Variable | Purpose | Unit |
|---|---|---|
| `MAX_CONCURRENT_AGENTS` | Fan-out concurrency cap | E |
| `WORKER_TIMEOUT_MS` | Per-worker timeout | C |
| `SANDBOX_FILESYSTEM_MODE` | `off\|workspace-only\|allow-list` | C |
| `SIDECHAIN_RETENTION_DAYS` | Sidechain transcript retention | B |
