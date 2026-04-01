# Plan: Phase 1 — MVP Execution

**Date:** 2026-04-02
**Type:** feat
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v4 — Phase 1 MVP (Days 0–90)

---

## Goal

Ship the AgentOS MVP — proof that a non-technical user can hire a persistent, durable AI employee in under 5 minutes and trust it to work.

> **Success condition:** Maria hires her first agent on Day 2. On Day 3, she wakes up to "Agent worked while you slept."

---

## What We Are Shipping

| # | Feature | PRD v4 Line | Status |
|---|---------|-------------|--------|
| 1 | Canvas team dashboard | MVP Feature 1 | Planned |
| 2 | NL-to-agent deployment | MVP Feature 2 | Planned |
| 3 | Gmail OAuth integration | MVP Feature 3 | Planned |
| 4 | Durable execution | MVP Feature 4 | Planned |
| 5 | Real-time reasoning traces | MVP Feature 5 | Planned |
| 6 | Escalation modal | MVP Feature 6 | Planned |
| 7 | Agent card | MVP Feature 7 | Planned |
| 8 | Activity log | MVP Feature 8 | Planned |
| 9 | Magic link auth | MVP Feature 9 | Planned |
| 10 | Push notifications | MVP Feature 10 | Planned |

**NOT in scope:** Multi-agent, template gallery (1 email handler only), long-term memory, Calendar/HubSpot, skills directory, governance board, auto-pause, PROACTIVE mode, permission auto-approval.

---

## Phase 1 Sequencing

### Weeks 1–3: Foundation

**Auth + Postgres + Canvas Shell**

These are prerequisites for everything else. No feature works without auth. No agent works without Postgres schema.

| Unit | Name | Owner |
|------|------|-------|
| 1a | Magic link auth | Engineering |
| 1b | Postgres schema (users, agents, runs, checkpoints) | Engineering |
| 1c | Canvas layout shell (topnav, grid, activity sidebar) | Engineering |

**Dependencies:** None. Starts immediately.

---

### Weeks 3–6: Core Runtime

**The agent must be able to run, checkpoint, and stream its reasoning to the UI.**

| Unit | Name | Depends | Owner |
|------|------|---------|-------|
| 2a | Durable execution (BullMQ + Postgres checkpoint/resume) | 1b | Engineering |
| 2b | Reasoning trace format + SSE streaming endpoint | 2a, Spec: reasoning-trace-format | Engineering |
| 2c | Gmail OAuth integration (read + compose + send) | 1b, Design System | Engineering |
| 2d | Gmail tool definitions (read_email, send_email, search_emails) | 2c | Engineering |
| 2e | NL intent parser | Design System | Engineering |
| 2f | Agent config schema + preview renderer | 2e | Engineering |

---

### Weeks 6–9: Canvas + UI

**Maria can hire, manage, and trust an agent.**

| Unit | Name | Depends | Owner |
|------|------|---------|-------|
| 3a | Agent card component | 1c, 2a | Engineering |
| 3b | Reasoning trace panel (real-time render) | 2b | Engineering |
| 3c | Escalation modal | 2b, 3b | Engineering |
| 3d | Edit & activate flow | 2f, 3a | Engineering |
| 3e | Agent management actions (start/stop/edit/delete) | 2a, 3a | Engineering |
| 3f | Activity log | 2a | Engineering |
| 3g | Push notifications (escalations only) | 3c | Engineering |

---

### Week 10: Hardening + QA

| Unit | Name | Depends |
|------|------|---------|
| 4a | End-to-end test: hire agent → agent runs → escalation → approve → complete | All above |
| 4b | Postgres migration + Vercel deployment | All above |
| 4c | 5-user Maria test (internal) | 4a |

---

## Unit 1a: Magic Link Auth

**Goal:** Maria signs in with email. No password.

**Files:**
- `app/lib/auth/magic-link.ts`
- `app/app/api/auth/magic-link/send/route.ts`
- `app/app/api/auth/magic-link/verify/route.ts`
- `app/app/components/auth/MagicLinkForm.tsx`
- `app/app/components/auth/VerifyEmailPage.tsx`
- `app/middleware.ts`
- `app/lib/auth/session.ts`

**Flow:**
1. Maria enters email → POST `/api/auth/magic-link/send`
2. Server generates 6-digit code, stores in DB with 15-min expiry
3. Email sent via Postmark/SendGrid
4. Maria pastes code → GET `/api/auth/magic-link/verify?code=XXX`
5. Valid code → session cookie set, redirect to `/canvas`
6. Invalid/expired → friendly error, retry

