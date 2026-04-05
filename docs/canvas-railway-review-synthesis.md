# Canvas UI: Railway Review — Synthesis & Recommendations

**Date:** 2026-04-03
**Status:** Under Review
**Reviewed by:** 8 agents (coherence, feasibility, product-lens, scope-guardian, design-lens, security-lens, spec-flow, design-iterator)
**Document reviewed:** `docs/canvas-railway-reference.md`

---

## Executive Summary

The Railway-inspired 3-panel architecture is a **well-executed design vision** that received uniformly strong individual reviews — but the **gauntlet of 8 simultaneous reviewers** reached alarming consensus on three themes:

1. **Wrong phase** — Railway is the right canvas for Phase 2/3, not Phase 1 MVP
2. **Wrong user** — Railway's density serves developers; Maria needs simplicity
3. **Critical gap** — The NL prompt → preview → activate flow (the core AHA moment) is absent from the spec

**Verdict:** The Railway document should be **retitled to "Phase 2 Canvas Vision"** and used as a migration target. Phase 1 should ship the simpler 2-panel layout (canvas + bottom-sheet right panel) already implemented in the codebase, enhanced only with the NL Prompt Bar, Reasoning Trace, and Escalation UI.

---

## Convergence Map — What Multiple Reviewers Agreed On

| Finding | Reviewers Who Flagged It | Severity |
|---|---|---|
| 3-panel layout is scope expansion from parent plan | Feasibility, Scope Guardian, Product Lens | HIGH |
| Left panel (Team Navigator) not needed for Phase 1 (1 agent, not team) | Product Lens, Scope Guardian, Feasibility | HIGH |
| NL prompt → preview → activate flow missing (critical gap) | Spec Flow, Design Iterator | CRITICAL |
| HubSpot/Calendar in connector list — not Phase 1 MVP | Scope Guardian, Feasibility, Product Lens | HIGH |
| Right panel width conflict (480px spec vs 360px existing) | Coherence, Feasibility | MEDIUM |
| Escalation stacking (multiple simultaneous) unaddressed | Design Iterator, Feasibility, Spec Flow | HIGH |
| Dark mode tokens = YAGNI for Phase 1 | Scope Guardian | HIGH |
| Node type collision ('agent' vs TeamLeadNode/WorkerNode) | Feasibility | HIGH |

---

## Cross-Cutting Findings

### Finding 1: The Railway 3-Panel Layout Is a Scope Expansion, Not a Refinement

**Who flagged:** Feasibility, Scope Guardian, Product Lens (all HIGH confidence)

The parent canvas UI plan (`2026-04-02-001-feat-agentos-canvas-ui-plan.md`) defines:
- TopNav (not a persistent left panel)
- ArchetypeSidebar (240px, collapsible, NOT always visible)
- 2-panel layout: canvas + slide-in right panel

The Railway reference introduces:
- Persistent 280px left panel (always visible, replaces TopNav)
- 3-panel fixed layout
- Team Navigator with full tree, connectors, search

**Scope Guardian (Finding 5.1):** "This is scope expansion disguised as a design refinement."

**Feasibility (1.4):** "The Team Navigator is a net-new component set. It is not a refinement of existing code."

**Recommendation:** The 3-panel layout is the right target for Phase 2. Phase 1 should retain the parent's 2-panel layout and focus on: NL Prompt Bar, Reasoning Trace, Escalation UI.

---

### Finding 2: The NL Prompt → Preview → Activate Flow Is the Most Critical Missing Piece

**Who flagged:** Spec Flow (primary), Design Iterator (secondary)

The spec describes the NL Prompt Bar UI but is **completely silent on what happens after Maria submits**:

```
Maria types: "Hire a worker that follows up with leads who haven't replied in 7 days"
    ↓
What happens next? ← NOT SPECIFIED
    ↓
Worker node appears on canvas (somehow)
```

The PRD's stated flow is: "type goal → **preview** → activate"
The Railway spec shows: "type goal → Building... → canvas updates"
**The preview step is absent.**

