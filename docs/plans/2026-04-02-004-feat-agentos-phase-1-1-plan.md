# Phase 1.1 — MVP Gap Closure

**Date:** 2026-04-02
**Purpose:** Close the 6 remaining MVP gaps + 3 canvas UI units, before Phase 2 differentiation work begins.

---

## What's Already Built (Phase 1)

- Durable execution (checkpoint/resume, BullMQ, Postgres)
- Streaming tool executor (Claude Code patterns)
- Circuit breaker + withRetry middleware
- Capability registry (8 capabilities)
- Escalation suggestions (Phase A+B+C) — 4 triggers: schedule_recurring, follow_on_task, connector_gap, approval_bump
- Google Drive OAuth connector
- Canvas UI foundation (React Flow, AgentNode, NodeDetailPanel, LabeledEdge, archetype badges)
- Post-run reflection (fire-and-forget, MAX 2 suggestions per run, confidence >= 0.7)

## What's Still Missing (MVP Gaps)

| # | Gap | File(s) | Priority |
|---|-----|---------|----------|
| 1 | Magic Link Auth | Replace `app/lib/auth/` with BetterAuth | P0 |
| 2 | Gmail OAuth Callback | `app/app/api/auth/gmail/callback/route.ts` | P0 |
| 3 | Canvas Unit 5 — Trace Panel | `app/app/components/canvas/TracePanel.tsx` | P0 |
| 4 | Agent Card | `app/components/agent-card.tsx` | P1 |
| 5 | Activity Log | `app/app/(app)/activity/page.tsx` | P1 |
| 6 | Canvas Unit 3 — Wires | `app/app/components/canvas/Wire.tsx` | P1 |
| 7 | Push Notifications | `app/lib/push-notifications.ts` | P1 |
| 8 | Escalation Modal Actions | `app/components/approval-modal.tsx` | P1 |
| 9 | NL Prompt Bar (preview) | `app/components/nl-prompt-bar.tsx` | P1 |

---

## Auth: BetterAuth (Not Custom Magic Link)

