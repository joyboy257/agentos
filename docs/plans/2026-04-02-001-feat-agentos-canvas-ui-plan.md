# Plan: Canvas UI

**Date:** 2026-04-02
**Type:** feat
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v5.1 — Visual Canvas (Pillar 1), NL-to-Canvas (R1), Coordinator Pattern (Section 9A)

---

## Goal

Build the infinite canvas that is the primary interface for Maria — the visual workspace where she builds, manages, and trusts her AI team. The canvas is the trust layer: every node is a visible agent, every wire is a real connection, every escalation is a human decision.

This is the screen Maria sees when she logs in. It must feel like a professional design tool (Figma, Notion) — spatial, direct, trustworthy — not a developer console.

---

## Problem Frame

The canvas serves three simultaneous needs:

1. **Situational awareness** — "What is my team doing right now?" → Maria sees all nodes, their status, active wires
2. **Team composition** — "I need a worker that reads from HubSpot, processes the data, and sends me a summary" → NL prompt bar + archetype sidebar
3. **Trust building** — "Show me exactly why this agent escalated" → Reasoning trace panel, escalation cards

---

## Requirements Traceability

| Requirement | Source |
|---|---|
| Visual Canvas (Pillar 1) | PRD v5.1 — Vision |
| NL-to-canvas pipeline builder (R1) | PRD v5.1 |
| Team Lead visible as full LLM agent (Section 9A) | PRD v5.1 |
| Human-in-the-loop approval checkpoints (R5) | PRD v5.1 |
| Readable reasoning trace per pipeline run (R6) | PRD v5.1 |
| Reliable execution with visible failure states (R7) | PRD v5.1 |
| GDPR retention with automated enforcement (R8) | PRD v5.1 |
| GDPR retention with automated enforcement (R8) | PRD v5.1 |

---

## Non-Goals

- Multi-canvas workspaces (Phase 2)
- Public/private node sharing (Phase 2)
- Real-time collaborative editing (Phase 2)
- Canvas mobile-native (responsive web only, Phase 1)
- Agent-to-agent handoff animations (deferred)
- Full prompt engineering UI — NL layer handles interpretation; users adjust canvas only

---

## High-Level Design

### Canvas Screen Anatomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AgentOS  [🔍 Search...]           [+ Add Worker]  [Prompt Bar ⌘K]  [👤 ▾] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐                                                        │
│   │ ▣ Archetypes│                    INFINITE CANVAS                      │
│   ├─────────────┤                                                        │
│   │ Ingest      │           ┌──────────────────┐                        │
│   │ • Gmail     │           │  👑 Team Lead    │                        │
│   │ • HubSpot   │           │                  │                        │
│   │ • Calendar  │           │  Full LLM agent  │                        │
│   │ • Web       │           │                  │                        │
│   ├─────────────┤           └────────┬─────────┘                        │
│   │ Process     │                    │                                   │
│   │ • Filter    │           ┌────────┴─────────┐                        │
│   │ • Transform │           │                 │                        │
│   │ • Draft     │           ▼                 ▼                        │
│   ├─────────────┤     ┌───────────┐     ┌───────────┐                   │
│   │ Distill     │     │  Worker A │     │  Worker B │                   │
│   │ • Summarize │     │  Ingest   │     │  Process  │                   │
│   │ • Notify    │     │           │     │           │                   │
│   │ • Store     │     └───────────┘     └───────────┘                   │
│   └─────────────┘                                                        │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ "Hire a worker that follows up with leads who haven't replied..." │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Team Lead Node (coordinator, always present)

```
┌──────────────────────────────────────────────┐
│ 👑  Maria's Team Lead              [Real-time] │
│ ────────────────────────────────────────────  │
│                                              │
│  Status: ● Running                          │
│  Team: 3 workers active                      │
│                                              │
│  Last decision: "Rerouting lead to Worker B" │
│  2 minutes ago                               │
│                                              │
│  [View Reasoning]  [Edit Team]  [Settings]  │
└──────────────────────────────────────────────┘
```

**Visual distinction from Workers:**
- Purple border (`--node-team-lead`) instead of indigo
- Crown icon + "Team Lead" label
- Shows aggregate team status, not individual task stats
- Reasoning trace shows coordinator-level decisions