**Security:** Rate limit 3 codes/email/15min. Single-use codes. HttpOnly, Secure, SameSite=Lax cookie.

**Verification:** Full flow tested: new user auto-creates account.

---

## Unit 1b: Postgres Schema

**Goal:** Define all tables. Run migrations.

**Files:**
- `app/lib/db/schema.sql`
- `app/lib/db/migrations/001_initial_schema.sql`

**Schema:**

```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- oauth_tokens (Gmail OAuth per user)
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,  -- 'gmail'
  access_token TEXT,
  refresh_token TEXT,       -- encrypted at rest
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL,   -- AgentConfig JSON
  status TEXT NOT NULL DEFAULT 'stopped',  -- running|scheduled|stopped|error
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- runs
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|completed|error|cancelled
  exit_reason TEXT,  -- completed|escalated|budget_exceeded|max_steps_exceeded|error
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- steps (reasoning trace)
CREATE TABLE steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- step_id = ULID
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  step_type TEXT NOT NULL,  -- agent_started|tool_call|tool_result|decision|escalate|completed|error|heartbeat|checkpoint_saved
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_steps_run_seq ON steps(run_id, seq);

-- checkpoints
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id),
  state JSONB NOT NULL,      -- serialized runner state
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_checkpoints_run ON checkpoints(run_id, created_at DESC);

-- idempotency_keys (prevents double-fire)
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,       -- ULID-based key per tool call
  run_id UUID REFERENCES runs(id),
  step_id UUID REFERENCES steps(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_idempotency_run ON idempotency_keys(run_id);

-- escalations
CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|resolved|cancelled|timeout
  resolution TEXT,  -- approved|edit_approve|human_will_reply|cancel
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Verification:** All tables created. All foreign keys enforced. Indexes present.

---

## Unit 1c: Canvas Layout Shell

**Goal:** Page structure exists. No logic yet. Pure UI scaffolding.

**Files:**
- `app/app/(app)/canvas/page.tsx` — page component
- `app/app/components/canvas/TopNav.tsx`
- `app/app/components/canvas/AgentGrid.tsx`
- `app/app/components/canvas/ActivitySidebar.tsx`
- `app/app/globals.css` — design system tokens
- `app/app/(app)/layout.tsx` — app shell with nav

**What it renders:**
- TopNav: Logo, search bar (static), "Hire Agent" button (static), user avatar (static)
- AgentGrid: 3-column grid, empty state card
- ActivitySidebar: static placeholder ("Activity coming soon")
- All from design system tokens — no hardcoded colors

**Verification:** Page loads at `/canvas`. No console errors. Tokens applied correctly.

---

## Unit 2a: Durable Execution

**Goal:** Agents survive server restarts. Checkpoints after every step.

**Full spec:** `docs/plans/2026-04-01-002-feat-agentos-durable-execution-plan.md`

**Key design points carried forward:**
- `DurableRunner` wraps `InProcessRunner` with checkpoint/resume
- `BullMQWorker` consumes jobs from `agent_run_queue`
- `recoverIncompleteRuns()` on startup claims orphaned runs
- `claimRun()` uses `SELECT FOR UPDATE` to prevent double-fire
- Idempotency key checked before re-execution
- Typed exit reasons: `completed | escalated | budget_exceeded | max_steps_exceeded | error | cancelled`

**Verification:** Server restart → agent resumes from checkpoint. No duplicate tool calls on resume.

---

## Unit 2b: Reasoning Trace SSE

**Goal:** Every step is emitted as an SSE event. Canvas renders it live.

**Full spec:** `docs/specs/reasoning-trace-format.md`

**Key design points carried forward:**
- Base step has: `step_id (ULID)`, `run_id`, `agent_id`, `seq`, `timestamp`, `type`
- SSE endpoint: `GET /api/agents/{agentId}/runs/{runId}/stream`
- `event: step`, `data: {json}`
- Terminal event (`completed` or `error`) is last — client closes connection
- Reconnection: `GET /api/agents/{agentId}/runs/{runId}/steps?after_seq=N`
- Deduplication by `step_id`, not `seq`

**Verification:** Canvas receives steps within 500ms of emission. Reconnect replays missed steps correctly.

---

## Unit 2c: Gmail OAuth Integration

**Goal:** OAuth flow, token storage, token refresh. Read/compose/send tools.

**Files:**
- `app/lib/oauth/gmail.ts` — OAuth URL generation, token exchange
- `app/app/api/oauth/gmail/callback/route.ts` — callback handler
- `app/lib/tools/providers/gmail.ts` — Gmail API client (googleapis)
- `app/lib/tools/gmail/read-email.ts`
- `app/lib/tools/gmail/send-email.ts`
- `app/lib/tools/gmail/search-emails.ts`
- `app/app/api/oauth/gmail/connect/route.ts`
- `app/app/api/oauth/gmail/disconnect/route.ts`

**OAuth Scopes:**
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.compose
```