This is the single most important flow for Maria's AHA moment. Without a preview, Maria cannot course-correct before the agent starts working. She may hire the wrong archetype or grant wrong permissions.

**Spec Flow (Q1):** "Without preview, Maria cannot course-correct before the agent starts working."

**Recommendation:** The NL Prompt Bar section must be rewritten to include a preview step:
1. Maria types goal
2. **Preview card appears** showing: interpreted archetype, tools, node name, wire preview
3. Maria can Edit or Approve (Activate)
4. Node appears on canvas

This matches the Railway deployment preview pattern (one of the best Railway UX patterns) and the PRD's explicit "preview → activate" language.

---

### Finding 3: Railway Is the Wrong Reference for Maria's Non-Technical Mental Model

**Who flagged:** Product Lens (primary)

Railway's users:
- Read dark terminal logs fluently
- Think in environments and deployments
- Navigate dense information hierarchies by default

Maria's mental model:
- "I hired an employee"
- "I want to see if they did their job"
- "Sometimes they need my approval"
- "Works while I sleeps"

**Product Lens:** "The Railway plan interprets 'professional-grade' as 'dark, dense, developer-tool-like.' The PRD means 'reliable, auditable, trustworthy.' These are different things."

**Product Lens inversion scenario:** "We ship the Railway 3-panel layout. Maria opens the app for the first time. She sees: a left panel she doesn't understand, an infinite canvas with dot grid she doesn't know how to use, a right panel that slides in when she clicks something accidentally. She feels like she got a developer tool instead of an AI employee."

**Recommendation:** Keep the Railway reference as visual inspiration (dark professional feel, density patterns, deployment preview) but **accept that the 3-panel layout is Phase 2 complexity**. The Phase 1 canvas should be Canva-simple: single canvas, prominent prompt bar, minimal panels.

---

## Detailed Findings by Category

### Critical Blocking Issues (must resolve before Phase 1 build)

#### C1: NL Prompt Preview Flow Missing
- **Severity:** CRITICAL
- **Reviewers:** Spec Flow, Design Iterator
- **Section:** NL Prompt Bar
- **Problem:** The submit → preview → activate step is absent. The plan shows "Building..." state but not what Maria sees before nodes appear on canvas.
- **Quote:** "The CLAUDE.md says 'preview → activate' but this document does not mention preview." — Spec Flow
- **Fix:** Add a preview step to the NL Prompt Bar section with concrete UI mockup showing the interpreted nodes + wires before activation.

#### C2: Node Type Collision with Existing Code
- **Severity:** HIGH
- **Reviewer:** Feasibility
- **Section:** Component Inventory
- **Problem:** Existing code uses `'agent'` as node type with `data.role` discrimination. The plan defines `'team-lead'` and `'worker'` as separate node types. Following the plan as written breaks the existing `InfiniteCanvas.tsx` node type registry.
- **Fix:** Specify whether to (a) refactor existing `AgentNode` into `TeamLeadNode` + `WorkerNode` with updated `nodeTypes` registry, or (b) keep single `'agent'` type with role-based rendering.

#### C3: Connector List Shows Non-MVP Integrations
- **Severity:** HIGH
- **Reviewers:** Scope Guardian, Feasibility, Product Lens
- **Section:** Left Panel, Comparison Table
- **Problem:** HubSpot and Calendar appear in the connector list and diagrams. CRM, Calendar are Phase 2 per PRD. MVP ships with Gmail only.
- **Fix:** Remove HubSpot and Calendar from all Phase 1 UI. The connector list should show only Gmail (or be empty if Gmail not yet connected).

#### C4: 3-Panel Layout Is Phase 2 Scope Expansion
- **Severity:** HIGH
- **Reviewers:** Feasibility, Scope Guardian, Product Lens
- **Section:** Overall architecture
- **Problem:** The left panel Team Navigator, the persistent 3-panel layout, and the 4-state right panel constitute a new component set. The existing codebase has a working 2-panel layout. The plan should not be labeled as Phase 1 execution.
- **Fix:** Retitle document as "Phase 2 Canvas Vision." The Phase 1 canvas enhancement should be: NL Prompt Bar + Reasoning Trace Panel + Escalation UI, on the existing 2-panel layout.