### Worker Node (generic worker, can be N of them)

```
┌──────────────────────────────────────────────┐
│ [Ingest ▾]  Lead Research Worker    [⋮]     │
│ ────────────────────────────────────────────  │
│  ● Running                                 │
│  Archetype: Ingest                          │
│                                              │
│  Tools: HubSpot, Gmail                      │
│  Runs today: 47                            │
│  Escalated: 3                              │
│                                              │
│  [View Trace]  [Edit]  [Disconnect]        │
└──────────────────────────────────────────────┘
```

### Archetype Sidebar

Three archetypes, each with typed tools:

| Archetype | Reads | Writes | Examples |
|-----------|-------|--------|---------|
| **Ingest** | Gmail, HubSpot, Calendar, Web, Slack, Files | — | "Read my emails", "Pull HubSpot leads", "Check my calendar" |
| **Process** | Its own context | Tools it has access to | "Filter for hot leads", "Draft a follow-up email", "Decide if this is a $10K+ deal" |
| **Distill** | All upstream outputs | Maria, Slack, CRM, Files | "Summarize the top 5 leads", "Notify me of escalations", "Store findings to Notion" |

---

## Implementation Units

### Unit 1: Canvas Foundation (Infinite Canvas + Pan/Zoom)

**Goal:** Build the infinite canvas with pan, zoom, and grid background.

**Requirements:** PRD v5.1 Visual Canvas

**Dependencies:** None (pure UI foundation)

**Files:**
- `app/app/components/canvas/CanvasPage.tsx` — main page
- `app/app/components/canvas/InfiniteCanvas.tsx` — canvas viewport with pan/zoom
- `app/app/components/canvas/CanvasGrid.tsx` — dot grid background
- `app/app/components/canvas/TopNav.tsx` — top navigation
- `app/app/components/canvas/__tests__/InfiniteCanvas.test.tsx`

**Approach:**

The canvas uses **React Flow** (MIT, battle-tested, well-supported) for the node/wire graph. React Flow handles:
- Pan and zoom (built-in)
- Node positioning and dragging
- Wire connections
- Viewport management
- Minimap

We wrap React Flow with a custom node type system (Team Lead, Worker) and our own design tokens.

**Canvas viewport:**
```
- Background: --bg-canvas (#F0F0EC)
- Dot grid: 20px spacing, dots at intersections, --border-default at 30% opacity
- Zoom range: 25% – 200%
- Pan: drag on empty canvas, or middle-mouse
- Zoom: scroll wheel, or pinch on trackpad
```

**TopNav:**
```
[Logo]  [Search: "Search nodes..."]   [+ Add Worker]  [⌘K Prompt Bar]  [Avatar ▾]
```
- Search filters nodes by name (client-side)
- "+ Add Worker" opens archetype sidebar if collapsed
- "⌘K Prompt Bar" focuses the NL prompt input
- Avatar: Settings, Help, Sign Out

**Patterns to follow:** React Flow docs + existing component structure in `app/app/components/`

**Test scenarios:**
- Canvas renders with 0 nodes (empty state)
- Canvas supports 10+ nodes without performance degradation
- Pan works via drag and keyboard (arrow keys)
- Zoom works via scroll wheel and pinch
- Minimap shows all nodes correctly positioned
- Responsive layout: canvas hidden on mobile (<640px), replaced by list view

**Verification:** Visual QA. Performance test with 20 nodes.

---

### Unit 2: Node Components (Team Lead + Worker)

**Goal:** Build the Team Lead node and Worker node components with live status.

**Requirements:** PRD v5.1 Section 9A (Coordinator Pattern), R2 (Readable pipeline visualization)

**Dependencies:** Unit 1 (canvas foundation)

**Files:**
- `app/app/components/nodes/TeamLeadNode.tsx` — Team Lead node
- `app/app/components/nodes/WorkerNode.tsx` — generic worker node
- `app/app/components/nodes/NodeHeader.tsx` — shared node header
- `app/app/components/nodes/NodeStatus.tsx` — status badge
- `app/app/components/nodes/NodeActions.tsx` — quick action buttons
- `app/app/types/node.ts` — Node runtime types
- `app/app/components/nodes/__tests__/TeamLeadNode.test.tsx`
- `app/app/components/nodes/__tests__/WorkerNode.test.tsx`

