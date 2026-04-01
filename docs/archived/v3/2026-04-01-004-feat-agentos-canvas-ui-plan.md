# Plan: Canvas UI

**Date:** 2026-04-01
**Type:** feat
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v4 — Pillar 2: Visual Agent Harness; MVP Features 1, 3, 6, 7, 9

---

## Goal

Build the visual canvas that is the primary interface for Maria — the "org chart for her AI team." Every agent is a card with live status. Reasoning traces are visible in real time. Memory state is inspectable. Escalations surface prominently.

This is the screen Maria sees when she logs in. It must feel like a professional operations dashboard, not a developer tool.

---

## Problem Frame

The canvas serves three simultaneous needs:

1. **Situational awareness** — "What is my team doing right now?"
2. **Agent management** — "I want to hire a new agent, edit one, or fire one"
3. **Trust building** — "Show me exactly why this agent escalated this email"

The existing canvas concept (org chart + agent cards + real-time reasoning) is correct. This plan specifies the implementation.

---

## Requirements Traceability

| Requirement | Source |
|---|---|
| Visual Agent Harness | PRD v4 — Pillar 2 |
| Org chart canvas with live status | PRD v4 — MVP Feature 1 |
| Real-time reasoning traces | PRD v4 — MVP Feature 3 |
| Agent cards with activity log | PRD v4 — MVP Feature 9 |
| Escalation modal | PRD v4 — MVP Feature 7 |
| Magic link auth | PRD v4 — MVP Feature 10 |

---

## Non-Goals

