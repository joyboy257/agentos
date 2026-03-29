# AgentOS v3 — Master Plan

**Status:** Design CLEARED (CEO + Eng + Design all passed). Building.
**Last updated:** 2026-03-29
**Deployed:** https://landing-pknepowwe-deonaqwx-9156s-projects.vercel.app

---

## What We Are Building

**"Canva for AI agents"** — a visual platform for multi-agent AI orchestration, built for non-technical business users (SMB owners, marketing managers, ops leads).

**Core concept:** Users describe what they want in plain English. AgentOS assembles an agent team and runs it.
> "I described what I wanted and it happened."

**Target user:** NOT developers. NOT tech-savvy power users. The marketing manager who has never written a line of code but manages a team and is drowning in repetitive tasks.

**Three premises:**
1. Agents are the product — not a feature
2. Distribution is the problem — most people who could benefit don't know agents exist
3. UI/UX is the moat — Canva-level usability for multi-agent AI

---

## The Product

### Two-mode interface

- **Chat** (left, 380px) — user describes what they want in plain English, gets confirmation of the assembled team
- **Canvas** (right, fills screen) — shows the agent team as colored cards with connection lines

### User flow

```
1. User opens app          → sees template gallery on canvas, chat empty
2. User types goal         → "I want to automatically respond to customer emails"
3. NL layer parses          → "Thinking..." + cards fade in one by one
4. User sees team           → 3 agent cards (Email Reader → Drafter → Sender)
5. User clicks Run          → agents execute, status updates on each card
6. User sees result         → "Your emails have been responded to"
```

### Error state
- NL parse failure → bot asks clarifying question in chat ("Did you mean... [A] or [B]?")

### Canvas mode
- Full canvas view, chat becomes a floating bubble (user can also choose input bar or collapsible panel)

---

## Design Reference