**Token Storage:** `oauth_tokens` table. `refresh_token` encrypted at rest (AES-256).

**Token Refresh:** Auto-refresh on 401. Background refresh 5 min before expiry.

**Verification:** User can connect Gmail, agent can read/send. Token refresh works. Disconnect removes tokens.

---

## Unit 2d: Gmail Tool Definitions

**Input/output schemas per tool.** Tool names: `gmail_read`, `gmail_send`, `gmail_search`.

**Full schemas:** `docs/specs/reasoning-trace-format.md` §Tool Schemas

**Concurrency rules:**
- `gmail_read` + `gmail_search`: parallel-safe (idempotent reads)
- `gmail_send`: serial per agent (concurrency-unsafe — only one send at a time)

**Rate limiting:** 250 requests/user/day on Gmail API. Backoff on 429.

**Verification:** Tools produce `tool_call` and `tool_result` steps matching the schema. Concurrency partitioning enforced.

---

## Unit 2e: NL Intent Parser

**Goal:** Free text → structured `AgentConfig`.

**Full spec:** `docs/plans/2026-04-01-003-feat-agentos-nl-to-agent-deployment-plan.md` — Unit 1

**Key design:**
- GPT-4o (not function calling, plain JSON output for simplicity)
- Intent taxonomy: EMAIL_HANDLING | CALENDAR_MANAGEMENT | CUSTOMER_SUPPORT | RESEARCH | GENERAL_PURPOSE
- Conservative defaults — if vague, return GENERAL_PURPOSE with no tools and prompt user
- Max 500-char input

**Verification:** Parser correctly classifies 90%+ of realistic user descriptions.

---

## Unit 2f: Agent Config Schema + Preview

**Goal:** Structured `AgentConfig` type + React preview component.

**Full spec:** `docs/plans/2026-04-01-003-feat-agentos-nl-to-agent-deployment-plan.md` — Unit 2

**Config fields:** `intent_type`, `name`, `description`, `tools[]`, `trigger{cron}`, `escalation{keywords}`, `persona`, `memory_enabled`

**Preview UI:** Agent card with editable fields, tool chips, escalation keyword editor, "Activate" CTA.

**Verification:** Preview accurately reflects final agent. All edits persisted.

---

## Unit 3a: Agent Card Component

**Goal:** Live agent card with status, stats, quick actions.

**Full spec:** `docs/plans/2026-04-01-004-feat-agentos-canvas-ui-plan.md` — Unit 2

**Card states:** running (🟢 + pulse), scheduled (🟡), stopped (🔴), error (🔴 + error message)

**Stats:** emails read, sent, escalated today (from run history)

**Quick actions:** View Reasoning, Edit, Stop (or Start if stopped)

**Verification:** Card reflects DB status within 30s of state change. Quick actions wired to API.

---

## Unit 3b: Reasoning Trace Panel

**Goal:** Real-time rendering of the SSE stream.

**Full spec:** `docs/plans/2026-04-01-004-feat-agentos-canvas-ui-plan.md` — Unit 3

**Panel:** Slides from right, 480px wide. Steps append in real time. Auto-scroll if user at bottom, "↓ N new steps" if scrolled up.

**Verification:** Panel shows all step types with correct formatting. Escalation step highlighted in amber.

---

## Unit 3c: Escalation Modal

**Goal:** Maria can approve, edit, skip, or cancel an escalation.

**Full spec:** `docs/plans/2026-04-01-004-feat-agentos-canvas-ui-plan.md` — Unit 3

**Actions:**
- `approve` — agent proceeds with proposed action
- `edit_approve` — agent proceeds with Maria's edited version
- `human_will_reply` — agent marks as resolved, does not proceed
- `cancel` — agent marks as cancelled, does not proceed

**API:** `POST /api/agents/{agentId}/runs/{runId}/escalations/{escalationId}/resolve`

**Verification:** Modal appears within 1s of escalation step. All 4 actions resolve correctly.

