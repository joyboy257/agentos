# AgentOS v3 — Product & Technical Specification

**Version:** 1.0
**Status:** READY FOR IMPLEMENTATION
**Generated from:** `deon-main-design-20260329-140000.md` + `deon-main-eng-review-test-plan-20260329.md`
**Last updated:** 2026-03-29
**Deployed:** https://landing-pknepowwe-deonaqwx-9156s-projects.vercel.app

---

## 1. Product Overview

### What We Are Building

**"Canva for AI agents"** — a visual platform for multi-agent AI orchestration, built for non-technical business users (SMB owners, marketing managers, ops leads). NOT developers.

**Core concept:** Users describe what they want in plain English. AgentOS assembles an agent team and runs it.

> **AHA moment:** "I described what I wanted in plain English and it happened."

### Target User

Small business owner / marketing manager / ops lead who:
- Wears many hats
- Uses ChatGPT daily but has never built a multi-agent workflow
- Can't code but can use Canva, Notion, QuickBooks
- Doesn't know agents could solve their problem — they think manual work is the cost of doing business

### Three Premises

1. **Agents are the product** — not a social media tool or a lead gen feature
2. **Category creation, not pain-aware** — target users don't know they need agents
3. **UI/UX is the moat** — Canva-level usability for multi-agent AI

---

## 2. Product Architecture

### Two-Mode Interface

**Mode A — Auto (default):**
- Left: Chat panel (380px fixed width)
- Right: Canvas (fills remaining space)
- User submits goal → NL layer parses → agent team assembles on canvas → user clicks Run

**Mode B — Canvas:**
- Full canvas view
- Chat becomes: floating bubble, input bar at bottom, OR collapsible left panel (user-toggleable)
- Templates accessible from canvas

### Interaction Flow

```
1. User opens app → template gallery on canvas, chat empty
2. User types goal → "I want to automatically respond to customer emails"
3. NL layer parses → "Thinking..." + cards fade in one-by-one (300ms stagger)
4. User sees team → 3 agent cards (Email Reader → Drafter → Sender)
5. User clicks Run → agents execute, status updates on each card
6. User sees result → plain-language message ("Your emails have been responded to")
```

### Error State

NL parse failure → bot asks specific clarifying question with clickable options ("Did you mean... [A] or [B]?"). User picks. Graceful, conversational recovery.

### Mobile Layout

Canvas primary (55% screen) + chat as draggable bottom sheet (45%). Canvas mode selector at bottom center. Chat input always accessible.

---

## 3. Visual Design

**Wireframe:** `/tmp/gstack-sketch-agentos-v3.html`

### Color System

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a0f` | Page background |
| Panel | `#12121a` | Cards, chat panel, toolbar |
| Border | `#1e1e2e` | Dividers, panel edges |
| Border hover | `#2e2e3e` | Interactive borders |
| Text primary | `#e5e5e5` | Main text |
| Text muted | `#6b6b7b` | Secondary labels |
| Text dim | `#52525b` | Placeholders |
| Accent purple | `#a78bfa` | Logo, highlights, CTAs |
| Agent: reader | `#3b82f6` | Email Reader / researcher |
| Agent: drafter | `#f59e0b` | Response Drafter / writer |
| Agent: sender | `#ec4899` | Email Sender / poster |
| Success | `#22c55e` | Running status, Run button |

### Typography

- Font: System stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI'`)
- Logo: 15px, semibold, `#a78bfa`
- Headings: 24-32px, semibold
- Body: 13px, regular
- Labels: 11-12px

### Agent Cards

- Background: `#12121a`
- Border: 1px solid, color matches agent role
- Border radius: 12px
- Padding: 14px
- Width: 160px
- Box shadow: `0 4px 24px rgba(0,0,0,0.4)`
- Status dot: pulsing green for running, amber for waiting, gray for ready

---

## 4. Phase 1 Scope

### What ships in Phase 1 (MVP)

1. **Landing page** — validate demand, collect waitlist emails
2. **Next.js app** — auth, database, routing
3. **NL interpretation layer** — parses plain English → agent graph JSON
4. **Agent canvas** — renders graph as cards + connections
5. **Run execution** — executes agent pipeline, shows results
6. **Gmail OAuth** — email read/draft/send via Gmail API
7. **Waitlist → early access** — invite waitlist users to prototype

### Phase 1 Templates

1. **Customer Email Agent** — Email Reader → Response Drafter → Email Sender
2. **Lead Research Agent** — Web search → data enrichment
3. **Customer Support Agent** — Ticket reader → FAQ responder → escalator

---

## 5. Technical Architecture

### System Diagram

```
User Input (plain English)
  ↓
API Route: POST /api/assemble
  ↓
NL Interpretation Layer (LLM → structured JSON)
  {
    "agents": [
      { "id": "1", "name": "Email Reader", "role": "reader",
        "tools": ["gmail.read"], "description": "..." }
    ],
    "connections": [
      { "from": "1", "to": "2" }
    ]
  }
  ↓
API Route: POST /api/run
  ↓
Agent Runtime (executes the graph)
  ↓
Tools (Gmail OAuth in Phase 1)
```