---

### High Severity Issues

#### H1: Multiple Simultaneous Escalations Not Handled
- **Severity:** HIGH
- **Reviewers:** Design Iterator (×2), Feasibility, Spec Flow
- **Section:** Escalation Behavior, Right Panel
- **Problem:** If Worker A and Worker B both escalate while Maria is reviewing a trace, what happens? The plan says escalation locks the panel but doesn't define stacking behavior.
- **Fix:** Add escalation stack UI: show count badge "2 Escalations Pending" with navigation between them.

#### H2: Dark Mode Token Architecture Is Phase 2 YAGNI
- **Severity:** HIGH
- **Reviewer:** Scope Guardian
- **Section:** Dark Theme
- **Problem:** Full dark mode CSS variable architecture is defined in the document. Phase 1 ships light mode only. This is speculative infrastructure.
- **Fix:** Remove dark mode token architecture. Keep a note: "Dark mode tokens deferred to Phase 2 design system update."

#### H3: Security — Escalation ID Enumeration Risk
- **Severity:** HIGH
- **Reviewer:** Security Lens
- **Section:** API Surface
- **Problem:** `POST /api/escalations/[escalationId]/respond` has no explicit auth verification that `escalationId` belongs to the authenticated user. Attacker could approve/cancel other tenants' escalations by enumerating IDs.
- **Fix:** Document that all escalation endpoints require `(user_id, escalation_id)` pair verification enforced by Postgres RLS.

#### H4: Security — Reasoning Traces Contain Sensitive Business Data
- **Severity:** HIGH
- **Reviewer:** Security Lens
- **Section:** Right Panel
- **Problem:** Traces show HubSpot queries, lead segmentation, draft email content. If cached client-side without encryption, XSS or shared-device scenario exposes data.
- **Fix:** Document that traces must not be cached in localStorage/sessionStorage in plain text; apply CSP headers; render from server-sent events only.

#### H5: Security — NL Prompt Injection Attack Surface
- **Severity:** MEDIUM
- **Reviewer:** Security Lens
- **Section:** NL Prompt Bar
- **Problem:** `POST /api/canvas/nl-to-canvas` processes user-provided natural language. A crafted prompt could cause the LLM interpreter to output node configurations that wire nodes to unexpected destinations.
- **Fix:** Document input sanitization requirements and sandbox LLM interpretation output before applying changes; require confirmation for destructive wirings.

#### H6: Right Panel Width Conflict (360px vs 480px)
- **Severity:** MEDIUM
- **Reviewers:** Coherence, Feasibility
- **Section:** Right Panel dimensions
- **Problem:** The spec says 480px but existing `NodeDetailPanel.tsx` uses 360px.
- **Fix:** Resolve to 480px (design decision) and update existing component CSS.

#### H7: Right Panel Post-Escalation Behavior Undefined
- **Severity:** MEDIUM
- **Reviewers:** Design Lens, Coherence
- **Section:** Right Panel
- **Problem:** After an escalation resolves, what does the panel show? Node details? Team overview? The last selected node? This blocks implementation.
- **Fix:** Define explicit post-escalation state: "Returns to the node that escalated, or team overview if no node was selected."

#### H8: Node Deletion Mechanism Absent
- **Severity:** MEDIUM
- **Reviewers:** Coherence, Spec Flow
- **Section:** Worker Node
- **Problem:** Team Lead "cannot be deleted." Worker nodes have no delete mechanism. Wires can be deleted. How does Maria remove a worker node entirely?
- **Fix:** Add worker node deletion flow (right-click → "Remove Worker" with confirmation if node has active runs).

#### H9: Right Panel Dismissal "Preserves Context" Is New UX Contract
- **Severity:** MEDIUM
- **Reviewer:** Scope Guardian
- **Section:** Right Panel behavior
- **Problem:** "Panel does NOT auto-close on canvas changes (preserves context)" is a specific UX contract not in the parent plan. What does "preserves context" mean if Maria clicks a different node?
- **Fix:** Clarify: (a) clicking a new node updates the panel to the new node, OR (b) clicking a new node shows a stale indicator on the old node. Do not leave ambiguous.