- Multi-agent team graph layout with dragging connections (Phase 3)
- Public/private agent sharing (Phase 3)
- Agent-to-agent handoff animations (Phase 3)
- Terminal/CLI view for agents (never — Maria doesn't see a terminal)

---

## High-Level Design

### Canvas Screen Anatomy

```
┌──────────────────────────────────────────────────────────────────────┐
│  AgentOS  [🔍 Search agents...]      [+ Hire Agent]  [👤 Maria ▾] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ 📧 Email     │  │ 📅 Calendar  │  │ 🔍 Research │               │
│  │ Agent        │  │ Agent        │  │ Agent        │               │
│  │              │  │              │  │              │               │
│  │ 🟢 Running   │  │ 🟡 Scheduled │  │ 🔴 Stopped   │               │
│  │              │  │              │  │              │               │
│  │ 47 msgs     │  │ 12 events    │  │ —           │               │
│  │ 4 escalated │  │ this week   │  │              │               │
│  │              │  │              │  │              │               │
│  │ [View →]    │  │ [View →]    │  │ [View →]    │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                       │
│  ┌────────────────────────────────────────────┐                     │
│  │  📊 Activity — Last 24 hours               │                     │
│  │                                            │                     │
│  │  10:32am  Email Agent escalated 1 email   │                     │
│  │  10:15am  Research Agent found 3 leads   │                     │
│  │  9:47am   Email Agent handled 12 emails   │                     │
│  │  9:00am   Calendar Agent sent 4 invites   │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Agent Card Anatomy

```
┌─────────────────────────────────────┐
│  [Icon]  Email Agent      [⋮ ▾]   │
│  ─────────────────────────────────  │
│                                    │
│  Status: 🟢 Running                │
│  Since: 2 hours ago                │
│                                    │
│  Memory: 🧠 127 facts stored        │
│  Today's work:                    │
│  • 23 emails read                  │
│  • 8 sent                          │
│  • 3 escalated to you              │
│                                    │
│  [View Reasoning] [Edit] [Stop]   │
└─────────────────────────────────────┘
```

### Real-Time Reasoning Trace (Expandable Panel)

When Maria clicks "View Reasoning":

```
┌─────────────────────────────────────────────┐
│  Email Agent — Reasoning Trace             │
│  ─────────────────────────────────────────  │
│                                             │
│  🟢 10:32:04 — Tool: read_email            │
│     Input: { count: 5, filter: "unread" }  │
│                                             │
│  🟢 10:32:05 — Tool: send_email (DRAFT)    │
│     To: lead@company.com                    │
│     Subject: Re: Pricing for 500 units     │
│     Body: "Hi John, thanks for reaching..." │
│                                             │
│  ⚠️ 10:32:06 — ESCALATE                    │
│     Confidence: 0.31                        │
│     Reason: "Budget mentioned ($50K) but   │
│              not confirmed > $10K limit"  │
│                                             │
│     ┌─────────────────────────────────────┐ │
│     │  Should I send this to Maria for   │ │
│     │  approval before responding?       │ │
│     │                                     │ │
│     │  [Approve & Send] [Edit First]    │ │
│     │  [I Will Reply] [Cancel]          │ │
│     └─────────────────────────────────────┘ │
│                                             │
│  🟢 10:32:07 — Decision recorded: ESCALATED │
│     Maria notified via push notification    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Implementation Units

### Unit 1: Canvas Layout + Agent Grid

**Goal:** Build the main canvas screen with the top nav, agent grid, and activity sidebar.

**Requirements:** PRD v4 MVP Feature 1, Feature 9

**Dependencies:** None (pure UI, no backend dependency for layout)

**Files:**
- `app/app/components/canvas/CanvasPage.tsx` — main page component
- `app/app/components/canvas/TopNav.tsx` — top navigation bar
- `app/app/components/canvas/AgentGrid.tsx` — responsive grid of agent cards
- `app/app/components/canvas/ActivitySidebar.tsx` — recent activity feed
- `app/app/components/canvas/__tests__/CanvasPage.test.tsx`
- `app/app/components/canvas/canvas.module.css` — canvas-specific styles

**Approach:**

The canvas is a React page at `/canvas`. It uses:
- CSS Grid for the agent card layout (auto-fill, minmax 280px)
- Intersection Observer for lazy-loading agent cards (performance)
- React Query for polling agent status every 30 seconds

**TopNav:**
```
[Logo]  [Search: "Search agents..."]   [+ Hire Agent]  [Avatar ▾]
```
- Search filters agent cards client-side by name
- "+ Hire Agent" opens the NL-to-Agent flow (from NL-to-Agent plan)
- Avatar dropdown: Settings, Help, Sign Out

**Agent Grid:**
- 1 column on mobile, 2 on tablet, 3-4 on desktop
- Cards are sorted by: Running first, then Scheduled, then Stopped
- Empty state: "No agents yet. [Hire your first agent →]"
- Add agent button (ghost card) at end of grid when < 10 agents

**Activity Sidebar (collapsible on mobile):**
- Last 24 hours of agent events
- Grouped by agent with colored indicator
- "See more" loads older events (pagination)
- Real-time updates via polling (same 30s interval)

**Patterns to follow:** Existing component structure in `app/app/components/`

**Test scenarios:**
- Canvas renders with 0 agents (empty state)
- Canvas renders with 1-N agents (up to 10)
- Search filters agent list correctly (case-insensitive)
- Activity sidebar shows events for each agent
- Responsive layout breaks correctly at mobile/tablet/desktop breakpoints
- Skeleton loading state while agents are fetching

**Verification:** Visual QA across breakpoints. Unit tests for search filtering.

---

### Unit 2: Agent Card Component

**Goal:** Build the reusable agent card with live status, today's summary stats, and quick actions.

**Requirements:** PRD v4 MVP Feature 1, Feature 9

**Dependencies:** Unit 1 (canvas layout), Types from NL-to-Agent plan

**Files:**
- `app/app/components/agent/AgentCard.tsx` — agent card component
- `app/app/components/agent/AgentStatusBadge.tsx` — 🟢 🟡 🔴 status badge
- `app/app/components/agent/AgentStats.tsx` — today's work summary
- `app/app/components/agent/__tests__/AgentCard.test.tsx`
- `app/types/agent.ts` — Agent runtime type (extends AgentConfig with runtime fields)

**Agent Type:**

```typescript
// app/types/agent.ts
import type { AgentConfig } from './agent-config';

export type AgentRuntimeStatus = 'running' | 'scheduled' | 'stopped' | 'error';

export interface AgentRuntime extends AgentConfig {
  id: string;
  status: AgentRuntimeStatus;
  started_at: string | null;
  last_heartbeat_at: string | null;
  run_count: number;
  total_steps: number;
  escalated_count: number;   // today
  handled_count: number;    // today
  memory_fact_count: number;
}
```

**Card States:**

| Status | Badge Color | Message | Quick Actions |
|---|---|---|---|
| running | 🟢 Green | "Running for X hours" | [View Reasoning] [Edit] [Stop] |
| scheduled | 🟡 Yellow | "Next run in Y minutes" | [View Reasoning] [Edit] [Cancel] |
| stopped | 🔴 Gray | "Stopped" | [Start] [Edit] [Delete] |
| error | 🔴 Red | "Error: [message]" | [View Logs] [Retry] |

**Stats Display:**

```
• 23 emails read
• 8 sent
• 3 escalated to you
```

Each stat row maps to a specific tool call count from today's run history.

**Patterns to follow:** Existing component patterns + Tailwind for styling

**Test scenarios:**
- Card renders all four status states correctly
- Stats show 0 for agents with no activity today
- "Running for X hours" shows correctly for long-running agents
- Clicking [Stop] shows confirmation before stopping
- Clicking [View Reasoning] opens reasoning panel (Unit 3)
- Card handles missing/null fields gracefully (new agent, never run)

**Verification:** Component renders correctly. Quick actions are wired (stubs OK for this unit, real wiring in Unit 4).

---

### Unit 3: Real-Time Reasoning Trace Panel

**Goal:** When Maria clicks "View Reasoning," show the live reasoning trace for the agent's current or most recent run.

**Requirements:** PRD v4 MVP Feature 3

**Dependencies:** Unit 2 (card), Durable Execution plan (run state machine)

**Files:**
- `app/app/components/agent/ReasoningPanel.tsx` — slide-in panel
- `app/app/components/agent/ReasoningStep.tsx` — individual step in the trace
- `app/app/components/agent/EscalationModal.tsx` — escalation decision UI
- `app/app/api/agents/[agentId]/runs/[runId]/steps/route.ts` — steps API
- `app/app/components/agent/__tests__/ReasoningPanel.test.tsx`

**ReasoningStep Component:**

```typescript
interface ReasoningStep {
  step_id: string;
  timestamp: string;
  type: 'tool_call' | 'tool_result' | 'decision' | 'escalate' | 'completed' | 'error';
  tool_name?: string;       // for tool_call
  tool_input?: object;       // for tool_call
  tool_output?: object;      // for tool_result
  decision?: {
    reasoning: string;      // the LLM's chain-of-thought
    action: string;          // what it decided to do
    confidence: number;      // 0-1
  };
  escalate?: {
    reason: string;
    confidence_threshold: number;
    user_notification_sent: boolean;
  };
  exit_reason?: ExitReason;
}
```

**Panel UX:**

- Slides in from the right (width: 480px on desktop, full-width on mobile)
- Steps are appended in real time via polling (2s interval for running agents)
- Tool call steps show: tool name, input, and a collapsible output
- Escalation steps are highlighted in amber with prominent action buttons
- "Load earlier steps" for long runs (> 20 steps, pagination)
- Auto-scrolls to bottom when new steps arrive (unless user scrolled up)

**Escalation Modal (within panel):**

When the reasoning trace hits an escalation:

```
┌──────────────────────────────────────────┐
│  ⚠️  Agent wants your input              │
│                                          │
│  Email Agent is about to send this       │
│  email to a lead about a $50K deal:      │
│                                          │
│  To: lead@hitech.com                     │
│  Subject: Re: Enterprise Pricing        │
│  Body: "Hi Sarah, following up on our    │
│         conversation about..."           │
│                                          │
│  The deal size ($50K) exceeds your      │
│  $10,000 approval limit.                │
│                                          │
│  [Approve & Send] [Edit & Approve]      │
│  [I Will Reply] [Cancel]                 │
└──────────────────────────────────────────┘
```

**Patterns to follow:** Existing modal patterns in codebase

**API:** `GET /api/agents/[agentId]/runs/[runId]/steps?after=step_id` for polling

**Test scenarios:**
- Panel renders with 0 steps (new agent, never run)
- Panel renders with N steps from a completed run
- Escalation step shows modal with correct context
- Real-time polling appends new steps without re-rendering entire panel
- User at bottom sees auto-scroll; user scrolled up sees "↓ New steps" indicator
- Long tool output is collapsed by default with "Show more"

**Verification:** Visual QA with a mock running agent. Unit tests for step rendering.

---

### Unit 4: Agent Management Actions

**Goal:** Wire the quick actions on agent cards (Start, Stop, Edit, Delete) to real backend operations.

**Requirements:** PRD v4 MVP Feature 1 (agent cards), Feature 9 (activity log)

**Dependencies:** Unit 2 (card with actions), Durable Execution plan (start/stop API)

**Files:**
- `app/app/api/agents/[agentId]/route.ts` — GET (fetch agent), PATCH (update config), DELETE
- `app/app/api/agents/[agentId]/start/route.ts` — POST starts agent
- `app/app/api/agents/[agentId]/stop/route.ts` — POST stops agent gracefully
- `app/app/components/agent/EditAgentModal.tsx` — edit configuration modal
- `app/app/components/agent/__tests__/AgentManagement.test.tsx`

**Stop Flow:**
```
User clicks [Stop]
    │
    ▼
Confirmation: "Stop Email Agent? It will finish its current task first."
    │
    ▼
POST /api/agents/[agentId]/stop
    │
    ▼
1. Set agent status to "stopping"
2. Send interrupt signal to current run (via BullMQ)
3. Return immediately; let run complete gracefully
4. Polling updates status to "stopped" when run finishes
```

**Edit Flow:**
```
User clicks [Edit]
    │
    ▼
Modal opens with current AgentConfig pre-filled
    │
    ▼
User edits: name, tools, escalation keywords, schedule
    │
    ▼
PATCH /api/agents/[agentId] { config: Partial<AgentConfig> }
    │
    ▼
If agent is running: show "Changes apply on next run"
If agent is stopped: show "Restart to apply changes?"
```

**Delete Flow:**
```
User clicks [Delete] (in card dropdown menu)
    │
    ▼
Confirmation: "Delete Email Agent? This cannot be undone. All memory will be lost."
    │
    ▼
DELETE /api/agents/[agentId]
    │
    ▼
1. Stop any running job
2. Cancel pending scheduled jobs
3. Archive agent + runs in DB (soft delete)
4. Remove from canvas
```

**Patterns to follow:** Existing API route patterns

**Test scenarios:**
- Stop confirms gracefully, agent reaches "stopped" state
- Edit modal pre-fills correctly, PATCH validates and saves
- Delete removes card from canvas and archives in DB
- Double-stop is idempotent (no error)
- Stop while no run active → immediately "stopped"
- Edit while running → changes saved but not applied until next run

**Verification:** Full integration test for each action.

---

### Unit 5: Push Notifications (Escalation Alerts)

**Goal:** When an agent escalates, Maria receives a push notification on her device.

**Requirements:** PRD v4 MVP Feature 7 (escalation modal)

**Dependencies:** Unit 3 (escalation detection), Durable Execution plan (escalation trigger)

**Files:**
- `app/lib/notifications/push.ts` — Web Push sender
- `app/app/api/push/subscribe/route.ts` — subscribe endpoint
- `app/app/api/push/unsubscribe/route.ts` — unsubscribe endpoint
- `app/app/components/settings/NotificationSettings.tsx` — per-agent notification toggles
- `app/lib/notifications/__tests__/push.test.ts`

**Escalation Push Payload:**

```typescript
interface EscalationPush {
  title: "Agent needs your input";
  body: "Email Agent: Lead asked about $50K deal. Review before it sends.";
  icon: "/icons/agent-email.png";
  tag: "escalation";          // for deduplication
  data: {
    agent_id: string;
    run_id: string;
    escalation_step_id: string;
    url: "/canvas?agent=xxx&run=yyy&escalation=true";
  };
}
```

**Notification Settings UI (in agent settings):**

```
┌─────────────────────────────────────────┐
│  Notification Settings                  │
│                                         │
│  [✓] Escalations          [Always]  ▾  │
│  [✓] Daily summary         [8:00am] ▾  │
│  [ ] Weekly summary                     │
│  [ ] Agent stopped                      │
│                                         │
│  Delivery:                              │
│  [✓] Push notifications                 │
│  [✓] Email digest (if no push)         │
└─────────────────────────────────────────┘
```

**Patterns to follow:** Web Push API + existing notification patterns

**Test scenarios:**
- Escalation triggers push notification to subscribed devices
- Same escalation (duplicate) does not send duplicate push (deduped by tag)
- User can disable notifications per-agent
- Push subscription persists across page refreshes

**Verification:** Manual test on mobile device. Unit test for subscription management.

---

### Unit 6: Magic Link Auth

**Goal:** Allow Maria to sign in via email magic link — no password, no OAuth social login, no account creation form.

**Requirements:** PRD v4 MVP Feature 10

**Dependencies:** None (foundational)

**Files:**
- `app/lib/auth/magic-link.ts` — email sending + token generation
- `app/app/api/auth/magic-link/send/route.ts` — POST sends link
- `app/app/api/auth/magic-link/verify/route.ts` — GET verifies token
- `app/app/components/auth/MagicLinkForm.tsx` — email entry UI
- `app/app/components/auth/VerifyEmailPage.tsx` — "check your email" page
- `app/middleware.ts` — auth middleware protecting /canvas
- `app/lib/auth/session.ts` — session management (cookie-based)
- `app/lib/auth/__tests__/magic-link.test.ts`

**Flow:**

```
Login page: "Enter your email to sign in"
    │
    ▼
User types: maria@hvaccompany.com [Send Link]
    │
    ▼
POST /api/auth/magic-link/send
    │
    ▼
1. Check if email exists in DB (create if new — magic link = auto-signup)
2. Generate 6-digit code + 15-min expiry
3. Store in DB: auth_codes(email, code, expires_at)
4. Send email via Postmark/SendGrid: "Your code is 482931"
    │
    ▼
"Check your email" page polls /api/auth/magic-link/verify?code=XXX
    │
    ▼
User pastes code OR clicks link in email
    │
    ▼
GET /api/auth/magic-link/verify?code=XXX
    │
    ▼
1. Validate code + expiry
2. Create session (Set-Cookie: session_token HttpOnly)
3. Delete used code
4. Redirect to /canvas
```

**Security:**
- Rate limit: 3 codes per email per 15 minutes
- 6-digit numeric code (not URL token — more accessible for older users)
- Codes expire in 15 minutes
- Single use
- Session cookie: HttpOnly, Secure, SameSite=Lax, 30-day expiry

**Patterns to follow:** Existing auth patterns if any; otherwise implement cleanly

**Test scenarios:**
- Valid code redirects to /canvas and sets session cookie
- Expired code returns 400 "Code expired"
- Invalid code returns 400 "Invalid code"
- Same code cannot be used twice
- 4th code request in 15 minutes returns 429
- New email auto-creates account

**Verification:** Integration test for full flow. Security review of session management.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Agent running for > 24h straight | Card shows "Running for 2d 4h". Reasoning panel paginates by day. |
| 20+ agents on canvas | Virtual scrolling (react-virtual) to keep DOM manageable |
| Agent name is Unicode emoji | Render as-is; fallback to generic icon if unsupported |
| Push notification denied by browser | Graceful fallback to email digest; prompt re-request in settings |
| Magic link email goes to spam | "Check your spam folder" message on verify page |
| Session expires while panel is open | Show "Session expired — [Sign in again]" overlay, don't lose state |

---

## Dependencies and Sequencing

```
Unit 6 (Magic Link Auth) — foundational, blocks all other units
    │
Unit 1 (Canvas Layout) — can build UI shell in parallel
    │
Unit 2 (Agent Card) — depends on Unit 1
    │
Unit 3 (Reasoning Panel) — depends on Unit 2 + Durable Execution
    │
Unit 4 (Management Actions) — depends on Unit 2 + Durable Execution
    │
Unit 5 (Push Notifications) — depends on Unit 3 escalation detection
```

**Recommended parallelization:**
- Units 1 + 6 can run in parallel (UI shell + auth)
- Units 2 builds on top of 1
- Units 3 + 4 are blocked by Durable Execution plan but UI shell can be built with mocks

---

## Open Questions (Deferred to Implementation)

| Question | Why Deferred | How Resolved |
|---|---|---|
| Real-time vs polling for reasoning trace? | SSE adds server complexity; polling is simpler for MVP | Poll at 2s intervals; upgrade to SSE in Phase 2 if latency is unacceptable |
| Virtual scrolling library? | Need to evaluate react-virtual vs react-window | Pick based on bundle size and ease of use at implementation time |
| Notification delivery (Web Push vs mobile SDK)? | Web Push is cross-platform but requires service worker | Web Push first; native SDK in Phase 2 if iOS push is unreliable |
| What icon set? | Lucide? Heroicons? Custom? | Lucide (MIT license, good coverage) |

---

## Success Criteria

1. Canvas loads in under 2 seconds with 10 agents
2. Agent cards show live status from the DB
3. "View Reasoning" shows the complete step-by-step trace for any completed run
4. Escalation modal appears within 1 second of the agent hitting the escalation condition
5. Magic link signs in a new user in under 60 seconds end-to-end
6. All canvas text is legible and accessible (WCAG AA minimum)
7. Mobile layout is fully functional — Maria can check her team from her phone