**Decision:** Use [BetterAuth](https://better-auth.com/) — lightweight OSS auth for Next.js 14+ App Router.

**Why BetterAuth over custom magic link:**
- Magic links built-in with proper security (rate limiting, CSRF, link expiration)
- OAuth provider support (Google, GitHub) for dev convenience
- Typed server-component-first API
- Actively maintained, well-audited
- We were building the same thing — BetterAuth does it better

**What to remove:**
- `app/lib/auth/session.ts` — replace with BetterAuth
- `app/lib/auth/middleware.ts` — replace with BetterAuth middleware

**Migration plan:**
1. Install `better-auth`, `@better-auth/react`, `drizzle` (ORM adapter)
2. Add migration 005 for BetterAuth tables (accounts, sessions, users, verification_tokens)
3. Configure BetterAuth in `app/lib/auth.ts` using `drizzleAdapter` from `better-auth/adapters/drizzle`
4. Create auth client in `app/lib/auth-client.ts` using `createAuthClient` from `better-auth/react` (not SessionProvider)
5. Wrap `app/app/layout.tsx` with `<AuthClientProvider />` from `@better-auth/react`
6. Migrate session calls in callers to use either `auth.api.getSession({ headers })` (server) or `useAuth()` hook (client)

**Session compat layer:** Keep `getSession`, `createSession`, `deleteSession` in `queries.ts` but have them delegate to BetterAuth's session store. This avoids hunting down every caller.

---

## Design System: CSS Variables + Shadcn

**Decision:** Adopt **Shadcn** (which uses Radix primitives + Tailwind) for non-canvas UI components.

**Why Shadcn over raw Radix:**
- Shadcn = components you copy into the project and own (not a package dependency)
- Tailwind + Radix = fast to customize, no awkward override APIs
- Approval modal, suggestion cards, agent card, activity log rows — all benefit from Shadcn's polished primitives
- Canvas (React Flow) stays separate — Shadcn doesn't try to own that

**What to add:**
- `npx shadcn@latest init` — initialize Shadcn (accept defaults, use CSS variables for colors)
- `npx shadcn@latest add button card dialog input badge select tabs` — add needed components
- Tailwind CSS v4 already present in project

**Design token mapping (from `docs/design-system-v2.md`):**
- `--color-primary`: indigo (already mapped)
- `--color-success`: emerald
- `--color-warning`: amber
- `--color-danger`: rose
- Canvas uses these via CSS variables directly
- Shadcn components configured to use these via `tailwind.config.ts` color tokens

---

## Gap 1: Magic Link Auth (BetterAuth)

**File:** `app/lib/auth.ts` (new BetterAuth config)

BetterAuth setup with magic link provider (using drizzleAdapter, not postgresAdapter):

```typescript
// app/lib/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { db } from '@/lib/db'         // your existing drizzle/pg db
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: 'AgentOS <noreply@agentos.dev>',
          to: email,
          subject: 'Sign in to AgentOS',
          html: `<p>Click to sign in: <a href="${url}">${url}</a></p>`,
        })
      },
    }),
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
})
```

**File:** `app/lib/auth-client.ts` (new — client-side auth)

```typescript
// app/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL!,
})
```

**File:** `app/app/layout.tsx` — wrap with `<AuthClientProvider />` from `@better-auth/react`:

```tsx
import { AuthClientProvider } from '@/lib/auth-client'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthClientProvider>
          {children}
        </AuthClientProvider>
      </body>
    </html>
  )
}
```

**File:** `app/app/api/auth/[...betterauth]/route.ts`

```typescript
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

---

## Gap 2: Gmail OAuth Callback

**File:** `app/app/api/auth/gmail/callback/route.ts`

The Drive connector has the OAuth helpers but no callback route. The fix: parameterize `exchangeCodeForTokens` to accept a `redirect_uri`, add `buildGmailAuthUrl`, and create the Gmail callback route separately from Drive's.

**OAuth helper changes (`lib/connectors/drive/oauth.ts`):**
- `exchangeCodeForTokens(code, redirectUri?)` — second param lets callers override the redirect_uri (Drive defaults to `.../drive/callback`, Gmail passes `.../gmail/callback`)
- `buildGmailAuthUrl(state)` — new function, builds Google OAuth URL with Gmail scopes (read-only: `gmail.readonly`)

**Route flow:**
1. User clicks "Connect Gmail" → `buildGmailAuthUrl()` generates state (crypto.randomUUID()), stores in cookie, redirects to Google
2. Google redirects to `/api/auth/gmail/callback?code=xxx&state=yyy`
3. Route: validate state → exchange code → store tokens → **delete state cookie** (single-use)

```typescript
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { exchangeCodeForTokens, GMAIL_REDIRECT_URI } from '@/lib/connectors/drive/oauth'
import { setGmailToken } from '@/lib/db/queries'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  // Validate state from cookie (HttpOnly, Secure, SameSite=Lax)
  const storedState = request.cookies.get('oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.json({ error: 'Invalid state — possible CSRF' }, { status: 400 })
  }

  // Exchange with Gmail-specific redirect_uri
  const tokens = await exchangeCodeForTokens(code, GMAIL_REDIRECT_URI)

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await setGmailToken({
    user_id: session.user.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  })

  // Delete state cookie after use — single-use, prevents replay
  const response = NextResponse.redirect(new URL('/canvas', request.url))
  response.cookies.delete('oauth_state')

  return response
}
```

**Cookie: `oauth_state`** — HttpOnly, Secure, SameSite=Lax. Created by the "Connect Gmail" button handler (before redirect). Deleted immediately after successful exchange.

**BetterAuth integration:** The custom state cookie approach supplements BetterAuth's built-in OAuth CSRF protection. BetterAuth's `socialProviders.google` also handles state internally. Use both — BetterAuth for its own routes, custom state for the Gmail/Drive OAuth callback route.

**Scopes (read-only):**
- Gmail: `https://www.googleapis.com/auth/gmail.readonly`
- Drive: `https://www.googleapis.com/auth/drive.readonly` + `drive.file`
- Configure redirect URIs in Google Cloud Console: `https://yourdomain.com/api/auth/gmail/callback` and `https://yourdomain.com/api/auth/drive/callback`

