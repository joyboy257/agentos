---
title: feat: Multi-Agent Canvas UI — Canvas ↔ BullMQ Orchestration Wiring
type: feat
status: active
date: 2026-04-07
origin: docs/plans/2026-04-07-009-feat-agentos-multi-agent-orchestration-plan.md
---

# Multi-Agent Canvas UI — Canvas ↔ BullMQ Orchestration Wiring

## Overview

Wire the multi-agent BullMQ infrastructure (`coordinator-producer.ts`, `child-job-handler.ts`, `coordinator-loop.ts`) into the canvas so Maria can see multiple agents working in parallel: Team Lead coordinates, workers fan out, lane events drive real-time node status updates, and team-level escalations surface in `EscalationCard`.

This is purely a wiring task. All the infrastructure already exists — it needs to be connected to the UI and activated from the canvas.

## Problem Frame

The multi-agent runtime (`coordinator-loop.ts`, `team-registry.ts`, `lane-events.ts`) is built but not wired to the canvas UI. When Maria activates a team:

1. No BullMQ parent job is created from the canvas
2. Workers are not registered as `tasks` in the `tasks` table
3. Lane events (from `coordinator-loop.ts`) are emitted to an in-memory emitter but nothing subscribes to them in the UI
4. The canvas nodes show static status — they never reflect `lane.started`, `lane.progress`, `lane.completed`, or `lane.failed` from running agents
5. The Team Lead node doesn't show per-worker health dots reflecting actual worker statuses
6. Team-level escalations (`lane_blocked`) don't trigger `EscalationCard` with the right `teamContext`

## Requirements Trace

- R1 (from Phase 3 plan): BullMQ parent job created when team is activated from canvas
- R2: Workers appear as tasks in DB, tracked under the team
- R3: `subscribeToLaneEvents` is called when a team is active; node status updates reflect actual lane events
- R4: Team Lead node health dots reflect `teamMembers` Map updated by lane event handler
- R5: `lane_blocked` SSE events trigger `EscalationCard` with `teamContext.blastRadius` and worker identity
- R6: Activate button on a team canvas calls `DurableRunner.executeTeam(teamId)`, not `DurableRunner.execute(agentId)`

## Scope Boundaries

- **Not building:** `coordinator-loop.ts` (exists), `child-job-handler.ts` (exists), `team-registry.ts` (exists), `lane-events.ts` (exists), `sandbox.ts` (exists), `team-escalation.ts` (exists), `artifacts.ts` (exists)
- **Not changing:** `streaming-tool-executor.ts`, `coordinator-producer.ts`, `AgentNode` rendering variants (already done)
- **Not in scope:** Sandbox subprocess workers (Phase 3 Unit C) — workers run via `DurableRunner.executeSingleAgent` for now
- **Staged approach:** `executeTeam` is called via a new "Run Team" button. `coordinator-producer.ts` (BullMQ FlowProducer) and `coordinator-loop.ts` (fan-out) are independent work streams — `executeTeam` currently calls `coordinator-loop.ts` which calls `executeSingleAgent` (in-process). The BullMQ FlowProducer path is additive.

## Context & Research

### Relevant Code and Patterns

| File | Role | What Already Works |
|------|------|--------------------|
| `lib/runtime/coordinator-loop.ts` | Fan-out via wires; emits lane events | Lane events fire but no canvas subscriber |
| `lib/runtime/durable-runner.ts` | `executeTeam()` method | Calls `runCoordinator()` but not from API route |
| `lib/runtime/lane-events.ts` | In-memory `LaneEventEmitter` | Emits to SSE subscribers at `/api/teams/[id]/lane-events` |
| `app/lib/runtime/team-registry.ts` | In-memory team/task registry | Works but not wired to canvas activate flow |
| `lib/runtime/team-escalation.ts` | Evaluates when to escalate | `evaluateEscalation()` is called in `coordinator-loop.ts` |
| `app/app/api/teams/[teamId]/lane-events/route.ts` | SSE stream endpoint | Works — CanvasProvider already calls it |
| `app/app/api/teams/[teamId]/route.ts` | Team CRUD | Team exists in DB, but activation doesn't trigger execution |
| `app/app/components/canvas/CanvasProvider.tsx` | Canvas state + `subscribeToLaneEvents` | SSE subscription exists; status propagation exists but uses stale `agent_id` field |
| `app/app/components/canvas/InfiniteCanvas.tsx` | Canvas + escalation handlers | `lane_blocked` handler exists; team-ctx escalation works |
| `app/app/components/canvas/NodeDetailPanel.tsx` | Node detail panel | Shows "Team Lead overview" when nothing selected |

