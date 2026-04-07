# Spec: NL Prompt → Preview → Activate Flow

**Date:** 2026-04-03
**Status:** Draft
**Parent:** `docs/plans/2026-04-03-005-feat-agentos-phase-1-canvas-plan.md` (Unit P1)
**PRD Ref:** `docs/PRD.md` v5.1 — AHA Moment (Section "The AHA Moment"), R1 (NL-to-canvas pipeline builder)

---

## Why This Is the Most Critical Flow

The AHA moment is: "I hired an agent Monday. Tuesday I woke up to 'Agent handled 3 emails while you slept.'"

The moment Maria **hires** her agent is the conversion moment. If she can't preview what she's about to activate, she might:
- Hire the wrong archetype
- Grant wrong permissions
- Wire the agent incorrectly
- Not understand what it will do

**The preview step is not UX polish. It is the trust-building moment before the commitment.**

Railway's deployment preview (showing exactly what will be deployed before you click deploy) is the direct inspiration. The PRD says "type goal → preview → activate" — this spec fills in the missing "preview" step.

---

## User Flow: From Prompt to Active Agent

### Step 1 — Maria Types a Goal

```
┌──────────────────────────────────────────────────────────┐
│ ✦ "Hire a worker that follows up with leads who        │
│    haven't replied in 7 days..."                        │
│                                       42 chars   [↵]   │
└──────────────────────────────────────────────────────────┘
```

**Rules:**
- Submit enabled when input is non-empty (trimmed whitespace)
- Max length: 500 characters
- Placeholder text cycles through 3 examples (see Appendix A)
- Sparkle icon animates subtly while focused

**Keyboard:**
- `Enter` → submit (if valid)
- `Escape` → clear input
- `Cmd+K` / `Ctrl+K` → focus (from anywhere on canvas)

---

### Step 2 — Interpretation (Loading State)

```
┌──────────────────────────────────────────────────────────┐
│ ✦ "Hire a worker that follows up with leads who        │
│    haven't replied in 7 days..."                        │
│                              Interpreting...    [✕]     │
└──────────────────────────────────────────────────────────┘
```

**During interpretation:**
- Input is disabled
- Sparkle icon animates continuously
- "Interpreting..." text replaces character count
- Cancel button (✕) appears — clicking it aborts the API call and returns to default state

**Timeout:** 30 seconds. No error state until 30s elapses. At 15 seconds of no response, show progressive loading card (see E5).

---

### Step 3 — Preview Card Appears

**Timing:** Card slides up from the prompt bar (200ms ease-out) and floats above the canvas.

**Position:** Centered horizontally, 24px above the prompt bar. Max-width 520px.

**Design:** White card, `--radius-lg` border-radius, `--shadow-lg`, left border 4px solid `--brand-primary`.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  I'll create a Lead Follow-up Agent                         │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Reads:  [Gmail]  [Calendar]                                │
│  Does:   drafts follow-up emails, escalates if deal > $10K │
│  Schedule:  Every weekday at 9:00 AM                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │         ┌──────────┐         ┌──────────┐          │  │
│  │         │  Gmail   │────────▶│  Draft   │──────────│──┼───► [Maria]
│  │         │  Ingest  │  feeds  │  Email   │  sends   │  │
│  │         └──────────┘         └──────────┘          │  │
│  │              Ingest              Process              │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  "I'll set up a lead follow-up pipeline. First, I'll read  │
│   your Gmail for recent leads. Then I'll filter for those   │
│   who haven't replied in 7+ days and draft personalized   │
│   follow-ups. I'll send the drafts to you for approval     │
│   before anything goes out."                              │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  [Edit & Activate]                          [Cancel]        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## What the Preview Shows

### Section 1: Plain English Summary (Required)

The LLM's interpretation of what it will build, in 2-3 sentences of plain English. Maria should understand:
- What the agent will do
- When it will run
- What it will escalate and why

**Format:**
```
"I'll set up a lead follow-up pipeline. First, I'll read your
Gmail for recent leads. Then I'll filter for those who haven't
replied in 7+ days and draft personalized follow-ups. I'll send
the drafts to you for approval before anything goes out."
```

**If the LLM is uncertain:** "I think you want a worker that checks Gmail for unanswered leads and drafts follow-ups. Here's what I'd set up — you can adjust before activating."

**If the goal is unclear:** Show a different error state (see Edge Cases).

### Section 2: Node + Wire Preview (Visual)