**Node Runtime Type:**

```typescript
// app/app/types/node.ts

export type NodeArchetype = 'ingest' | 'process' | 'distill';
export type NodeStatus = 'running' | 'scheduled' | 'stopped' | 'error' | 'waiting';

export interface CanvasNode {
  id: string;
  type: 'team-lead' | 'worker';
  position: { x: number; y: number };
  data: {
    name: string;
    archetype?: NodeArchetype;  // workers only
    status: NodeStatus;
    tools: string[];             // capability IDs
    run_count_today: number;
    escalated_count_today: number;
    last_run_at: string | null;
    // Team Lead specific:
    worker_count?: number;        // team lead only
    team_status?: NodeStatus;     // team lead only
    last_decision?: string;      // team lead only
  };
}
```

**Team Lead node:**
- Always visible on canvas (auto-created when org is created)
- Cannot be deleted or disconnected
- Shows aggregate team status, not individual tool stats
- "View Reasoning" opens the Team Lead's trace, which shows coordination decisions
- Purple border, crown icon, `--node-team-lead` color

**Worker node:**
- Draggable on canvas
- Connects to Team Lead via wires
- Shows archetype badge (Ingest/Process/Distill)
- Status badge (running/scheduled/stopped/error/waiting)
- Stats: runs today, escalations today

**Test scenarios:**
- Team Lead node renders with all fields populated
- Worker node renders with archetype badge matching its type
- Status badge shows correct color + icon for each status
- Node drag repositions correctly on canvas
- Node shows "waiting" status when upstream wire has no data yet
- Nodes with `status: error` show red border and error message

**Verification:** Component renders correctly in isolation and on canvas. Visual QA with all status states.

---

### Unit 3: Wire Connections

**Goal:** Allow Maria to wire nodes together to define data flow.

**Requirements:** PRD v5.1 Section 9A (How Wiring Works), R2 (Readable pipeline visualization)

**Dependencies:** Unit 2 (node components)

**Files:**
- `app/app/components/canvas/WireLayer.tsx` — custom wire rendering with design tokens
- `app/app/components/canvas/ConnectionHandle.tsx` — input/output handles on nodes
- `app/app/hooks/useWireState.ts` — wire state management
- `app/app/components/canvas/__tests__/WireLayer.test.tsx`

**Wire behavior:**
- A worker node has one output handle (right edge) and one input handle (left edge)
- Team Lead node has: input handles from workers (left), output handles to workers (right)
- Click-and-drag from output handle to input handle creates a wire
- Wires are directed (carry output artifact from source to target)
- Multiple wires can connect to a single input (fan-in)
- A single wire can only connect one output to one input (1:1 or fan-in)

**Wire states:**
- **Idle:** `--wire-default`, solid gray
- **Active (data flowing):** `--wire-active`, indigo, subtle flow animation (dashed stroke moving)
- **Escalation:** `--wire-escalation`, amber, solid
- **Error:** `--wire-error`, red, solid

**Wire rendering:**
- Bezier curves (React Flow built-in) with our color tokens
- Animated pulse when data is flowing (CSS stroke-dashoffset animation)
- Arrow head at receiving (input) end

**Test scenarios:**
- Wire connects output of Worker A to input of Worker B
- Wire appears as active when source node is running
- Wire turns escalation-colored when a downstream node escalates
- Clicking a wire shows a delete option
- Wires persist across page refresh (saved to backend)

**Verification:** Visual QA of wire colors and animations in all states.

---

### Unit 4: NL Prompt Bar + Archetype Sidebar

**Goal:** Allow Maria to add and configure nodes using natural language.

**Requirements:** PRD v5.1 R1 (NL-to-canvas pipeline builder)

**Dependencies:** Unit 1 (canvas)

**Files:**
- `app/app/components/canvas/NLPromptBar.tsx` — fixed prompt input at bottom
- `app/app/components/canvas/ArchetypeSidebar.tsx` — left sidebar with draggable archetypes
- `app/app/components/canvas/ArchetypeChip.tsx` — individual draggable archetype
- `app/app/hooks/useNLToCanvas.ts` — NL interpretation + canvas update logic
- `app/app/api/canvas/nl-to-canvas/route.ts` — NL interpretation API
- `app/app/components/canvas/__tests__/NLPromptBar.test.tsx`