---

## Gap 3: Agent Card Component

**File:** `app/components/agent-card.tsx`

Maria's glanceable agent summary:

```
┌─────────────────────────────────────────┐
│ [Ingest Icon]  Email Handler            │
│ ● Idle        Last run: 2h ago          │
│ ████████████░░░░░░  $12 / $50 budget    │
│ Next: Tomorrow at 9am                   │
└─────────────────────────────────────────┘
```

**Agent card shows:**
- Agent name + archetype badge (colored by archetype: ingest=sky, process=amber, distill=emerald)
- Status indicator (idle=green dot, running=spinner, waiting_for_approval=amber warning icon)
- Last run time (relative: "2h ago", "yesterday" — not raw timestamp)
- Budget bar (used / limit) — amber fill, gray track; rose if at 80%+ of limit
- Next scheduled wake (or "Manual only")

**Required states — all must be specified:**
- **Empty:** Maria has no agents → show card with "Hire your first agent" CTA, not a blank card
- **Loading:** skeleton with pulsing gray bars matching card dimensions
- **Error:** "Unable to load agent" with retry button — never blank or broken card
- **Budget exceeded:** rose budget bar with "Budget exceeded — tap to increase limit"

**Data needed from DB:**
- `agents` table: name, role, archetype, budget_ms, schedule
- `runs` table: latest run `created_at` and `status`
- Budget: track spend in `runs` table or aggregate from checkpoints

---

## Gap 5: Activity Log

**File:** `app/app/(app)/activity/page.tsx`

Maria's answer to "what did my agent do?" — card-based timeline, not a table. Tables require parsing column headers; cards with iconography are Maria-friendly.

**Card layout (not table):**
```
┌─────────────────────────────────────────┐
│ ●  Email Handler                       │
│    Checked email · 2h ago              │
│    ✓ Completed                         │
└─────────────────────────────────────────┘
```

- Each run = one card. Stack vertically, newest first.
- **Action column** shows natural language: "Checked 3 emails from inbox", not "gmail:read"
- **Outcome badge:** green checkmark (completed), rose X (failed), amber warning (escalated)
- **Timestamp:** relative ("2h ago"), never raw ISO strings

**Filters:**
- Agent dropdown (not a table column header)
- Outcome filter chips: [All] [Completed] [Failed] [Escalated]
- Date range: "Today", "Last 7 days", "Last 30 days", custom

**Escalation indicator:** Runs that triggered escalation suggestions show an amber "Action needed" chip. Maria can tap it to see the suggestion that fired.

**Required states:**
- **Empty:** "No activity yet — your agents will appear here after their first run"
- **Loading:** 3 skeleton cards with pulsing animation
- **Error:** "Unable to load activity — your agents may still be running" with retry
- **No results (filtered):** "No escalated runs in this period" with active filter chips and X to remove

**DB query:** `getRunHistory` — JOIN runs + agents + escalation_suggestions. Order by created_at DESC. Natural language action description derived from tool_name + tool_args, not stored as raw tool name.

**Retention:** 90 days.

---

## Gap 7: Push Notifications

**Decision: Use Pushover.** Simpler API, generous free tier, no SDK complexity. (`exponential` deferred as overkill for MVP.)

**Files:** `app/lib/push-notifications.ts`, `app/app/api/push/route.ts`

**Schema change:**
```sql
ALTER TABLE users ADD COLUMN pushover_user_key TEXT;
```

**Two notification triggers:**
1. **Escalation:** when `postRunReflection` creates an escalation suggestion → fire `sendPushNotification(userId, type, agentName)` where `userId` is fetched from DB via the agent's `user_id`
2. **Run completion:** when a run completes with no escalation → fire "AgentOS: Run complete — [agent name] finished successfully"

**Note on Pushover tokens:** The column stores the user's *Pushover user key* (30-char, from Pushover dashboard). The app's *API token* (`PUSHOVER_APP_TOKEN`) is in env — never stored in DB.