A **mini canvas** showing the nodes that will be created and how they'll be wired.

**Node rendering:**
- Simplified node cards (120px wide, no handles)
- Archetype color coded (Ingest: sky blue, Process: amber, Distill: emerald)
- Node name below card
- Wire arrows between nodes

**Wire labels:**
- `reads` — Ingest reads from a source
- `feeds` — output flows to next node
- `escalates to` — sends to Maria for approval
- `sends` — final output to Maria

**Maria can hover over any node in the preview** to see a tooltip with details:
```
Lead Research (Ingest)
Gmail: reads unread emails from today
Schedule: Every weekday at 9:00 AM
Escalates: never (low-risk task)
```

### Section 3: Agent Configuration (Editable Before Activation)

Maria can edit key settings before activating. These appear as a compact form below the preview diagram:

| Field | Type | Default | Editable? |
|---|---|---|---|
| Schedule | Select | Infer from goal | Yes — dropdown: "Every weekday", "Daily", "Hourly", "When triggered" |
| Escalation threshold | Currency | Infer from goal | Yes — "Escalate if deal > $X" |
| Approval required | Toggle | Based on escalation | Yes — "Send drafts to me for approval" |
| Tools | Checkboxes | Infer from goal | Yes — Gmail, Calendar, etc. |
| Name | Text | Auto-generated | Yes |

**If Maria changes a setting:** The preview diagram updates in real-time (debounced 300ms) to reflect the change.

---

## Step 4 — Edit & Activate or Cancel

### Edit & Activate

**Click "Edit & Activate":**
1. If no changes made → immediately activate
2. If changes made → update preview to reflect changes → 500ms delay → then activate
3. Nodes appear on canvas with spring animation (`scale: 0.9→1, opacity: 0→1, 250ms`)
4. Wires animate in (draw from source to target, 400ms)
5. Prompt bar resets to placeholder
6. Brief success toast: "Lead Follow-up Agent is now active"

**Button state:**
- Default: Primary button, "Edit & Activate"
- If no changes: "Activate" (cleaner, no "edit" since nothing changed)
- If changes pending: "Update & Activate"

### Cancel

**Click "Cancel":**
- Preview card slides down and fades out (150ms)
- Prompt bar returns to default state with input cleared
- No nodes created, no API state changed

**Keyboard:**
- `Escape` → cancel (same as clicking Cancel)
- `Enter` → activate (if valid)

---

## NL Interpretation API

### Request

```typescript
interface NLToCanvasRequest {
  goal: string                          // Maria's natural language goal
  existingNodes: CanvasNode[]           // Current canvas nodes (for context)
  existingEdges: Edge[]                 // Current wires (for context)
  availableConnectors: Connector[]       // Connected tools Maria has (Gmail, etc.)
}
```

### Response

```typescript
interface NLToCanvasResponse {
  // What nodes to create
  nodesToAdd: Array<{
    name: string                        // Auto-generated or inferred from goal
    role: 'Team Lead' | 'Worker'
    archetype: 'Ingest' | 'Process' | 'Distill'
    tools: string[]                     // Gmail, Calendar, LLM, etc.
    schedule: string                    // "Every weekday at 9:00 AM"
    escalationThreshold?: number         // Dollar amount
    approvalRequired: boolean
    position?: { x: number; y: number } // Inferred from existing graph
  }>

  // How to wire them
  edgesToAdd: Array<{
    source: string                     // Node name (resolved to ID after creation)
    target: string                     // Node name
    label: 'reads' | 'feeds' | 'sends' | 'escalates to'
  }>

  // Plain English explanation
  explanation: string                  // 2-3 sentences describing what will be built

  // Confidence
  confidence: number                   // 0-1, determines whether to show "I think..." vs "I'll..."
  ambiguousFields: string[]             // Which fields Maria should review/edit
}
```

### Error Responses

| HTTP Status | Meaning | UI Response |
|---|---|---|
| 200 | Success | Show preview card |
| 200 + `confidence < 0.5` | Low confidence interpretation | Show preview with "I think..." prefix and ambiguous fields highlighted |
| 400 | Goal unclear / cannot interpret | "I couldn't figure out what you want. Try describing the task differently — for example: 'check my Gmail every morning and flag urgent emails.'" |
| 400 + `nodesToAdd.length === 0` | Goal valid but no action needed | "That task is already handled by your existing team. [View on canvas →]" |
| 500 | Server error | "Something went wrong. Please try again." |