### Directory Structure

```
/Users/deon/agentos/
├── landing/                    ← deployed landing page (done)
├── app/                       ← Next.js app (T9)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           ← main two-mode UI
│   │   ├── api/
│   │   │   ├── assemble/      ← NL interpretation (T10)
│   │   │   │   └── route.ts
│   │   │   ├── run/           ← agent runtime execution (T11)
│   │   │   │   └── route.ts
│   │   │   └── auth/          ← auth routes (T9)
│   │   │       └── [...nextauth]/
│   │   ├── canvas/
│   │   │   └── page.tsx       ← canvas mode (optional)
│   │   └── login/
│   │       └── page.tsx
│   ├── components/
│   │   ├── chat-panel.tsx
│   │   ├── canvas-panel.tsx
│   │   ├── agent-card.tsx
│   │   ├── connection-line.tsx
│   │   ├── template-gallery.tsx
│   │   ├── template-card.tsx
│   │   └── waitlist-form.tsx
│   ├── lib/
│   │   ├── nl/
│   │   │   ├── interpret.ts    ← NL interpretation logic
│   │   │   └── prompts.ts     ← system prompts
│   │   ├── runtime/
│   │   │   ├── executor.ts     ← graph executor
│   │   │   ├── agent.ts       ← agent definition
│   │   │   └── tools/         ← tool definitions
│   │   ├── db/
│   │   │   ├── schema.ts      ← SQLite schema
│   │   │   └── queries.ts
│   │   └── gmail/
│   │       └── oauth.ts       ← Gmail OAuth
│   └── package.json
├── SPEC.md                    ← this file
├── PLAN.md                   ← build plan + T9-T17
├── CLAUDE.md
└── TODOS.md
```

---

## 6. API Specification

### `POST /api/assemble`

Parses a user goal into an agent graph.

**Request:**
```typescript
{
  goal: string  // plain English goal, e.g. "I want to automatically respond to customer emails"
}
```

**Response (success):**
```typescript
{
  agents: Array<{
    id: string
    name: string
    role: "reader" | "drafter" | "sender" | "researcher" | "escalator"
    tools: string[]  // e.g. ["gmail.read", "llm", "gmail.send"]
    description: string
  }>
  connections: Array<{
    from: string  // agent id
    to: string    // agent id
  }>
}
```

**Response (clarification needed):**
```typescript
{
  clarification: true
  question: string  // e.g. "Did you mean email automation or social media posting?"
  options: Array<{
    label: string   // e.g. "Automate email responses"
    goal: string    // modified goal to use
  }>
}
```

**Response (error):**
```typescript
{
  error: true
  message: string  // user-facing, e.g. "I didn't understand that. Try rephrasing."
}
```

**Timeout:** 5 seconds. If exceeded, return `{ error: true, message: "Taking longer than expected..." }`

---

### `POST /api/run`

Executes an assembled agent graph.

**Request:**
```typescript
{
  agents: Agent[]
  connections: Connection[]
}
```

**Response (stream):** Server-Sent Events (SSE)
```
event: status
data: { agentId: "1", status: "running", message: "Reading emails..." }

event: status
data: { agentId: "2", status: "waiting" }

event: status
data: { agentId: "1", status: "completed", result: { count: 12 } }

event: status
data: { agentId: "2", status: "running", message: "Drafting responses..." }

event: done
data: { success: true, summary: "12 emails drafted and ready for review" }
```

**Error:**
```
event: error
data: { agentId: "2", message: "Gmail access expired. Please reconnect." }
```

---

### `GET /api/agents`

Returns saved agent teams for the logged-in user.

**Response:**
```typescript
{
  teams: Array<{
    id: string
    name: string
    agents: Agent[]
    connections: Connection[]
    createdAt: string
    lastRun: string | null
  }>
}
```

---

## 7. Data Model

### SQLite Schema

```sql
-- User accounts
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,  -- null for magic link auth
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent teams
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  agents TEXT NOT NULL,  -- JSON array
  connections TEXT NOT NULL,  -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OAuth credentials (encrypted)
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,  -- "gmail"
  encrypted_token TEXT NOT NULL,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Run history
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL,  -- "running" | "completed" | "failed"
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  result TEXT  -- JSON summary
);

-- Waitlist
CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. NL Interpretation Layer — Prompt Design

### System Prompt

```
You are the AgentOS NL Interpretation Layer.

Your job: Given a user's goal in plain English, assemble an agent team.

AVAILABLE AGENTS (you must use only these):
- Email Reader: reads emails from a Gmail inbox. Tools: gmail.read
- Response Drafter: drafts personalized email responses using LLM. Tools: llm
- Email Sender: sends approved email drafts. Tools: gmail.send
- Lead Researcher: searches the web for company/contact info. Tools: web.search
- Lead Enricher: enriches lead data with additional details. Tools: web.scrape
- Support Ticket Reader: reads support tickets from email or form. Tools: gmail.read
- FAQ Responder: answers common questions using LLM. Tools: llm
- Ticket Escalator: routes complex tickets to human. Tools: email.send
- Web Content Monitor: watches a website or feed for new items. Tools: web.fetch
- Social Media Poster: posts content to social platforms. Tools: social.post (Phase 2)