**Notification content:**
- Title: "AgentOS: Action needed" (escalation) or "AgentOS: Run complete" (completion)
- Body: Generic description — NOT the LLM-generated `proposal_headline` (which may contain PII from email/task content). Use: "Your [agent name] agent needs your approval — tap to review" / "Your [agent name] agent completed successfully."
- Token: Validate Pushover user key format (30-char alphanumeric) before storage

**API route:**
- `POST /api/push` — body `{ pushoverUserKey: string }`, **requires auth session** (user_id from BetterAuth session, not request body)
- `DELETE /api/push` — clears stored key for this user

**Integration point:** In `durable-runner.ts`, after `postRunReflection` resolves AND after run status is set to `completed` — not inside `postRunReflection` itself (which is fire-and-forget). The `sendPushNotification` call should also be fire-and-forget (spawn without await).

**Failure handling:** Push failures are non-blocking — escalation is ALWAYS saved to DB. If Pushover API fails, the escalation appears in Activity Log with an escalation indicator. Maria is notified in-app via the notification bell.

---

## Gap 9: NL Prompt Bar — Preview Only

**File:** `app/components/nl-prompt-bar.tsx`

**Phase 1.1 scope:** Text input + read-only preview card. No agent is created.

**Why no disabled button:** A disabled "Activate" button is a broken affordance — Maria tries to hire and nothing happens. Instead, show a preview that signals the product understands her, with a "Coming soon" badge.

**What it does:**
1. Maria types: "check my email every morning and flag anything from suppliers"
2. After typing (debounce 500ms): show "Analyzing your goal..." with animated dots
3. Below the input: shows a **read-only preview card** with:
   - Goal text (as typed)
   - Suggested archetype badge (Ingest/Process/Distill — from capability registry)
   - Suggested tools: gmail.read, web.search
   - Bottom: amber "Coming soon" badge — not a button, no false affordance
4. No "Activate" button ships in Phase 1.1

**Phase 2 will wire:** NL prompt → `/api/canvas/nl-to-canvas` → creates agent config → "Activate" becomes real.

---

## Canvas Unit 3: Wire Connections

**Files:** `app/app/components/canvas/Wire.tsx`, `app/app/components/canvas/AgentNode.tsx` (handle positions)

React Flow has built-in connection line rendering. Unit 3 wires this up so Maria can:

1. Drag from one agent's output handle (right side) to another's input handle (left side)
2. See a connection line preview while dragging
3. On drop: save the wire to the `wires` table
4. Show labeled edges on the canvas (using existing `LabeledEdge.tsx`)

**Handle positions (must be added to AgentNode.tsx — not yet present):**
- Team Lead: output handle on right edge, no input handle
- Workers: input handle on left edge, output handle on right edge
- Chain: Worker → Worker → Worker

**React Flow integration:**
- Add `onConnect` callback to `<ReactFlow>`
- On connect: call `POST /api/canvas/wires` with `{ source_id, target_id }`
- **Cycle prevention:** Check onConnect for cycles (Agent A → B → A). If cycle detected: connection line turns rose, toast "Cannot connect — this would create a circular dependency", connection rejected
- Edges stored in `wires` table (from migration 002)
- On load: fetch wires and render as `LabeledEdge` components

---

## Canvas Unit 5: Reasoning Trace Panel

**File:** `app/app/components/canvas/TracePanel.tsx`

A collapsible panel showing real-time reasoning steps. Maria watches her agent think.

**What it shows:**
```
┌─ Reasoning ────────────────────────┐
│ Step 1  gmail:read                 │
│   Reading up to 5 emails from inbox  │
│ ✓ Result: 3 emails read             │
│                                       │
│ Step 2  llm:summarize              │
│   Summarizing email content...       │
│   Thinking... ░░░░░░░░░             │
│ ✓ Result: Summary complete           │
└─────────────────────────────────────┘
```

**Args shown in plain English, not JSON.** Maria doesn't know what `{ inbox: "INBOX", max: 5 }` means. Show: "Reading up to 5 emails from your inbox". Raw JSON available via a collapsed "Technical details" expandable.

**Error state (required):** When `tool_error` fires, render that step with a rose-colored X, the error message, and the full error payload in a collapsed expandable. If the run aborts, add a final "Run failed" state.