### Key Gap: Lane Event `agent_id` vs `task_id`

`LaneEvent` uses `agent_id` to identify the worker. `CanvasProvider.subscribeToLaneEvents` matches nodes by `n.id === laneEvent.agent_id`. But `coordinator-loop.ts` calls `laneEmitter.started(taskId, agentId)` — passing `taskId` as the first arg (which is `agentId` in the current call sites). The node IDs on the canvas match agent IDs. **This is correct as-is**, but the canvas `teamMembers` map also uses `agent_id` as key, so both the node status propagation and the team members map will work if `agent_id === node.id`.

### BullMQ vs In-Process Gap

`DurableRunner.executeTeam()` calls `runCoordinator()` which calls `executeSingleAgent()` (in-process). The BullMQ FlowProducer path in `coordinator-producer.ts` is a separate code path. The MVP of this wiring work will use the in-process fan-out via `executeTeam`. The BullMQ path is additive and noted in Unit 4.

## Open Questions

### Resolved During Planning

- **Which run ID to subscribe to for lane events?** `teamId` is the SSE subscription key. Lane events are keyed by `team_id` in the emitter. The canvas subscribes via `subscribeToLaneEvents(teamId)`. ✓
- **How does the canvas know which `teamId` to subscribe to?** When a team is loaded from `loadCanvas`, the `teamId` must be set in CanvasProvider. The canvas has a `teamId` field but it's not populated from DB. `loadCanvas` must also load the team for that canvas. ✓
- **`executeTeam` vs `execute`?** Team activation must call `executeTeam(teamId)`, not `execute(agentId)`. The Activate button currently calls the agent-level API. A new "Run Team" flow is needed. ✓

### Deferred to Implementation

- **BullMQ FlowProducer path:** `coordinator-producer.ts` is ready but `executeTeam` currently calls `coordinator-loop` directly. Wiring the FlowProducer path is a separate unit (Unit 4) after the canvas wiring works with the in-process fan-out.
- **Worker sandbox subprocess boot:** `spawnWorker` and `worker-registry.ts` are in-memory only. Workers run via `executeSingleAgent` for now. The sandbox subprocess path is Phase 3 Unit C and is out of scope for canvas wiring MVP.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
Maria clicks "Run Team"
    │
    ▼
POST /api/teams/[teamId]/activate
    │  (new route — creates run, calls DurableRunner.executeTeam(teamId))
    │
    ▼
executeTeam(teamId)
    │
    ├─► runCoordinator(teamId, agents, wires)
    │       │
    │       ├─► laneEmitter.started(agentId, agentId)
    │       │       │  (SSE → /api/teams/[teamId]/lane-events → CanvasProvider)
    │       │       │
    │       │       ▼
    │       │   CanvasProvider: setNodes(n => n.map(matching node → status='running'))
    │       │   CanvasProvider: teamMembers.set(agentId, {name, status:'running'})
    │       │
    │       ├─► executeSingleAgent(agentId, upstreamArtifact)
    │       │       │
    │       │       ▼
    │       │   streamingToolExecutor → tool calls → checkpoints
    │       │
    │       └─► laneEmitter.completed(agentId, agentId, artifact)
    │               │  (SSE → same stream)
    │               ▼
    │           CanvasProvider: setNodes(n => matching node → status='idle')
    │           CanvasProvider: teamMembers.set(agentId, {name, status:'completed'})
    │
    └─► updateTeamStatus(teamId, 'completed')

Team Lead node (isCoordinator=true):
    - teamMembers Map drives health dot colors
    - "Coordinating N worker(s)..." when any worker is 'running'