RULES:
1. Always include at least one agent with a real tool (not just "llm")
2. Connections must form a DAG (no cycles)
3. Each agent must have a name, role, tools, and one-sentence description
4. If the goal is vague, ask a clarifying question instead of guessing
5. Max 5 agents in Phase 1

OUTPUT FORMAT: JSON matching the schema exactly.
```

### Structured Output

Use OpenAI `response_format: { type: "json_schema", json_schema: ... }` or Anthropic `object` tool to enforce JSON output matching the schema exactly.

---

## 9. Tool Definitions

### `gmail.read`
```
Read emails from the user's Gmail inbox.
Input: { query: string }  // Gmail search query, e.g. "is:unread newer_than:1d"
Output: { emails: Array<{ id, from, subject, snippet, date }> }
```

### `llm`
```
Generate text using LLM.
Input: { prompt: string, system?: string }
Output: { text: string }
```

### `gmail.send`
```
Send an email via Gmail.
Input: { to: string, subject: string, body: string }
Output: { sent: true, messageId: string }
```

### `web.search`
```
Search the web.
Input: { query: string, limit?: number }
Output: { results: Array<{ title, url, snippet }> }
```

### `web.fetch`
```
Fetch content from a URL.
Input: { url: string }
Output: { title: string, content: string, snippet?: string }
```

---

## 10. Authentication

**Method:** Email magic link (simplest for non-technical users)

**Flow:**
1. User enters email → `POST /api/auth/send-link`
2. Email sent with 15-minute expiry token
3. User clicks link → lands on `/api/auth/verify?token=...` → session created
4. Session stored as HTTP-only cookie, 30-day expiry

**Alternative for Phase 1:** No auth for MVP prototype. Waitlist signups only. Auth added in T9.

---

## 11. Infrastructure

| Component | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js App Router | Web-first (not Electron), good for RSC + API routes |
| Database | SQLite | Simple, file-based, encrypted credentials |
| Auth | Magic link | Non-technical users don't want passwords |
| LLM Provider | OpenAI GPT-4o | Structured output support, solid performance |
| Background jobs | In-process for MVP | `async/await` with timeout; upgrade to BullMQ later |
| Email | Gmail OAuth | Phase 1 real tool |
| Hosting | Vercel | Already configured, fast deploys |

---

## 12. Testing Strategy

### Phase 1 Tests (Landing Page)

| Test | Method |
|------|--------|
| Page renders on Chrome/Firefox/Safari | Playwright |
| Mobile responsive | Playwright |
| Form validation | Vitest |
| Edge: slow network | Playwright + throttling |
| Edge: duplicate email | API integration test |
| Edge: JS disabled | No-JS check |

### Phase 2 Tests (NL Layer + Canvas)

| Test | Method |
|------|--------|
| Valid goal → valid JSON graph | Custom harness (20+ test pairs) |
| Vague goal → clarification | Custom harness |
| Invalid goal → error message | Custom harness |
| LLM timeout → user-facing error | Mock LLM |
| Canvas: 0/1/3 agents render | Playwright |
| Template gallery interactions | Playwright |

**LLM Eval Suite — Minimum 20 test pairs:**
```
"post to Instagram when I add a menu item"       → [Monitor, Writer, Poster]
"research leads for my B2B startup"            → [Researcher, Enricher]
"answer customer support emails"               → [TicketReader, FAQResponder, Escalator]
"I want to grow my business"                   → Clarification
"handle my emails"                             → Clarification
"help me with posting"                         → Clarification (which platform?)
```

**Regression gate:** >5% failure → block merge

### Phase 3 Tests (Gmail + Runtime)

| Test | Method |
|------|--------|
| OAuth flow → token stored encrypted | Integration |
| Expired token → re-auth prompt | Mock |
| 3-agent pipeline: all succeed | Integration |
| 3-agent pipeline: agent 2 fails | Mock |
| Persistence: team survives refresh | E2E |

---

## 13. Open Engineering Questions

1. **LLM structured output** — OpenAI `response_format` vs Anthropic tools. Recommend OpenAI for Phase 1 (more mature structured output).
2. **Background job queue** — In-process `async/await` for MVP. BullMQ + Redis when latency becomes an issue.
3. **Gmail token refresh** — Handle gracefully; if refresh fails, prompt re-auth.
4. **NL ambiguity** — Max 2 clarification rounds, then show a "I couldn't understand" error.
5. **Credential encryption** — AES-256 with a per-user key derived from user secret.

---

## 14. Files Reference

| File | Purpose |
|------|---------|
| `/tmp/gstack-sketch-agentos-v3.html` | Visual wireframe |
| `~/.gstack/projects/joyboy257-agentos/deon-main-design-20260329-140000.md` | Approved design doc |
| `~/.gstack/projects/joyboy257-agentos/deon-main-eng-review-test-plan-20260329.md` | Engineering test plan |
| `/Users/deon/agentos/TODOS.md` | Engineering backlog T1-T17 |
| `/Users/deon/agentos/landing/` | Deployed landing page |
