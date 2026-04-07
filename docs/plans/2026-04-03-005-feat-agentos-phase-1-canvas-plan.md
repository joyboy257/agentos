# Plan: Phase 1 Canvas — MVP Implementation

**Date:** 2026-04-03
**Type:** feat
**Status:** Draft
**Parent:** `docs/plans/2026-04-02-001-feat-agentos-canvas-ui-plan.md`
**PRD Ref:** `docs/PRD.md` v5.1 — Visual Canvas (Pillar 1)
**Railway Ref:** `docs/canvas-railway-reference.md` (retired — deferred to Phase 2)

---

## What Changed and Why

The Railway-inspired 3-panel architecture (`canvas-railway-reference.md`) was reviewed by 8 agents. The consensus:

- **Railway is Phase 2, not Phase 1.** The 3-panel layout, Team Navigator left panel, dark mode, and minimap are Phase 2 complexity being proposed as Phase 1 scope.
- **Phase 1 MVP uses the 2-panel layout already built** — React Flow canvas + slide-in right panel.
- **The critical missing piece is the NL Prompt → Preview → Activate flow.** The Railway spec had the prompt bar UI but skipped the preview step entirely.

This plan specifies what to build for Phase 1: the existing 2-panel layout, enhanced with NL Prompt Bar, Reasoning Trace, Escalation UI, and the surviving Railway patterns.

---

## What Exists vs. What Is New

### Already Built (existing codebase)

| Component | Location | What it does |
|---|---|---|
| `InfiniteCanvas.tsx` | `app/app/components/canvas/` | React Flow canvas, dot grid, fitView, Controls |
| `AgentNode.tsx` | `app/app/components/canvas/` | Node component — role-based (Team Lead: purple, Worker: indigo), archetype badges, status dots |
| `LabeledEdge.tsx` | `app/app/components/canvas/` | Bezier edges with labels ("triggers", "feeds") |
| `CanvasProvider.tsx` | `app/app/components/canvas/` | Canvas state, `'agent'` node type, initial nodes/edges |
| `NodeDetailPanel.tsx` | `app/app/components/canvas/` | 360px right panel, shows node details when node selected, null when nothing selected |
| `GET /api/runs/[runId]/events` | `app/app/api/` | SSE endpoint for reasoning trace events (streaming) |
| `POST /api/escalation-suggestions` | `app/app/api/` | Resolve escalation suggestion |
| `escalation_suggestions` table | `004_escalation_suggestions.sql` | Migration exists |

### What Phase 1 Adds