---

### Medium / Low Severity Issues

#### M1: Terminology — Three Names for Reasoning Trace Panel
- **Reviewer:** Coherence
- **Problem:** "ReasoningPanel" (typo), "Reasoning trace," "trace panel" — three terms for one component.
- **Fix:** Standardize on "Reasoning Panel" throughout.

#### M2: Chinese Comment "取决于 state" Left in Spec
- **Reviewer:** Coherence
- **Section:** Right Panel deselection
- **Problem:** Dangling Chinese comment indicating unresolved behavior at time of writing.
- **Fix:** Remove comment, replace with explicit behavior description.

#### M3: Minimap Not in Parent Plan's Unit 1
- **Reviewer:** Scope Guardian
- **Problem:** React Flow minimap listed in component inventory but not in parent's canvas foundation spec.
- **Fix:** Remove minimap from Phase 1; add to Phase 2 if proven necessary.

#### M4: Z-Index Specification Is Implementation Detail
- **Reviewer:** Scope Guardian
- **Problem:** z-index layers in implementation section belong in a component spec, not a reference architecture.
- **Fix:** Remove from reference document; add to component-level spec.

#### M5: Mobile Gesture Model Undefined (Pan vs. Tap-to-Select)
- **Reviewer:** Design Lens
- **Section:** Mobile / Responsive
- **Problem:** "Tap to select" (design system) vs. "two-finger drag to pan" (canvas) are mutually exclusive on touch devices without explicit multi-touch handling.
- **Fix:** Define explicit mobile gesture model: two-finger pan, single-tap select.

#### M6: NL Prompt Bar Keyboard Shortcut Missing Linux/Windows Equivalent
- **Reviewer:** Design Lens
- **Section:** Accessibility
- **Problem:** `Cmd+K` specified but not `Ctrl+K` for non-macOS.
- **Fix:** Add "Ctrl+K (Windows/Linux)" to the shortcut specification.

#### M7: Screen Reader Navigation for Canvas Undefined
- **Reviewer:** Design Lens
- **Section:** Accessibility
- **Problem:** "Canvas nodes announced on focus" is too vague. How do screen reader users understand wire connections?
- **Fix:** Add canvas-specific accessibility spec addressing spatial navigation.

#### M8: Connector OAuth Token Lifecycle Not Addressed
- **Reviewer:** Security Lens
- **Section:** Left Panel
- **Problem:** If a Gmail token expires, the UI shows "error" state. Does it show stack traces or token fragments?
- **Fix:** Document that connector error states display without exposing internal OAuth implementation details.

---

## Strongest Proposals from Design Iterator (Both Iterators Converged)

Two design-iterator agents ran independently and landed on the same improvements:

### P1: "Worked While You Slept" Summary (Design Iterator 1, Design Iterator 2)
Add aggregate overnight summary to Team Lead node or right panel team overview:
- "3 emails handled automatically"
- "1 escalation resolved"
- "47 tasks completed"

**Why keep:** Directly serves Maria's morning check — the AHA moment. Low implementation cost, high trust-building value.

### P2: Escalation "Break In" Animation (Design Iterator 1)
Escalation should visually interrupt with amber animation, not silently override:
- Escalation card slides in from top with breadcrumb: "Interrupted by escalation from [Agent Name]"
- Background dims to 60% opacity
- Subtle shake animation
- After resolution: breadcrumb allows return to previous context

**Why keep:** The "break in" pattern is non-negotiable for trust. Silent override loses Maria's context and feels alarming.

### P3: Escalation Priority Stack (Design Iterator 2)
Multiple simultaneous escalations shown as a stack in the right panel:
```
⚠️ 2 Escalations Pending
[1] Lead Follow-up Worker — 2 min ago
[2] Filter Worker — 30 sec ago
```