- **Wireframe:** `/tmp/gstack-sketch-agentos-v3.html`
- **Design doc:** `~/.gstack/projects/joyboy257-agentos/deon-main-design-20260329-140000.md`
- **Visual language:** Dark theme (#0a0a0f), blue/amber/pink agent role colors, purple accent

---

## Architecture

```
User Input (plain English)
  ↓
NL Interpretation Layer (LLM → structured JSON)
  {
    "agents": [
      { "name": "...", "role": "...", "tools": [...] }
    ],
    "connections": [
      { "from": "...", "to": "..." }
    ]
  }
  ↓
Graph Renderer (agent cards + connections on canvas)
  ↓
Agent Runtime (executes the graph)
  ↓
Tools (Gmail OAuth in Phase 1)
```

### Key decisions

| Decision | Choice |
|----------|--------|
| Delivery | Web app (Next.js/PWA), not Electron |
| Real-time assembly | Deferred — assembled result appears after goal submission |
| Phase 1 tool | Gmail OAuth (email read/draft) |
| Persistence | SQLite for team config + encrypted credentials |
| Execution | Background jobs, plain-language result |
| Error handling | Plain-language messages, no stack traces |
| Billing | Free tier + Pro ($50-100/month) |

---

## Phase 1 Scope (MVP)

### What ships in Phase 1

- [ ] Landing page (T8 — in progress, needs design polish)
- [ ] Next.js app skeleton with auth (T9)
- [ ] NL interpretation layer — the core product (T10)
- [ ] Agent canvas (render graph as cards + connections) (T10)
- [ ] Run button + execution (T11)
- [ ] Gmail OAuth integration (T12)
- [ ] Waitlist → early access flow (T13)

### Phase 1 templates

1. **Customer Email Agent** — Email Reader → Response Drafter → Email Sender
2. **Lead Research Agent** — Web search → data enrichment
3. **Customer Support Agent** — Ticket reader → FAQ responder → escalator

---

## Full Roadmap

### T8: Landing page design polish
**Priority:** P1
**Status:** OPEN — needs design skills swarm
**What:** Run impeccable/bolder/polish on `/landing`
**Reference:** Wireframe at `/tmp/gstack-sketch-agentos-v3.html`

---

### T9: Next.js app skeleton
**Priority:** P1
**Status:** NOT STARTED
**What:**
- Next.js app (App Router)
- Database: SQLite (team configs) or Postgres
- Auth: email/password or magic link
- App routing: `/app` (main UI), `/login`, `/signup`
- Project structure: separate packages for `ui`, `runtime`, `nl-layer`

---

### T10: NL interpretation layer — THE CORE
**Priority:** P1
**Status:** NOT STARTED — this is the whole product
**What:**
An API route that takes plain English and returns a structured agent graph:

```typescript
// POST /api/assemble
// Request: { "goal": "I want to automatically respond to customer emails" }
// Response: {
//   "agents": [
//     { "id": "1", "name": "Email Reader", "role": "reader",
//       "tools": ["gmail.read"], "description": "..." },
//     { "id": "2", "name": "Response Drafter", "role": "drafter",
//       "tools": ["llm"], "description": "..." },
//     { "id": "3", "name": "Email Sender", "role": "sender",
//       "tools": ["gmail.send"], "description": "..." }
//   ],
//   "connections": [
//     { "from": "1", "to": "2" },
//     { "from": "2", "to": "3" }
//   ]
// }
```

**Key decisions:**
- Use structured output LLM (OpenAI `response_format: { type: "json_schema" }`)
- Prompt should be tuned for the 3 Phase 1 templates
- Handle ambiguous input with clarification question (return `clarification: true` + options)
- No real agent execution in this layer — just parse + return graph

---

### T11: Agent runtime
**Priority:** P1
**Status:** NOT STARTED
**What:**
- Execute the graph returned by T10
- For each agent: call the appropriate tools in sequence
- Handle errors per agent (don't crash the whole graph if one agent fails)
- Report status: `idle | running | waiting | error | completed`
- Persist run history to SQLite
- Background job execution (not blocking HTTP)

---

### T12: Gmail OAuth
**Priority:** P1
**Status:** NOT STARTED
**What:**
- Google Cloud Console project with Gmail API enabled
- OAuth 2.0 flow (user connects their Gmail account)
- Store encrypted refresh tokens in SQLite
- Implement `gmail.read`, `gmail.draft`, `gmail.send` tools
- Phase 1: only handles Gmail (no Instagram/Facebook)

---

### T13: Waitlist → early access
**Priority:** P2
**Status:** NOT STARTED
**What:**
- Export waitlist emails from Vercel deployment
- Email waitlist with early access link
- Invite code or magic link for prototype access

---

### T14: Mobile layout (from design review)
**Priority:** P2
**Status:** SPECCED (design review resolved)
**What:** Canvas primary (55%) + chat as draggable bottom sheet (45%)

---

### T15-T17: Deferred to Phase 2+

- Social media / Instagram OAuth
- Canvas editing mode (user drags nodes)
- Multi-user collaboration
- Billing / Pro tier
- Team workspaces

---

## Open Engineering Questions

1. **LLM provider** — OpenAI (structured output), Anthropic, or local? Recommend OpenAI GPT-4o for Phase 1 (structured output support is solid).
2. **Background jobs** — In-process queue, or separate worker? For MVP: in-process with `setTimeout`. Scale: BullMQ + Redis.
3. **Gmail token refresh** — handle gracefully; user must re-auth if token expires.
4. **NL layer ambiguity** — what if the goal is completely unparseable? Max 2 clarification rounds, then show error.

---

## Dependencies

```
T8  (landing polish)  ──────────────────────┐
                                             ↓
T9  (app skeleton)    ─────────────────────┐ │
                                           │ │
T10 (NL layer)  ← THE CORE                │ │
  │                                      (T9 must come first)
  │                                        │
  └────────────────────────────────────────┘
        ↓
T11 (agent runtime)
        ↓
T12 (Gmail OAuth)
        ↓
T13 (waitlist → access)
```

**Recommended order:** T9 → T10 → T11 → T12 → T8 (polish landing while building) → T13

---

## File Map

```
/Users/deon/agentos/
├── PLAN.md                          ← THIS FILE (master plan)
├── CLAUDE.md                        ← dev context + deploy config
├── TODOS.md                         ← T1-T17 engineering backlog
├── landing/                         ← deployed landing page
│   ├── app/page.tsx
│   └── app/api/waitlist/route.ts
├── docs/
│   ├── research/2026-03-28-agentos-v3-market-research.md
│   └── archived/v2/                 ← old v2 work
└── ~/.gstack/projects/joyboy257-agentos/
    └── deon-main-design-20260329-140000.md  ← approved design doc
```