---

## Unit 3d: Edit & Activate Flow

**Goal:** NL → preview → edit → activate → agent running.

**Full spec:** `docs/plans/2026-04-01-003-feat-agentos-nl-to-agent-deployment-plan.md` — Unit 4

**OAuth Gate:** If Gmail not connected when activating email agent → show "Connect Gmail" modal.

**Verification:** Full flow: type description → preview → activate → agent status "running". < 10s end-to-end.

---

## Unit 3e: Agent Management Actions

**Goal:** Start, stop, edit, delete wired to API.

**Full spec:** `docs/plans/2026-04-01-004-feat-agentos-canvas-ui-plan.md` — Unit 4

**Stop:** Graceful — finish current task, then "stopped". Confirm dialog.

**Edit:** Modal pre-fills current config. Changes saved; apply on next run if agent running.

**Delete:** Confirmation → soft-delete in DB → remove from canvas.

**Verification:** All actions persist correctly. Concurrent actions handled idempotently.

---

## Unit 3f: Activity Log

**Goal:** Searchable ticket log of all agent actions. 90-day retention.

**Files:**
- `app/app/(app)/activity/page.tsx`
- `app/app/api/activity/route.ts`
- `app/app/components/activity/ActivityTable.tsx`
- `app/app/components/activity/ActivityFilters.tsx`

**Data:** All completed `steps` are queryable. Each escalation creates an `escalation` record.

**UI:** Table view with columns: Time, Agent, Action, Detail, Status. Filters: agent, date range, action type. Search: full-text on action detail.

**Verification:** All completed runs appear as tickets. Filters work. Export (CSV) functional.

---

## Unit 3g: Push Notifications

**Goal:** Escalations trigger Web Push to Maria's device.

**Full spec:** `docs/plans/2026-04-01-004-feat-agentos-canvas-ui-plan.md` — Unit 5

**Trigger:** `escalation` step → `notification_sent: true` → Web Push via VAPID

**Settings:** Per-agent notification toggles (escalations on/off, daily summary on/off)

**Fallback:** If push denied → email digest (daily, via Postmark/SendGrid)

**Verification:** Escalation fires push within 5 seconds. Deduplicated by escalation ID.

---

## Unit 4a: End-to-End Test

**Scenario:**
1. Maria signs in (magic link)
2. Connects Gmail OAuth
3. Types "handle my customer emails" → sees preview
4. Activates agent
5. Agent runs, reads emails, drafts responses
6. Agent escalates one email
7. Maria receives push notification
8. Maria opens modal, approves
9. Agent sends email, completes
10. Activity log shows all 10 steps

**Verification:** All 10 steps pass. Zero manual intervention beyond approvals.

---

## Unit 4b: Postgres Migration + Deploy

**Goal:** Schema deployed to production Postgres (Neon).

**Steps:**
1. Run `schema.sql` migration against production Neon DB
2. Run Vercel deploy
3. Verify `/api/health` returns 200
4. Smoke test: magic link → canvas → agent creation

**Verification:** Production works end-to-end.

---

## Unit 4c: Internal User Test (5 Marias)

**Goal:** 5 internal testers, non-technical, hire and trust an agent.

**Criteria:**
- Can hire an agent in under 5 minutes (measured)
- Experiences the AHA moment within 3 days
- NPS > 7

**Verification:** All 5 complete the AHA journey.

---

## Open Questions

| Question | Status | Resolution |
|---|---|---|
| Email provider (Postmark vs SendGrid)? | Open | Pick based on cost + deliverability |
| Vercel Postgres vs Neon? | Decision: Neon | Better branching for zero-downtime migrations |
| Web Push via service worker or Expo? | Open | Web Push (simpler for MVP) |
| Real-time via SSE or polling? | Decision: SSE | spec: reasoning-trace-format already defines SSE |
| Activity log: full-text search via Postgres or external? | Decision: Postgres `ILIKE` | Sufficient for MVP scale |

---

## What Phase 1 Does NOT Do

These are Phase 2 and Phase 3 features. Do not build them in Phase 1.

- Permission auto-approval / TRANSCRIPT_CLASSIFIER
- Long-term memory (mem0.ai)
- PROACTIVE mode / Gmail push webhook
- Template gallery (beyond the 1 email handler)
- Skills directory
- Auto-pause on budget
- Governance board
- Multi-agent orchestration
- Calendar / HubSpot / CRM integrations
- Team collaboration / multi-user