---

## Edge Cases

### E1: Empty or Whitespace Input

- Submit button disabled when input is empty or whitespace-only
- Character count shows `0` in this case

### E2: Goal Is Already Handled by Existing Agent

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ✓ That task is already being handled                        │
│                                                              │
│  Your "Lead Follow-up Agent" (Worker 2) already follows up │
│  with leads who haven't replied in 7 days.                  │
│                                                              │
│                                    [View on Canvas]  [Cancel] │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Behavior:** Show success-style card with teal checkmark, no node creation, prompt bar returns to default.

### E3: Goal Requires a Tool Not Available in Phase 1

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ⚠️  That tool isn't available yet                          │
│                                                              │
│  Gmail is the only integration in Phase 1.                   │
│  HubSpot, Calendar, and more are coming in Phase 2.         │
│                                                              │
│  Try describing the task with Gmail instead:                  │
│  "check my Gmail for unread emails and..."                  │
│                                                              │
│                                     [Try a different goal]  [Cancel] │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Phase 1 only:** Gmail is the sole available connector. Goals requiring HubSpot, Calendar, or any non-Gmail tool return this error. "Connect [Tool] →" is Phase 2 behavior.

### E4: Goal Is Ambiguous (Low Confidence)

**Rule: Always make a best-effort guess first. Only show explicit disambiguation if the ambiguity is genuinely unresolvable.**

**Default behavior (best-effort):** Show the preview card with the LLM's top interpretation, but with a subtle confirmation prompt:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  I'll create a Gmail Follow-up Worker                       │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Reads:  [Gmail]                                          │
│  Does:   drafts follow-up emails for unanswered outreach    │
│  Schedule:  Every weekday at 9:00 AM                       │
│                                                              │
│  [Preview diagram...]                                       │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Was this right?                               [Yes, Activate] │
│  [Adjust settings]                        [Cancel]              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Only show explicit disambiguation** if the LLM returns `confidence < 0.3` AND `ambiguousFields.length > 1` (genuinely cannot decide):

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  🤔  I'm not sure I understood correctly                    │
│                                                              │
│  "Lead follow-up" could mean a few different things:        │
│                                                              │
│  A) Email people who haven't replied to my outreach        │
│  B) Flag leads that need follow-up in my CRM               │
│  C) Send a reminder to myself to follow up manually        │
│                                                              │
│  [Choose A, B, or C — then Activate]                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Threshold:** confidence < 0.3 AND multiple major ambiguous fields → explicit disambiguation. confidence 0.3–0.5 → best-effort with "Was this right?" confirmation. confidence > 0.5 → standard preview, no confirmation prompt.

### E5: Interpretation Taking Longer Than Expected

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ⏱️  Still working on it...                                 │
│                                                              │
│  Your goal is a bit complex. Still interpreting —         │
│  this usually takes about 15–20 seconds.                    │
│                                                              │
│                                         [Keep Waiting]  [Cancel] │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**At 15 seconds:** Show this progressive loading card.
**At 30 seconds:** Auto-fail with: "That one was tricky. Try a shorter description or break it into smaller steps."

### E6: Auto-Corrected Wiring

If the NL interpretation creates a cycle or invalid wiring, the LLM backend silently corrects it and shows the adjusted preview without alarming Maria:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  I'll create a Gmail Follow-up Worker                       │
│                                                              │
│  (adjusted wiring shown in preview — no alert shown)         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Rule: Never show Maria a "I fixed something" warning when the fix is invisible and correct.** Only surface a wiring concern if the auto-correction materially changes what the agent will do (e.g., removes a node she explicitly named, or changes a wire from "feeds" to "escalates to"). In that case, highlight the changed element in the preview with amber text: "Adjusted: [old] → [new]".

---

## Prompt Bar States Summary

| State | Visual | Interaction |
|---|---|---|
| Default | Placeholder + sparkle icon | Focus on click or Cmd+K |
| Typing | Input with character count | Enter to submit, Escape to clear |
| Submitting | "Interpreting..." + cancel button | Cancel to abort |
| Preview shown | Preview card above bar | Edit & Activate / Cancel / click outside |
| Low confidence | Preview card with "🤔 I'm not sure..." | Disambiguation options |
| Tool not connected | Warning card | Connect tool / Cancel |
| Error | Error message below bar | Retry / Cancel |
| Success | Toast notification | Auto-dismiss after 4s |