**Collapsible:** Default: collapsed. A small pulsing "reasoning" badge appears on the running agent node. Click to expand the full trace.

**Implementation:**
- `lib/runtime/trace-context.ts` — define `TraceEvent` type stub: `{ type: 'tool_start' | 'tool_result' | 'tool_error' | 'checkpoint' | 'escalation'; payload: unknown }`
- If DurableRunner event schema is not yet finalized: ship the stub with `emit()` as a no-op, wire it in Phase 2. Do not leave this undefined.
- `DurableRunner` emits events → `TraceContext` buffers them → `TracePanel` renders

---

## Canvas Unit 8: Escalation Modal Actions

**File:** `app/components/approval-modal.tsx`

**MVP scope — four actions, all P1:**

1. **Approve** (primary button): run the tool as proposed. Proceed to execution.
2. **Edit** (secondary button): open an edit modal for the args. Maria can modify before approving.
3. **Skip** (tertiary button): "Skip this time only" — the agent skips this tool for this run only. Explicit copy: "The agent will skip this step for this run only. The tool will run normally next time."
   - **Do NOT** conflate with "skip forever" — that requires a separate confirmation modal and is Phase 2.
4. **Cancel** (text link): abort this run entirely.

**Skip copy must be unambiguous.** "run once without this tool" is ambiguous — Maria could interpret it as disabling the tool permanently. Always label as "skip this time only."

**What-if preview (P2 refinement):** Plain English description of what the tool will do with current args. Shown before Approve. Not MVP scope — deferred to Phase 2 alongside full risk indicators.

**Permission level badge (P1):**
- `needs_approval`: amber badge "Requires your approval"
- `safe`: green badge "Auto-approved" (transparency — Maria sees what would have auto-approved)

---

## Implementation Order

```
Step 1: BetterAuth Setup (P0)
  → npm install better-auth @better-auth/react drizzle
  → Migration 005: BetterAuth schema (accounts, sessions, users, verification_tokens)
  → app/lib/auth.ts (drizzleAdapter + magicLink plugin + Resend)
  → app/lib/auth-client.ts (createAuthClient)
  → API route + layout AuthClientProvider
  → Compat shim in queries.ts

Step 2: Gmail OAuth Callback (P0)
  → /api/auth/gmail/callback route (with CSRF state validation)
  → Test full Google OAuth flow

Step 3: Canvas Unit 5 — Trace Panel (P0)
  → Define TraceContext + TraceEvent type stub
  → Wire DurableRunner events → TraceContext
  → TracePanel.tsx (human-readable args, error states, collapsible)
  → [Stub if event schema not finalized — ship stub, wire in Phase 2]

Step 4: Agent Card Component (P1)
  → agent-card.tsx with empty/loading/error/budget-exceeded states
  → Add to canvas dashboard page

Step 5: Activity Log (P1)
  → Card-based timeline layout (not table — Maria-friendly)
  → Run history query (natural language "Action" column)
  → Filters: agent dropdown + outcome chips
  → 90-day retention

Step 6: Canvas Unit 3 — Wires (P1)
  → Add handle positions to AgentNode.tsx
  → Wire.tsx + onConnect handler
  → POST /api/canvas/wires
  → Load wires on canvas mount

Step 7: Push Notifications (P1)
  → Migration 006: add pushover_user_key to users table
  → /api/push route (BetterAuth session-guarded)
  → sendPushNotification() wired in durable-runner.ts
  → Run-completion notification (not just escalations)
  → Pushover user key format validation (30-char alphanumeric)

Step 8: Escalation Modal Actions (P1)
  → Approve / Edit / Skip / Cancel buttons
  → "Skip" = "skip this time only" (explicit copy)
  → Skip-forever requires separate confirmation
  → Auth-guarded /api/push route

Step 9: NL Prompt Bar — Preview Only (P1)
  → Text input + preview card (read-only, no disabled button)
  → "Coming soon" badge instead of disabled button
  → Loading state ("Analyzing your goal...")
  → Phase 2 wires full activation
```

---

## Files to Create/Modify