**Why keep:** Realistic scenario. Maria may have multiple agents each escalating. Missing this is a trust failure.

### P4: Wire Hover Tooltip (Design Iterator 2)
Hovering a wire shows: "Lead Research Worker sends leads to Filter Worker — 23 leads · last 2 min ago"

**Why keep:** Bridges the gap between abstract wires and Maria's mental model. Railway uses this pattern. Low cost, high clarity.

### P5: Canvas Defaults to "Team Zoom" (Design Iterator 1)
On load, canvas auto-pans/zooms to fit all nodes with comfortable padding (~80px). Never show empty canvas on return.

**Why keep:** Railway does this. Ensures Maria always sees her team on return. Low cost.

---

## Recommended Path Forward

### Phase 1 Canvas (What to Build Now)

Retain the **existing 2-panel layout** (canvas + bottom-sheet right panel) and add:

| Feature | Priority | Reason |
|---|---|---|
| NL Prompt Bar with Preview → Activate | CRITICAL | Core AHA moment. Preview step is essential. |
| Reasoning Trace Panel (streaming) | HIGH | Trust-building feature, well-specced in ARCH-05 |
| Escalation Card + Response UI | HIGH | Trust-building feature |
| "Worked While You Slept" summary | MEDIUM | Directly serves Maria's morning check |
| Escalation stacking | MEDIUM | Realistic scenario, easy to add |
| Wire hover tooltips | LOW | Nice-to-have, Railway pattern |
| Canvas "Team Zoom" on load | LOW | Polish, easy to add |

**Do NOT build in Phase 1:**
- Left panel Team Navigator (defer to Phase 2)
- 3-panel persistent layout (defer to Phase 2)
- Dark mode tokens (Phase 2)
- Minimap (Phase 2)
- Connector drag-to-canvas (Phase 2)
- Multi-canvas (Phase 2)

### Phase 2 Canvas (Railway-Inspired 3-Panel Layout)

The Railway document becomes the **Phase 2 Canvas Vision**. When Phase 2 begins:
1. Migrate from 2-panel to 3-panel layout
2. Build the Left Panel Team Navigator
3. Implement dark mode design tokens
4. Add minimap
5. Implement multi-canvas portfolio

This preserves the Railway vision without blocking Phase 1 delivery.

---

## Immediate Action Items

Before any Phase 1 canvas work begins:

- [ ] **C1 (CRITICAL):** Rewrite NL Prompt Bar section with explicit preview → activate flow and concrete UI mockup
- [ ] **C2 (HIGH):** Resolve node type strategy — refactor existing `AgentNode` or keep `'agent'` type with role discrimination
- [ ] **C3 (HIGH):** Remove HubSpot/Calendar from all Phase 1 UI; scope connector list to Gmail only
- [ ] **C4 (HIGH):** Retitle this document as "Phase 2 Canvas Vision — Railway Reference" and create new Phase 1 plan document
- [ ] **H3 (HIGH):** Document escalation API auth requirements (user_id + escalation_id pairing)
- [ ] **H4 (HIGH):** Document trace caching restrictions (server-render only, no client storage)
- [ ] **H6 (MEDIUM):** Resolve right panel width: 360px (existing) or 480px (design decision)
- [ ] **H7 (MEDIUM):** Define explicit right panel post-escalation behavior
- [ ] **H8 (MEDIUM):** Add worker node deletion flow
- [ ] **H9 (MEDIUM):** Clarify right panel dismissal behavior (auto-switch vs. stale indicator)

---

## Document Status After Review

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-03 | Initial Railway reference created |
| 2.0 | 2026-04-03 | Post-gauntlet synthesis — retitle as Phase 2 Vision |

**Next step:** Based on this synthesis, revise the scope to Phase 1 realities and produce a Phase 1 Canvas Implementation Plan that:
1. Keeps the existing 2-panel layout
2. Adds NL Prompt Bar with preview flow as the hero feature
3. Integrates Reasoning Trace + Escalation UI as the trust layer
4. Defers 3-panel/Team Navigator/dark mode to Phase 2