```

## Implementation Units

- [x] **Unit 1: Team Activate API — wire `executeTeam` to a REST endpoint**

**Goal:** Create `POST /api/teams/[teamId]/activate` that calls `DurableRunner.executeTeam(teamId)`. This is the entry point that starts the multi-agent fan-out from the canvas.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `app/app/api/teams/[teamId]/activate/route.ts`

**Approach:**
- `POST /api/teams/[teamId]/activate`
- Auth: require session (via `getSessionFromCookie`)
- Load team via `getTeam(teamId)`, verify ownership
- Call `DurableRunner.executeTeam(teamId)` — this calls `runCoordinator` which fans out agents and emits lane events
- Return `{ runId: teamId }` immediately (async)
- Error: return 404 if team not found, 403 if not owner, 500 on execution error

**Patterns to follow:**
- `app/app/api/agents/[agentId]/resume/route.ts` — similar async activation pattern

**Test scenarios:**
- POST to activate a valid team returns 200 and doesn't block
- POST to activate a non-existent team returns 404
- Team with no agents: `executeTeam` completes immediately (no-op)

**Verification:**
- Team activated → `updateTeamStatus` called with `'running'` in DB
- Lane events appear at `/api/teams/[teamId]/lane-events` SSE stream within seconds

---

- [x] **Unit 2: Canvas — load team on canvas load, wire Activate to Team Lead node**

**Goal:** When `loadCanvas(canvasId)` is called, also load the associated team and set `teamId` in CanvasProvider. Wire a "Run Team" button on the Team Lead node (or canvas toolbar) to call `POST /api/teams/[teamId]/activate`.

**Requirements:** R1, R3

**Dependencies:** Unit 1

**Files:**
- Modify: `app/app/components/canvas/CanvasProvider.tsx` — `loadCanvas` also fetches team for this canvas and sets `teamId` state
- Modify: `app/app/components/canvas/InfiniteCanvas.tsx` — "Run Team" button calls `POST /api/teams/[teamId]/activate`
- Modify: `app/app/(app)/canvas/page.tsx` — pass `canvasId` to `InfiniteCanvas`

**Approach:**
1. In `CanvasProvider.loadCanvas`, after loading the canvas, fetch `GET /api/teams?canvasId=${id}` to find the team's `teamId`
2. Set `setTeamId(team?.id)` in CanvasProvider state — this triggers the existing `useEffect([teamId])` that calls `subscribeToLaneEvents(teamId)`
3. In `InfiniteCanvas`, add a "Run Team" button to the canvas toolbar (or as a floating action button near the Team Lead node) that POSTs to `/api/teams/${teamId}/activate`
4. The button should show a loading state while the team is running

**Canvas loading flow (before):**
```
loadCanvas(id) → setCurrentCanvasId → fetch /api/canvases/[id] → hydrate nodes/edges
```

**Canvas loading flow (after):**
```
loadCanvas(id) → setCurrentCanvasId → fetch /api/canvases/[id] → hydrate nodes/edges
                → fetch GET /api/teams?canvasId=id → setTeamId(team.id)
                → useEffect([teamId]) → subscribeToLaneEvents(teamId) → SSE connection active