**Archetype sidebar:**
- Fixed left side, 240px wide, collapsible to 48px icon strip
- Three sections: Ingest, Process, Distill
- Each archetype is a draggable chip
- Drag to canvas to add a new worker node at that position

**Prompt bar:**
- Fixed bottom center, 560px wide, pill-shaped
- Sparkle icon + placeholder "What do you want your team to do?"
- `⌘K` / `Ctrl+K` global shortcut to focus
- On submit: shows "Building..." state with animation, then updates canvas

**NL interpretation flow:**
```
Maria types: "follow up with leads who haven't replied in 7 days"
    │
    ▼
POST /api/canvas/nl-to-canvas
{
  goal: "follow up with leads who haven't replied in 7 days",
  existing_nodes: [...],
  archetype_sidebar_capabilities: [...]
}
    │
    ▼
LLM interprets goal → selects/creates worker nodes + wires
Returns: { nodes_to_add: [...], wires_to_create: [...], worker_configs: {...} }
    │
    ▼
Canvas updates: new nodes appear with spring animation, wires connect
Team Lead shows "Building pipeline for: follow up with leads..." during processing
```

**NL interpretation API:**
```typescript
// POST /api/canvas/nl-to-canvas
interface NLToCanvasRequest {
  goal: string;                          // Maria's natural language goal
  existing_nodes: CanvasNode[];         // Current canvas state
  archetype_capabilities: Capability[];  // Available capabilities from registry
}

interface NLToCanvasResponse {
  nodes_to_add: Partial<CanvasNode>[];   // New nodes to create
  wires_to_create: Wire[];               // Connections to make
  worker_configs: Record<string, WorkerConfig>; // Per-node configuration
  explanation: string;                   // Plain English: "I'll add a HubSpot ingest worker
                                         // to read leads, a filter worker to find
                                         // unresponsive ones, and a Gmail worker to send
                                         // follow-ups."
}
```

**Test scenarios:**
- Typing in prompt bar and pressing enter triggers NL interpretation
- NL interpretation returns valid node additions to canvas
- Multiple nodes added at once appear with staggered animation
- NL prompt bar keyboard shortcut works globally (⌘K)
- Archetype sidebar collapses/expands
- Dragging archetype chip to canvas creates a new node at drop position
- Empty state: "Start by adding a worker or typing what you want..."

**Verification:** Full integration test of NL-to-canvas flow. User testing with Maria personas.

---

### Unit 5: Real-Time Reasoning Trace Panel

**Goal:** When Maria clicks "View Trace" on any node, show the live reasoning trace for that node's current or most recent run.

**Requirements:** PRD v5.1 R6 (Readable reasoning trace per pipeline run)

**Dependencies:** Unit 2 (node components), Durable Execution plan

**Files:**
- `app/app/components/canvas/ReasoningPanel.tsx` — slide-in panel
- `app/app/components/canvas/ReasoningStep.tsx` — individual step in trace
- `app/app/components/canvas/EscalationModal.tsx` — escalation decision UI
- `app/app/api/canvas/[nodeId]/runs/[runId]/steps/route.ts` — steps API
- `app/app/components/canvas/__tests__/ReasoningPanel.test.tsx`

**ReasoningStep Type:**

```typescript
interface ReasoningStep {
  step_id: string;
  timestamp: string;
  type: 'tool_call' | 'tool_result' | 'decision' | 'escalate' | 'completed' | 'error';
  tool_name?: string;
  tool_input?: object;
  tool_output?: object;
  decision?: {
    reasoning: string;      // the LLM's chain-of-thought
    action: string;         // what it decided to do
    confidence: number;     // 0-1
  };
  escalate?: {
    reason: string;
    confidence_threshold: number;
    user_notification_sent: boolean;
  };
  exit_reason?: 'completed' | 'escalated' | 'budget_exceeded' | 'stopped';
}
```

**Panel UX:**
- Slides in from right (480px on desktop, full-width on mobile)
- Steps appended in real time via polling (2s interval for running nodes)
- Tool call steps show: tool name, input, collapsible output
- Escalation steps highlighted in amber with prominent action buttons
- "Load earlier steps" for long runs (> 20 steps)
- Auto-scrolls to bottom when new steps arrive (unless user scrolled up)
- "Jump to latest" button appears when scrolled up