| File | Change |
|---|---|
| `lib/db/migrations/005_betterauth_schema.sql` | **NEW** |
| `lib/db/migrations/006_push_tokens.sql` | **NEW** — add pushover_user_key to users |
| `app/lib/auth.ts` | **NEW** — BetterAuth config + Resend |
| `app/app/api/auth/[...betterauth]/route.ts` | **NEW** |
| `app/lib/auth-client.ts` | **NEW** — createAuthClient |
| `app/lib/db/queries.ts` | **MODIFY** — compat shim + run history query |
| `app/app/api/auth/gmail/callback/route.ts` | **NEW** — CSRF state validation |
| `app/components/agent-card.tsx` | **NEW** |
| `app/app/(app)/activity/page.tsx` | **NEW** |
| `app/lib/push-notifications.ts` | **NEW** |
| `app/app/api/push/route.ts` | **NEW** — auth-guarded |
| `app/components/nl-prompt-bar.tsx` | **NEW** — read-only preview, no disabled button |
| `app/app/components/canvas/Wire.tsx` | **NEW** |
| `app/app/components/canvas/AgentNode.tsx` | **MODIFY** — add handle positions |
| `app/app/components/canvas/CanvasProvider.tsx` | **MODIFY** — wire state |
| `app/app/api/canvas/wires/route.ts` | **NEW** |
| `app/app/components/canvas/TracePanel.tsx` | **NEW** |
| `app/lib/runtime/trace-context.ts` | **NEW** |
| `app/components/approval-modal.tsx` | **MODIFY** — Edit/Skip/Cancel actions |
| `app/app/components/canvas/index.ts` | **MODIFY** — export TracePanel, Wire |

---

## Dependencies

- **BetterAuth setup** (Step 1) must be complete before **Push Notifications** (Step 7) and **NL Prompt Bar** (Step 9) — both require an authenticated user session
- **Trace Panel** (Step 3) depends on DurableRunner event schema — if not finalized, ship stub and wire in Phase 2

## Deferred to Phase 2

- NL interpretation API (`/api/canvas/nl-to-canvas`) — turns Maria's plain English into agent config
- Full agent activation from NL Prompt Bar (preview already in Phase 1.1)
- Proactive memory (long-term memory microservice)
- Skills directory / template gallery
- Multi-agent orchestration
- Governance board

## Verification

After each step: `npm run build` passes, TypeScript strict mode passes.

**After Step 1 (BetterAuth):** Maria can receive a magic link email and sign in without a password.

**After Step 2 (Gmail OAuth):** Maria clicks "Connect Gmail" → Google consent → redirected back to canvas with Gmail connected.

**After Step 3 (Trace Panel — P0):** Running agent shows pulsing "reasoning" badge. Maria taps to expand → sees steps with human-readable args ("Reading 5 emails from inbox"), results, and error states. Panel collapses back.

**After Step 4 (Agent Card):** Maria sees an agent card with: agent name, status indicator (she can read Idle/Running at a glance), last run time in relative format, budget bar (amber/rose), and next wake or "Manual only". Empty/loading/error states render correctly.

**After Step 5 (Activity Log):** Maria opens Activity Log → sees card-based timeline with relative timestamps, agent names, natural language action descriptions (not tool names), and outcome badges. Filters work. Empty state shows appropriate message.

**After Step 6 (Canvas Wires):** Maria drags from one agent's output handle to another's input → connection line previews → on drop, wire is saved and labeled edges appear. Cycle detection rejects circular connections with rose line + toast.

**After Step 7 (Push Notifications):** Escalation suggestion created → Pushover notification fires on Maria's phone with generic body. Run completes without escalation → "Run complete" notification fires.

**After Step 8 (Escalation Modal Actions):** When agent escalates, modal shows with Approve / Edit / Skip / Cancel. Skip is labeled "Skip this time only". Permission badge visible. API error states render with retry.

**After Step 9 (NL Prompt Bar):** Maria types a goal → "Analyzing..." state → read-only preview card appears with archetype badge, tool list, and amber "Coming soon" badge (not a button). Loading and error states work.

**After all steps:** Full MVP feature set complete — Maria can hire, monitor, and trust an agent.