| Feature | Priority | Files to create/modify |
|---|---|---|
| NL Prompt Bar + Preview → Activate | CRITICAL | `NLPromptBar.tsx`, `useNLToCanvas.ts`, `api/canvas/nl-to-canvas/route.ts` |
| NodeDetailPanel → multi-state panel (details + trace + escalation + overview) | HIGH | `NodeDetailPanel.tsx` (refactor) |
| Escalation Card UI (on-canvas) | HIGH | `EscalationCard.tsx`, extend `PUT /api/approvals/[approvalId]` |
| Wire hover tooltips | MEDIUM | `LabeledEdge.tsx` (enhance) |
| Canvas auto-fit on load (Team Zoom) | MEDIUM | `InfiniteCanvas.tsx` (already has fitView) |
| Team Lead overview state (today's stats) | MEDIUM | `NodeDetailPanel.tsx` (Team Lead overview state — overnight summary deferred to Phase 2) |

---

## Phase 1 Scope: Units of Work

### Unit P1: NL Prompt Bar + Preview → Activate (CRITICAL)

**This is the AHA moment bottleneck.** Without a preview, Maria cannot course-correct before the agent starts working.

**File:** `app/app/components/canvas/NLPromptBar.tsx` (new)
**File:** `app/app/hooks/useNLToCanvas.ts` (new)
**File:** `app/app/api/canvas/nl-to-canvas/route.ts` (new)

**Flow:**

```
Maria types in prompt bar:
┌──────────────────────────────────────────────────────────┐
│ ✦ "Hire a worker that reads my Gmail every morning      │
│    and drafts follow-ups for emails I haven't replied"  │
│                                       68 chars   [↵]  │
└──────────────────────────────────────────────────────────┘
                        ↓ Enter
              ┌─────────────────────────────────────────┐
              │  Preview Card (slides up, above bar)      │
              │                                          │
              │  "I'll create a Gmail Follow-up Worker"  │
              │                                          │
              │  Archetype: Process                     │
              │  Reads: Gmail                            │
              │  Does: drafts follow-up emails, escalates │
              │         if deal > $10K                   │
              │                                          │
              │  ┌──────────┐  ┌──────────┐             │
              │  │ Gmail    │──│ Draft   │             │
              │  │ Ingest   │  │ Email   │             │
              │  └──────────┘  └──────────┘             │
              │                                          │
              │  [Edit & Activate]  [Cancel]            │
              └─────────────────────────────────────────┘
                        ↓ "Activate"
        Agent is scheduled (not immediately run)
        Node appears on canvas with spring animation
        Prompt bar resets to placeholder
```

**Important — activation = scheduling, not immediate execution:**
Clicking "Activate" schedules the agent to run at its configured time (or on next trigger). The agent does NOT start running the moment Maria clicks Activate. If no schedule is set, the agent waits for an event trigger. This matters because the "worked while you slept" experience requires a schedule to be set — if Maria activates without setting a schedule, nothing happens until a trigger fires.

**NL → Canvas API contract:**

```typescript
// POST /api/canvas/nl-to-canvas
interface NLToCanvasRequest {
  goal: string                          // Maria's natural language goal
  existingNodes: CanvasNode[]           // Current canvas state (for context)
}

interface NLToCanvasResponse {
  nodesToAdd: Partial<CanvasNode>[]    // New nodes to create
  edgesToAdd: Partial<Edge>[]           // Connections to make
  workerConfigs: Record<string, WorkerConfig>  // Per-node config
  explanation: string                   // Plain English: "I'll add a HubSpot
                                        // ingest worker to read leads, a filter
                                        // worker to find unresponsive ones,
                                        // and a Gmail worker to send drafts."
}
```

**States:**
- Default: placeholder, subtle border
- Focus: `--shadow-focus`, border `--border-focus`
- Loading: sparkle animates, "Interpreting..." text, input disabled
- Preview shown: card slides up from bar, showing node/wire preview
- Error: red border, "Couldn't understand that. Try rephrasing."

**Keyboard:** `Cmd+K` / `Ctrl+K` focuses from anywhere. Escape closes preview.

**Design token alignment:** Use existing design system tokens from `design-system-v2.md`.

---

### Unit P2: NodeDetailPanel → Multi-State Context Panel

**The existing `NodeDetailPanel` is node-detail-only.** Phase 1 transforms it into a 4-state context panel.

**File:** `app/app/components/canvas/NodeDetailPanel.tsx` (refactor)

**4 States (priority order):**

| Priority | State | Trigger | Content |
|---|---|---|---|
| 1 | Escalation active | `status: 'escalating'` on any node | Escalation card (see Unit P3) |
| 2 | Reasoning trace | "View Trace" button clicked | Step-by-step trace (see Unit P3) |
| 3 | Node selected | Click any node | Node details (current behavior, enhanced) |
| 4 | Nothing selected | No node selected, no escalation | **Team Lead "overview" state** |

**New Team Lead overview state (replaces current "return null"):**

```
┌─────────────────────────────────────────┐
│  ✦ Your Team                           │
│  ─────────────────────────────────────  │
│  👑 Maria's Research Lead    ● Running  │
│     Coordinating 3 workers              │
│                                         │
│  Today:                               │
│  ✦ 3 emails processed                  │
│  ✦ 0 escalations pending               │
│  ✦ 47 tasks completed                   │
│                                         │
│  Next scheduled run: 9:00 AM tomorrow   │
└─────────────────────────────────────────┘
```

**Data source:** The stats above come from aggregating the `runs` table and `escalation_suggestions` table for the Team Lead's agents. A lightweight query at panel open is acceptable: `SELECT COUNT(*) FROM runs WHERE agent_id IN (...) AND completed_at > today`. For Phase 1, this can be a simple polling query (every 30s). Overnight/"while you slept" summary requires a time-range filter and is deferred to Phase 2 unless a lightweight aggregation query can be proven to perform at scale.

**"View Trace" button:** Add to `AgentNode.tsx` footer, and to `NodeDetailPanel.tsx` when a node is selected.

**Existing "View Run History" button** in `NodeDetailPanel.tsx:302` becomes "View Trace" — the existing button label is misleading (traces are real-time reasoning, not historical runs).

---

### Unit P3: Escalation Card + Response UI

**When a node escalates, Maria must respond before the pipeline continues.**

**Files:**
- `app/app/components/canvas/EscalationCard.tsx` (new) — on-canvas floating card
- Extend existing `PUT /api/approvals/[approvalId]/route.ts` — do NOT create a new endpoint

**Escalation API:**

```typescript
// POST /api/escalations/[escalationId]/respond
interface EscalationRespondRequest {
  runId: string
  decision: 'approved' | 'edited' | 'cancelled'
  revisedValue?: Record<string, unknown>  // if decision === 'edited'
  reason?: string
}
```

**Escalation ID enumeration fix (from security review):** The `PUT /api/approvals/[approvalId]` endpoint (extended, not new) MUST verify `(user_id, escalation_id)` pairing. The existing TODO at line 52 of `approvals/[approvalId]/route.ts` must be closed before shipping. See `docs/plans/2026-04-03-007-security-escalation-api-fix.md` for the correct RLS pattern — note that serverless Postgres connection pooling requires per-query `user_id` filtering, not session-level `SET`.

**On-canvas escalation card:**

```
┌────────────────────────────────────────────────────────────┐
│  ⚠️  Lead Follow-up Worker — needs your input            │
│                                                            │
│  "The lead asked about a $50K deal. This exceeds your    │
│   $10,000 approval limit."                               │
│                                                            │
│  What the agent plans to do:                               │
│  • Draft reply using "Enterprise Response v1"             │
│  • Send to ceo@acme.com                                   │
│                                                            │
│  [Approve & Send]  [Edit & Approve]  [Cancel]           │
└────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Floating card anchored near the escalating node (not blocking canvas)
- Background dims to `--bg-overlay`
- Cannot dismiss without action (Cancel = cancel escalation)
- Panel locks to escalation state (highest priority)

**Multiple simultaneous escalations:** If multiple workers escalate, show a stack:
```
⚠️ 2 Escalations Pending
[1] Lead Follow-up Worker — 2 min ago  ← currently shown
[2] Filter Worker — 30 sec ago         ← accessible via "Next" or scroll
```

---

### Unit P4: Wire Hover Tooltips (Railway Pattern)

**Wires are abstract for Maria. Hovering reveals what data flows.**

**File:** `app/app/components/canvas/LabeledEdge.tsx` (enhance)

**Current behavior:** Wire with label ("triggers", "feeds") rendered on the bezier curve.

**Enhanced behavior:**

```
Idle wire (default):
═══════════════════

Wire hovered (200ms delay):
═══════════════════
         ┌─────────────────────────────────┐
         │ "Lead Research Worker"           │
         │ sends leads to                   │
         │ "Filter Worker"                 │
         │ 23 leads · last 2 min ago       │
         └─────────────────────────────────┘

Active wire (data flowing):
Animated dashes (CSS stroke-dashoffset) + same tooltip
```

**Implementation:** Add `onMouseEnter`/`onMouseLeave` to `BaseEdge`, show tooltip via `EdgeLabelRenderer`. Delay hover trigger by 200ms to avoid flicker on fast passes.

---

### Unit P5: Canvas Auto-Fit (Team Zoom)

**Maria should never see an empty canvas on load.**

**File:** `app/app/components/canvas/InfiniteCanvas.tsx` (already has `fitView`)

**Current:** `fitView` with `padding: 0.2` — already fits all nodes on load.

**Enhancement:** Add a "Fit to view" button (Railway style) floating bottom-right, next to zoom controls:

```
Current Controls (bottom-right):
[＋] [－] [⊙]

Enhanced:
[＋] [－] [⊙] [⊡]  ← fit-to-view button
```

Use Lucide `Maximize2` icon. Trigger `fitView()` with animation.

---

## Implementation Units (Priority Order)

```
P1 (CRITICAL): NL Prompt Bar + Preview → Activate
    ↓
P3 (HIGH):      Escalation Card + Response UI (needs escalation API hook)
    ↓
P2 (HIGH):      NodeDetailPanel → Multi-State Panel (integrates P3 escalation
                state and existing trace state — cannot build before P3)
P4 (MEDIUM):    Wire Hover Tooltips (independent — can build in parallel with P2)
P5 (MEDIUM):    Canvas Auto-Fit (independent — can build in parallel with P2)
```

**Note:** P2 depends on P3. P3 and P2 do NOT have circular dependency — P2's "escalation active" state is defined by the escalation card that P3 builds. Build P3 first.

---

## What Is NOT in Phase 1 Canvas

| Feature | Reason | Phase |
|---|---|---|
| Left Panel Team Navigator (3-panel layout) | Phase 2 complexity, not needed for MVP | Phase 2 |
| Dark mode tokens | Phase 2 | Phase 2 |
| Minimap | Phase 2 | Phase 2 |
| Connector drag-to-canvas | NL prompt serves this | Phase 2 |
| Multi-canvas portfolio | Phase 2 | Phase 2 |
| Archetype sidebar | Phase 2 | Phase 2 |
| Agent-to-agent handoff animations | Nice-to-have | Post-MVP |

---

## Node Type Strategy

**Decision: Keep single `'agent'` node type with role-based rendering.**

The existing codebase uses a single `AgentNode` component with `data.role === 'Team Lead' | 'Worker'` discrimination. The Railway reference proposed splitting into `TeamLeadNode` and `WorkerNode` as separate node types. After feasibility review, **keep the single type** because:

- The role discrimination already works correctly
- Splitting requires updating the `nodeTypes` registry and existing canvas state
- The visual distinction (purple border vs indigo border, different dimensions) is already implemented via `roleColors` and `isTeamLead` checks

The NodeDetailPanel and AgentNode should continue using `data.role` for discrimination.

---

## Responsive Behavior

| Breakpoint | Canvas Behavior |
|---|---|
| < 640px | Canvas replaced by list view; touch-friendly node cards; bottom sheet for node details |
| 640–1024px | Full canvas, Controls visible, panel at 360px |
| > 1024px | Full canvas, Controls visible, panel at 360px |

**Note:** Full 3-panel layout (280px left + flexible canvas + 480px right) is Phase 2. Phase 1 retains the current 2-panel layout.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| NL prompt with empty/whitespace input | Disable submit; no API call |
| NL interpretation fails | Show error state in prompt bar: "Couldn't understand that. Try rephrasing." |
| NL returns 0 nodes | Show: "I couldn't find a way to do that. Try describing the task differently." |
| Node deleted while right panel open | Close panel immediately |
| Multiple simultaneous escalations | Escalation stack in panel, count badge on panel tab |
| Escalation fires while viewing trace | Escalation takes priority (panel content replaced with escalation card) |
| Canvas empty on first load | Show empty state with prompt bar: "What do you want your team to do?" |
| Node dragged off visible area | fitView button restores view; no special handling needed |

---

## Dependencies

| Dependency | Status | Owner |
|---|---|---|
| `POST /api/canvas/nl-to-canvas` (NL interpretation) | Does not exist — **hard blocker** | Backend |
| Extend `PUT /api/approvals/[approvalId]` with escalation ownership check | Exists — TODO at line 52 must be closed | Backend |
| SSE reasoning trace endpoint `GET /api/runs/[runId]/events` | Exists — verify streaming + `Cache-Control: no-cache` header | Backend |
| `escalation_suggestions` table + RLS | Migration exists — **verify RLS enforced on all queries** | Backend |
| Team Lead stats aggregation query | Does not exist — lightweight query acceptable for Phase 1; overnight summary deferred | Backend |

---

## Security Requirements (from review)

1. **Escalation API auth:** `POST /api/escalations/[escalationId]/respond` must verify `(user_id, escalation_id)` pairing. Enforce via Postgres RLS: `current_setting('app.current_user_id')` must match the escalation's `user_id`.

2. **Trace data:** Reasoning traces contain sensitive business data (HubSpot queries, lead segmentation, draft emails). Traces must NOT be cached in `localStorage` or `sessionStorage` in plain text. Render from SSE stream only. Apply CSP headers to prevent XSS.

3. **NL prompt injection:** `POST /api/canvas/nl-to-canvas` must sanitize LLM interpretation output before applying canvas mutations. Require confirmation step (the preview card) before destructive wirings are created.

---

## Success Criteria

1. Maria can type a goal in the NL Prompt Bar and see a preview before any node is created
2. Approving the preview creates the correct nodes and wires on the canvas
3. Clicking any node opens the right panel with node details
4. Clicking "View Trace" shows the streaming reasoning trace in the right panel
5. When a node escalates, an escalation card appears and the panel shows escalation UI
6. Multiple escalations can be navigated as a stack
7. Wire hover shows tooltip with flow description
8. Canvas fits all nodes on load (no empty space visible)
9. "Team Lead overview" state shows overnight summary when no node is selected
10. All text is legible at WCAG AA minimum (4.5:1 contrast)

---

## Document Dependencies

| Document | Relationship |
|---|---|
| `docs/plans/2026-04-02-001-feat-agentos-canvas-ui-plan.md` | Parent plan — this plan supersedes Unit 4 (NL Prompt Bar) and refines Units 1, 2, 3 |
| `docs/design-system-v2.md` | Design tokens — all canvas components use these |
| `docs/ARCHITECTURE-05-reasoning-trace.md` | Reasoning trace format spec — SSE endpoint exists |
| `docs/PRD.md` v5.1 | Product requirements — AHA moment, Maria persona |
| `docs/canvas-railway-reference.md` | Superseded — deferred to Phase 2 as "Phase 2 Canvas Vision" |
| `docs/canvas-railway-review-synthesis.md` | 8-agent review synthesis — all findings consolidated here |

---

## Changelog

| Date | Version | Changes |
|---|---|---|
| 2026-04-03 | 1.0 | Initial Phase 1 plan — 2-panel layout, NL Prompt + Preview, Multi-state panel, Escalation UI, Railway patterns retained |