**Escalation Modal (within panel):**

```
┌──────────────────────────────────────────────────────────┐
│ ⚠️  [Node Name] needs your input                         │
│                                                          │
│ [Plain English description of what the agent wants        │
│  to do and why it escalated — 1-2 sentences max]          │
│                                                          │
│ ────────────────────────────────────────                 │
│ What the agent plans to do:                              │
│ • [Action bullet 1]                                      │
│ • [Action bullet 2]                                       │
│                                                          │
│ [Approve & Send]  [Edit & Approve]  [Cancel]            │
└──────────────────────────────────────────────────────────┘
```

**Team Lead trace:** Shows coordination decisions ("Rerouting to Worker B", "Splitting task into 3 subtasks", "Waiting for Worker C to complete"). Different from worker traces.

**Test scenarios:**
- Panel renders with 0 steps (new node, never run)
- Panel renders with N steps from completed run
- Escalation step shows modal with correct context
- Real-time polling appends new steps without re-rendering entire panel
- User at bottom sees auto-scroll; user scrolled up sees "↓ New steps" indicator
- Long tool output collapsed by default with "Show more"
- Team Lead trace shows only coordination events, not tool-level detail

**Verification:** Visual QA with mock running node. User testing.

---

### Unit 6: Human-in-the-Loop Escalation UI

**Goal:** When a node escalates, Maria sees an escalation card and must respond before the pipeline continues.

**Requirements:** PRD v5.1 R5 (Human-in-the-loop approval checkpoints)

**Dependencies:** Unit 5 (trace panel)

**Files:**
- `app/app/components/canvas/EscalationCard.tsx` — inline escalation card (on canvas)
- `app/app/components/canvas/EscalationModal.tsx` — full escalation modal (from trace panel)
- `app/app/api/escalations/[escalationId]/respond/route.ts` — response API
- `app/app/components/canvas/__tests__/EscalationCard.test.tsx`

**Escalation behavior:**
- Node status changes to `escalating` (amber pulse on node border)
- Escalation card appears as a floating card near the escalating node on canvas
- Simultaneously: escalation modal opens if trace panel is open
- Pipeline PAUSES — no further tool calls until Maria responds
- Push notification sent to Maria's device

**Escalation card on canvas:**
```
┌──────────────────────────────────────────────────────────┐
│ ⚠️  [Node Name] escalated                               │
│                                                          │
│ "The lead asked about a $50K deal. This exceeds your    │
│  $10,000 approval limit."                               │
│                                                          │
│  [Approve]  [Edit & Approve]  [Cancel]                 │
└──────────────────────────────────────────────────────────┘
```
- Floating card anchored to the escalating node
- Dismissible only by responding (Cancel) or approving (Approve / Edit & Approve)
- Background canvas dims slightly

**Response API:**
```typescript
// POST /api/escalations/[escalationId]/respond
interface EscalationResponse {
  action: 'approve' | 'edit_approve' | 'cancel';
  edited_value?: object;  // if action === 'edit_approve'
}
```

**Test scenarios:**
- Escalation card appears on canvas when node escalates
- Approve resumes the pipeline
- Edit & Approve opens a form to edit the value before resuming
- Cancel stops the pipeline for this run
- Push notification sent to subscribed devices
- Duplicate escalations are deduplicated (same tag)
- Escalation card is always above other canvas elements (z-index)

**Verification:** Integration test of full escalation loop.

---

### Unit 7: Error States + Failure Visibility

**Goal:** When a node fails, show clear red status + one-line explanation. No silent failures.

**Requirements:** PRD v5.1 R7 (Reliable execution with visible failure states)

**Dependencies:** Unit 2 (node components)

**Files:**
- `app/app/components/nodes/ErrorState.tsx` — inline error display on node
- `app/app/components/nodes/NodeErrorBanner.tsx` — error banner at top of canvas
- `app/app/hooks/useNodeHealth.ts` — polling for node health status

**Error display:**
- Node border changes to `--status-error` (red)
- Error badge replaces status badge
- One-line error message shown on node: "HubSpot API rate limited" or "LLM timeout after 120s"
- Canvas-level error banner if multiple failures: "2 nodes have errors. [View →]"