---

## Appendix A: Placeholder Text (Rotating)

Cycle through these 3 examples every 24 hours or on page refresh:

1. `"Hire a worker that follows up with leads who haven't replied in 7 days..."`
2. `"Create a worker that reads my Gmail every morning and flags urgent emails..."`
3. `"Set up a research agent that pulls weekly reports from HubSpot..."`

---

## Appendix B: LLM Interpretation Prompt (Internal Reference)

```
You are a team composition interpreter for AgentOS.

Given a user's natural language goal and the current state of their
team canvas, you must decide:
1. Whether to create new nodes (workers) or modify existing ones
2. What archetype each worker should be (Ingest / Process / Distill)
3. What tools each worker should have access to
4. How workers should be wired together
5. What the escalation threshold should be

Rules:
- Always prefer to modify existing workers before creating new ones
- Only create new workers if the goal cannot be served by existing nodes
- Always include an escalation path if the task involves sending emails externally
- If the goal is ambiguous, respond with confidence < 0.5 and list disambiguation options
- Never create cycles in the wire graph
- Infer the schedule from the goal ("every morning" → weekdays at 9am)

Output format: NLToCanvasResponse (see type definition in spec)
```

---

## Appendix C: Animation Specifications

| Animation | Duration | Easing | Trigger |
|---|---|---|---|
| Preview card slide up | 200ms | ease-out | API returns 200 |
| Preview card slide down | 150ms | ease-in | Cancel or outside click |
| Node appear (spring) | 250ms | cubic-bezier(0.34, 1.56, 0.64, 1) | "Activate" clicked |
| Wire draw-in | 400ms | ease-out | Node appears on canvas |
| Toast fade in | 150ms | ease-out | Success state |
| Toast fade out | 150ms | ease-in | After 4s |

---

## Open Questions

| Question | Why Unresolved | Resolution Path |
|---|---|---|
| ~~Who owns the LLM interpretation server?~~ | ~~Cloudflare Workers vs. Next.js API route~~ | **RESOLVED: Cloudflare Workers + AI Gateway** (see below) |

### NL Interpretation Server: Cloudflare Workers + AI Gateway

**Decision:** 2026-04-05 — Invest in Cloudflare Workers path.

**Rationale:**
- Near-zero cold starts (V8 isolates vs Vercel's 500ms-2s cold starts)
- AI Gateway built-in: prompt caching + semantic deduplication reduces LLM costs
- Stateless workload (NL → nodes/edges) is the perfect Workers use case
- Global edge distribution — Maria's requests route to nearest Workers location

**Architecture:**
```
Maria types goal
      ↓
POST to /api/canvas/nl-to-canvas (Vercel Next.js frontend)
      ↓
Vercel routes to Cloudflare Worker (AI Gateway in front)
      ↓
Cloudflare Worker:
  1. Validates input (sanitize, length check)
  2. Assembles NL interpretation prompt
  3. Calls Claude via AI Gateway (cached where possible)
  4. Returns NLToCanvasResponse (nodesToAdd, edgesToAdd, explanation)
      ↓
Preview card appears on canvas
```

**Key technical considerations:**
- AI Gateway prompt caching: similar goals ("follow up with leads", "check Gmail every morning") may hit cache
- Hyperdrive for Postgres access: verify per-tenant RLS works through Workers + Hyperdrive connection pooler
- Workers run at edge: NL interpretation must be fast (<5s target for simple goals)
- Fallback: if Workers unavailable, Next.js API route as degraded-mode fallback

**Files to create:**
- `workers/nl-interpret/index.ts` — main Worker entry
- `workers/nl-interpret/prompt.ts` — NL interpretation prompt template
- `workers/nl-interpret/schema.ts` — Zod schemas for request/response
- `workers/wrangler.toml` — Workers config
- `app/lib/nl-interpret-client.ts` — client in Next.js app

**Not in scope for this doc:**
- Hyperdrive configuration for per-tenant Postgres
- AI Gateway prompt cache key strategy
- Fallback retry logic to Next.js route
| Can Maria name the agent before activating? | Currently yes (Name field in config) | Confirm if naming is MVP scope |
| What if the preview shows 5+ nodes? | May not fit in preview diagram | Scroll within preview diagram, or cap at 4 nodes |
| How does the Team Lead auto-wire to new workers? | Team Lead should "own" new workers | Team Lead is always source of the first wire |