```

**Patterns to follow:**
- Existing `canvasId` prop → `loadCanvas` pattern in `CanvasProvider`
- Existing `handleActivate` → NL deploy flow in `InfiniteCanvas`

**Test scenarios:**
- Canvas loads with a team → `teamId` is set → SSE subscription starts automatically
- "Run Team" button POSTs and team starts running → nodes transition to `running` status
- Switching canvases: old SSE closes, new SSE opens for new `teamId`

**Verification:**
- Open a canvas that has a team → DevTools network shows SSE connection to `/api/teams/[teamId]/lane-events`
- Click "Run Team" → within 2s, at least one `lane.started` event appears in the SSE stream

---

- [x] **Unit 3: Team Lead Node — per-worker health dots driven by `teamMembers` Map**

**Goal:** The Team Lead node's health dots (and "Coordinating N workers" subtitle) reflect actual worker statuses from the `teamMembers` Map updated by lane event subscriptions.

**Requirements:** R4

**Dependencies:** Unit 2

**Files:**
- Modify: `app/app/components/canvas/AgentNode.tsx` — update `teamMembers` prop rendering to use `name` from `teamMembers` Map (not just status dots)
- Modify: `app/app/components/canvas/CanvasProvider.tsx` — `subscribeToLaneEvents` `teamMembers` map entries should include the agent's display `name` (fetched from node data if not known)

**Approach:**
1. When `subscribeToLaneEvents` receives a `lane.started` event, it sets `teamMembers.set(agent_id, { name: existing?.name ?? agent_id, status: laneEvent.status })`. The `name` falls back to `agent_id` which is a ULID — not user-friendly.
2. Fix: when setting the `name`, look up the agent's display name from the canvas nodes: `nodes.find(n => n.id === agent_id)?.data.name ?? agent_id`
3. Update `AgentNode` coordinator variant to show the worker name next to each health dot (not just a colored circle)
4. "Coordinating N worker(s)..." subtitle should show `teamMembers.size` when any member has `status === 'running'`

**Technical design:**
```typescript
// In subscribeToLaneEvents, when updating teamMembers:
setTeamMembers(prev => {
  const next = new Map(prev)
  const nodeName = nodes.find(n => n.id === laneEvent.agent_id)?.data.name ?? laneEvent.agent_id
  next.set(laneEvent.agent_id, {
    name: nodeName,   // was: existing?.name ?? laneEvent.agent_id
    status: laneEvent.status,
  })
  return next
})
```

**Patterns to follow:**
- `CanvasProvider.subscribeToLaneEvents` existing `teamMembers` Map update logic

**Test scenarios:**
- Worker A starts → Team Lead shows blue dot + "HubSpot Ingest Worker"
- Worker A completes → dot turns green
- Worker B fails → dot turns red + worker name shown

**Verification:**
- `lane.started` for `worker-1` → Team Lead health dot for that worker shows correct name
- All workers completed → Team Lead shows "Team is idle"

---

- [x] **Unit 4: BullMQ FlowProducer path — wire `enqueueCoordinatorJob` into `executeTeam`**

**Goal:** `executeTeam` currently calls `runCoordinator` (in-process fan-out). Wire the BullMQ `FlowProducer` path via `enqueueCoordinatorJob` so multi-agent runs survive server restarts. The in-process path remains for single-agent runs.

**Requirements:** R1 (distributed durability)

**Dependencies:** Units 1-3 (canvas wiring must work first as baseline)

**Files:**
- Modify: `app/lib/runtime/durable-runner.ts` — `executeTeam` calls `enqueueCoordinatorJob` instead of `runCoordinator` for the BullMQ path; add `USE_BULLMQ_ORCHESTRATION` feature flag
- Modify: `app/lib/runtime/coordinator-loop.ts` — extend `buildChildSpecs` to build child tree from canvas wires (not just single root agent)
- Modify: `app/lib/runtime/child-job-handler.ts` — emit lane events from within BullMQ child job processor so events survive across worker restarts

**Approach:**
- `executeTeam` gets an `options.experimental_useBullMQ` flag (default `false` for MVP)
- When `true`: calls `enqueueCoordinatorJob` with children built from canvas wire graph
- Child jobs emit lane events via `POST /api/teams/${teamId}/lane-events/stream` (the stream endpoint, not SSE) — this survives across worker restarts because the emitter is in-memory but the HTTP POST is fire-and-forget
- `buildChildSpecs` traverses canvas wires: for each root agent → one child; downstream agents become children of their upstream completers
- This is the bridge between `coordinator-producer.ts` (BullMQ) and `coordinator-loop.ts` (fan-out)

**Deferred:** Child job result serialization (BullMQ job results may contain non-serializable values). The MVP uses in-process fan-out via `executeTeam` + `runCoordinator`.

**Patterns to follow:**
- `enqueueCoordinatorJob` signature in `coordinator-producer.ts`
- `coordinator-loop.ts` wire traversal in `buildChildSpecs`

**Test scenarios:**
- With flag off: `executeTeam` uses `runCoordinator` (in-process) — existing behavior
- With flag on: BullMQ parent job created → child jobs dispatched → lane events emitted
- Server restart mid-run: parent job resumes via `moveToWaitingChildren`; child completions reflected in canvas

**Verification:**
- BullMQ dashboard shows parent → child job tree
- Canvas node statuses update correctly via lane events from child job completion

---

- [x] **Unit 5: Wire error propagation — `lane.failed` → `lane_blocked` SSE → `EscalationCard` with `teamContext`**

**Goal:** When a worker fails (`lane.failed`), `evaluateEscalation` recommends escalation and `EscalationCard` appears with the worker's identity, task ID, and blast radius. This is partially wired in `InfiniteCanvas` but `teamContext` may be incomplete.

**Requirements:** R5

**Dependencies:** Units 1-2

**Files:**
- Modify: `app/app/components/canvas/InfiniteCanvas.tsx` — ensure `lane_blocked` handler populates `teamContext` fully: `workerName`, `taskId`, `teamId`, `blastRadius`
- Modify: `app/lib/runtime/coordinator-loop.ts` — pass `taskId` (not just `agentId`) to `laneEmitter.blocked()` so escalation card can show which specific task failed

**Approach:**
1. In `coordinator-loop.ts`, when a worker fails, emit `lane.blocked` with `task_id` set to the `agentId` (current behavior) and include the `blockReason` in `payload.error`
2. In `InfiniteCanvas.lane_blocked` handler, `teamContext` already extracts `workerName: event.agent_id` and `taskId: event.task_id` — verify these match
3. `blastRadius`: pass the upstream artifact (`t.outputArtifact`) in `payload.artifact` so `InfiniteCanvas` can stringify it as the blast radius description
4. `EscalationCard` already has a `teamContext` section — verify it renders correctly with the purple "Team" badge

**Patterns to follow:**
- `InfiniteCanvas` existing `lane_blocked` handler (lines 120-140)
- `EscalationCard` `teamContext` rendering in `EscalationCard.tsx`

**Test scenarios:**
- Worker fails → `EscalationCard` appears with "Team" badge, worker name, and blast radius description
- "Approve" on team escalation → `handleApprove` resolves the lane blocked state
- Worker completes successfully → no escalation card

**Verification:**
- `lane.failed` emitted → `EscalationCard` with `teamContext` appears within 1s
- Card shows correct worker name (not a raw agent ID)

---

- [x] **Unit 6: Node status badge — `waiting` state for workers blocked on upstream dependencies**

**Goal:** When a worker is in the `queue` (waiting for upstream agents to complete), the canvas node should show `status: 'waiting'` with a "Needs input" badge — matching the existing `waiting` status UI in `AgentNode`. The coordinator-loop already tracks `queue` state in memory but doesn't emit a `lane.waiting` event. Add it.

**Requirements:** (implicit — UX clarity)

**Dependencies:** Units 1-2

**Files:**
- Modify: `app/lib/runtime/coordinator-loop.ts` — emit `laneEmitter.waiting(agentId, agentId)` when an agent is enqueued (added to `queue`) and `laneEmitter.started` when it actually begins running
- Modify: `app/lib/runtime/lane-events.ts` — add `lane.waiting` event type to `LaneEventName` union and `LaneEventEmitter.waiting()` method
- Modify: `app/app/components/canvas/CanvasProvider.tsx` — `subscribeToLaneEvents` handles `lane.waiting` → sets node status to `'waiting'`

**Approach:**
1. Add `lane.waiting` to `LaneEventName` type in both `CanvasProvider.tsx` and `lane-events.ts`
2. In `coordinator-loop.ts`: when `queue.push(downstreamId)` is called, also emit `laneEmitter.waiting(downstreamId, downstreamId)`
3. In `CanvasProvider.subscribeToLaneEvents`: handle `lane.waiting` → map to `NodeStatus['waiting']`
4. `AgentNode` already renders `status === 'waiting'` with a pulsing "Needs input" badge — no node component changes needed

**Patterns to follow:**
- `laneEmitter.started` / `laneEmitter.completed` / `laneEmitter.blocked` pattern in `coordinator-loop.ts`
- `LaneEventName` union in `CanvasProvider.tsx`

**Test scenarios:**
- Root agents start → leaf agent still waiting on upstream → leaf agent shows "Needs input" badge
- Upstream completes → leaf agent's badge disappears, status changes to `running`

**Verification:**
- Canvas shows "Needs input" badge on a worker that is queued but not yet running

---

- [x] **Unit 7: Canvas page — add team selector / "My Team" header**

**Goal:** When a canvas has a team, show a "My Team" header or badge on the canvas page so Maria knows she's looking at a team canvas, not a single-agent canvas.

**Requirements:** (UX clarity)

**Dependencies:** Units 1-2

**Files:**
- Modify: `app/app/(app)/canvas/page.tsx` — show team name + status in canvas header when team is loaded

**Approach:**
- In `CanvasPage` (or wherever the canvas header is rendered), read `teamId` from `useCanvas()` and fetch team info to show name and status chip (e.g., "Team: Research · Running")

**Patterns to follow:**
- Existing canvas header pattern in `page.tsx`

**Verification:**
- Canvas with team shows team name in header
- Switching to a canvas without a team: no team header shown

## System-Wide Impact

- **SSE stream per team:** Each canvas with an active team holds one SSE connection to `/api/teams/[teamId]/lane-events`. Switching canvases closes the old SSE and opens a new one. No connection leaks if cleanup is correct.
- **Lane event naming collision:** `coordinator-loop.ts` uses `agentId` as both `task_id` and `agent_id` in lane events (they're the same in the current design). If a future task maps to a different agent, the naming must be updated. Currently consistent.
- **Canvas with no team:** `loadCanvas` fetches the team but `teamId` stays `undefined` → `subscribeToLaneEvents` never called → no SSE opened. Normal for single-agent canvases.
- **Concurrent team activations:** If Maria clicks "Run Team" twice, two `executeTeam` runs start independently. Both write to the same `tasks` table rows. Mitigation: disable the "Run Team" button while the team is `status === 'running'`.

## Risks & Dependencies

1. **Risk: Lane event field mismatch.** `coordinator-loop.ts` passes `agentId` as both `taskId` and `agentId` in lane events. If the canvas node ID doesn't match `agentId`, node status won't update. **Mitigation:** Node IDs are agent IDs from canvas. `loadCanvas` seeds `team-lead-1` as coordinator and wires agents by their DB IDs. As long as the canvas nodes use agent IDs as keys, this is consistent.
2. **Risk: SSE connection management.** `subscribeToLaneEvents` opens an SSE in a `useEffect`. If `teamId` changes before the cleanup function runs, the old connection may leak. **Mitigation:** The cleanup function (`return () => eventSource.close()`) is registered correctly. The `useEffect` depends on `teamId`.
3. **Risk: `executeTeam` async fire-and-forget.** `executeTeam` is called and returns immediately. The UI won't know if it failed to start (only if the HTTP call fails). **Mitigation:** The API route returns 500 if `executeTeam` throws before starting any agents.
4. **Dependency order:** Units 1-3 must land in order. Units 4-7 are additive on top.

## Documentation / Operational Notes

- **Testing the full flow:** Create a team with 2 workers + 1 Team Lead → click "Run Team" → watch DevTools Network tab for SSE at `/api/teams/[teamId]/lane-events` → observe node status transitions in real time
- **BullMQ dashboard:** When Unit 4 lands, parent/child job relationships visible at `http://localhost:3000/admin/bulls` (or BullMQ Pro dashboard)
- **Lane event log:** `CanvasProvider.laneEvents` state holds last 200 lane events — useful for debugging in DevTools

## Sources & References

- Phase 3 orchestration plan: `docs/plans/2026-04-07-009-feat-agentos-multi-agent-orchestration-plan.md`
- Phase 3 design: `docs/plans/2026-04-07-001-feat-agentos-phase-3-plan.md`
- Canvas components: `app/app/components/canvas/CanvasProvider.tsx`, `InfiniteCanvas.tsx`, `AgentNode.tsx`
- Runtime: `app/lib/runtime/durable-runner.ts`, `coordinator-loop.ts`, `lane-events.ts`
- Team API: `app/app/api/teams/[teamId]/lane-events/route.ts`
- Existing escalated flow: `app/app/components/canvas/EscalationCard.tsx`