**Wire error state:**
- Wire from failed node shows `--wire-error` (red)
- Downstream nodes receive `{skipped: true, reason: 'upstream_failed'}` signal
- Downstream node border turns blue with "waiting" status, tooltip: "Waiting — upstream node failed"

**Partial failure handling:**
- If Worker B fails, Worker A (upstream) completed successfully
- Team Lead can see partial output: "Worker A finished but Worker B failed"
- Maria can choose to: re-run Worker B, skip it, or fix and re-run

**Test scenarios:**
- Node with `status: error` shows red border and error message
- Error message is human-readable (not raw error code)
- Wire from errored node shows red color
- Downstream node shows "waiting" state with explanation tooltip
- Canvas error banner appears when any node has an error

**Verification:** Visual QA of all error states.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| 20+ nodes on canvas | React Flow handles virtualization; test performance at 50 nodes |
| Canvas zoom at 25% (min) | Nodes render smaller but handles still accessible |
| Node name is Unicode emoji | Render as-is; NodeHandle has min 44px touch target |
| Team Lead node accidentally deleted | Cannot delete; backend rejects delete request for team lead |
| Circular wire (A→B→A) | React Flow allows it; Team Lead reasoning catches infinite loops |
| NL interpretation fails | Show error in prompt bar: "Couldn't understand that. Try rephrasing." |
| All workers stopped | Canvas shows empty state: "Your team is resting. [Activate] or type a new goal." |

---

## Dependencies and Sequencing

```
Unit 1 (Canvas Foundation) — foundational, blocks all canvas UI
    │
Unit 2 (Node Components) — depends on Unit 1
    │
Unit 3 (Wire Connections) — depends on Unit 2
    │
Unit 4 (NL Prompt Bar + Archetype Sidebar) — depends on Unit 1
    │
Unit 5 (Reasoning Panel) — depends on Unit 2 + Durable Execution
    │
Unit 6 (Escalation UI) — depends on Unit 5
    │
Unit 7 (Error States) — depends on Unit 2
```

**Recommended parallelization:**
- Units 1, 2, 3 can be built together (canvas + nodes + wires)
- Units 4, 5, 6 are blocked by Durable Execution API (mock-able for UI work)
- Unit 7 can be built alongside Units 2–3

---

## Open Questions (Deferred to Implementation)

| Question | Why Deferred | How Resolved |
|---|---|---|
| React Flow vs custom canvas implementation? | Need to evaluate effort vs control | Default to React Flow; evaluate custom if React Flow is too limiting |
| Real-time vs polling for reasoning trace? | SSE adds server complexity | Poll at 2s intervals; upgrade to SSE in Phase 2 if latency unacceptable |
| How does Team Lead reasoning trace differ from Worker trace? | Trace granularity question | Team Lead trace shows coordination events only; worker traces show tool-level detail. Document in trace format spec. |
| NL interpretation: LLM prompt or rule-based? | Core algorithm decision | LLM-based for MVP; prompt engineering work needed. See Outstanding Questions in PRD v5.1 R1. |

---

## Success Criteria

1. Canvas loads in under 2 seconds with 10 nodes
2. Pan and zoom work smoothly (60fps) with 20 nodes
3. Adding a node via NL prompt bar updates the canvas in under 5 seconds
4. Wire colors correctly reflect node status (active/escalation/error)
5. "View Trace" shows complete step-by-step trace for any node run
6. Escalation card appears within 1 second of escalation trigger
7. All canvas text is legible and accessible (WCAG AA minimum)
8. Mobile layout: canvas replaced by list view; all actions accessible via bottom sheet

---

## Document Dependencies

| Document | Relationship |
|---|---|
| `docs/PRD.md` v5.1 | This plan implements the Visual Canvas pillar and NL-to-canvas R1 |
| `docs/design-system-v2.md` | All canvas components use design tokens from this system |
| `docs/ARCHITECTURE-05-reasoning-trace.md` | Reasoning trace format spec; referenced by Unit 5 |
| `docs/ARCHITECTURE-01-capability-registry.md` | Capability schema used by NL interpretation API |
| `docs/plans/2026-04-01-003-feat-agentos-nl-to-agent-deployment-plan.md` | NL-to-canvas deployment plan (archived v3); NL interpretation API from here |
