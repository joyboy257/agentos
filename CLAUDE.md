# AgentOS — Developer Context

## What is AgentOS?

AgentOS is a **world-class agent harness** with **Canva-level UX for non-technical business users**.

**The product:** "Hire an AI employee. It works while you sleep."

**Core reframe (v4):**
- The product is a **harness**, not an email agent or a workflow builder
- The engineering substrate is world-class (durable execution, streaming tool execution, checkpoint/resume, typed exit reasons)
- The UX is the moat — Anthropic will never build for Maria; we will
- "Canva for AI agents" — not "VS Code for agents"

**Target users:** Maria (HVAC company owner, 44, non-technical), James (marketing manager, 31, non-technical). NOT developers.

---

## The Real Product

A visual platform for **hiring, managing, and trusting AI employee teams**.

Not a configuration screen. Not a workflow canvas. A **team dashboard** where Maria opens the app, sees her agents working, and feels the same confidence she'd feel seeing her office staff doing their jobs.

The AHA moment: Maria hired an agent Monday. Tuesday she woke up to "Agent handled 3 emails while you slept." She didn't have to check. The agent just worked.

---

## Competitive Landscape (v4)

| Product | Target | Durable | Always-On | Visual | Maria? |
|---------|--------|---------|-----------|--------|--------|
| Zapier | Everyone | ❌ | ❌ | ❌ | ❌ |
| AgentGPT | Developers | ❌ | ❌ | ❌ | ❌ |
| n8n | Developers | ✅ | ❌ | ✅ | ❌ |
| **AgentOS** | **Maria** | **✅** | **✅** | **✅** | **✅** |

**Key insight:** No existing product gives Maria a persistent, memory-enabled AI employee she can hire in 5 minutes and trust to work while she sleeps. That's the opening.

---

## The Three Premises

1. **Agents are employees, not pipelines** — not a workflow, not a task runner — a worker with memory, judgment, and schedule
2. **The distribution problem is the real problem** — most people who could benefit don't know what agents are; Anthropic's Claude Code proves the technical direction; we win on UX for non-technical users
3. **UI/UX is the moat** — Anthropic is a model company, not a product company; they will never build for Maria; we will

---

## Current Status

- **Stage:** Pre-product MVP (v4)
- **PRD:** `docs/PRD.md` (v4) — source of truth for product direction
- **Phase 1:** MVP — prove the thesis (Days 0–90)
- **Phase 2:** Differentiate — build the moat (Days 90–180)
- **Phase 3:** Scale — team + enterprise (Days 180–270)
- **Archived v3 work:** `docs/archived/v3/`

---

## MVP Scope (Phase 1)

Prove the thesis: *a non-technical user can hire a persistent, durable AI employee in under 5 minutes and trust it to work.*

Features shipping in MVP:
- Canvas team dashboard (org chart, not flowchart)
- NL-to-agent deployment (type goal → preview → activate)
- Gmail OAuth (read + compose + send)
- Durable execution (BullMQ + Postgres checkpoints; survives server restarts)
- Real-time reasoning traces (streaming tool execution; Maria watches agent think)
- Escalation modal (Approve / Edit / Skip / Cancel)
- Agent card (status, last run, next wake, budget bar)
- Activity log (searchable tickets, 90-day retention)
- Magic link auth
- Push notifications (escalations reach Maria immediately)

**NOT in MVP:** Template gallery (1 email handler only), multi-agent, long-term memory, PROACTIVE, Calendar, HubSpot, governance board, auto-pause, skills directory.

---

## Engineering Substrate (from Claude Code patterns)

These are the patterns that make AgentOS genuinely world-class — not features Maria sees, but the engineering that makes the product feel reliable:

- **Streaming tool execution** — tools fire as agent reasons; Gmail read parallel, Gmail send serial
- **Durable execution** — typed exit reasons (`completed|escalated|budget_exceeded`), checkpoint/resume
- **Permission auto-approval** — Phase 2; routine actions auto-execute; confidence thresholds gate escalation
- **Checkpointing** — every state transition logged to Postgres; server restart survival
- **Idempotency** — ULID-based keys per tool call; no duplicate executions

---

## Key Directories

- `docs/` — PRD, plans, specs
- `docs/archived/v3/` — superseded v3 work
- `app/` — Next.js application
- `landing/` — Marketing landing page

## Architecture Notes

- Next.js app (app/)
- BullMQ for scheduling
- Postgres for state (agents, runs, checkpoints, tickets)
- SSE for real-time reasoning traces
- Vercel for deployment

---

## Deploy Configuration

| Project | Local Path | Vercel Project |
|---------|------------|----------------|
| Landing page | `/Users/deon/agentos/landing/` | vercel.com/project/landing |
| App | `/Users/deon/agentos/app/` | vercel.com/project/agentos-app |

### Deploy Instructions

**Landing:**
```bash
cd /Users/deon/agentos/landing && vercel --prod
```

**App:**
```bash
cd /Users/deon/agentos/app && vercel --prod
```

**Important:** Root `/Users/deon/agentos/` has no package.json. Build from subdirectories only.

---

## Design Principles

- **Hire, don't configure** — "Activate" not "Run"; agents are employees, not pipelines
- **Show the reasoning** — real-time traces, not spinners; Maria watches her agent think
- **Non-technical first** — no jargon, no JSON, no terminals
- **Escalation is a feature** — the agent asking for help builds trust, not frustration
- **Trust is earned** — start with low-stakes; let the agent prove itself before escalating autonomy

---

## Pricing (Target)

| Plan | Price | Agents | Key Features |
|------|-------|--------|---------------|
| Starter | $99/mo | 1 | MVP features, Gmail only |
| Professional | $249/mo | 3 | + Calendar, Phase 2 features |
| Business | $499/mo | 5 | + PROACTIVE, memory |
| Team | $999/mo | Unlimited | + Multi-user, HubSpot, Phase 3 |

Maria's ROI: $2,000/mo VA → $199/mo AgentOS agent. 10x cheaper. Works while she sleeps. That's the business.
