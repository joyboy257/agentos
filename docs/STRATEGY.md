# AgentOS v3 Strategy

**Version:** 2.0
**Date:** 2026-03-31
**Status:** Living Document

---

## Executive Summary

AgentOS is an **Agent Distribution Environment (ADE)** — infrastructure that makes AI agents accessible to non-technical business users the same way Canva made design accessible to non-designers.

The multi-agent orchestration wave is accelerating. n8n MCP, Stripe Projects, Open WebUI, Ruflo, VS Code agents, Copilot Swarm, OpenAI's Isara investment — all confirm that agents that use tools are being replaced by agents that build and manage other agents. Every existing ADE targets developers. No ADE targets the small business owner who wants an agent that works for them 24/7, indefinitely. That is the opening.

**The core reframe:** You don't run an agent. You **hire** an agent. Tell it what to do once. It works every day.

**The core bet:** UI/UX is the moat — not the runtime, not the protocol. Canva-level usability for AI agents that work while you sleep.

---

## The Fundamental Insight

Most AI platforms treat agents as **one-off task runners**. User submits a prompt. Agent executes. Done. If you want it again tomorrow, you run it again.

The business user doesn't want that. They want to **hire an agent once** — "you handle my inbound customer emails" — and have it work 24/7, forever, asking for help only when it genuinely needs a human decision. The agent is an always-on worker, not a button you press.

This changes the entire product:

| One-off Agent | Always-On Agent |
|--------------|-----------------|
| Triggered manually | Runs on schedule or webhook |
| Stateless between runs | Stateful — remembers past work |
| User is the scheduler | Agent manages its own workflow |
| "Did it finish?" | "What's my agent doing right now?" |
| You check the output | The agent notifies you when done |
| No compounding memory | Gets smarter over time |

The business value of "I set this up once and it works forever" is categorically different from "I run this task and get a result." Zapier has $600M ARR proving that durable workflow automation is worth paying for. AI agents done right are Zapier + a team of researchers + a writer + an analyst — all in one.

**The AHA moment** feels like hiring someone. Not configuring a workflow. Not running a task. Hiring someone who works for you.

---

## Where We Are

Pre-product v3 MVP.

v2 docs are archived. v2 had 11 unresolved gaps and was developer-focused. v3 is a complete reset toward non-technical business users as the primary audience.

**What exists today:**
- Landing page deployed at vercel
- Core app scaffold (Next.js, TypeScript)
- Hook system (Units 1–2: registry, types, runner integration)
- Initial agent runtime (`InProcessRunner`) — ephemeral, stateless, in-process
- Basic Gmail and web search tools
- Five architecture docs (capability registry, MCP client, reliability middleware, human approval UX, reasoning trace) — foundation layer
- Hook-based event system for canvas reactivity

**What doesn't exist yet:**
- **Durable agent execution** — state that survives process death, checkpoints enable resume
- **Heartbeat scheduler** — agents that wake on cron, check for work, act, then sleep
- **NL interpretation layer** (plain English → persistent agent configuration)
- **Canvas UI** redesigned as a team dashboard (org chart metaphor, not pipeline visualizer)
- **Template gallery** — pre-configured agents the user can hire in one click
- **Auth** — magic link email, no passwords
- **Escalation UX** — two-tier: action approval modal + agent governance board

**Critical gap:** The current `InProcessRunner` is fire-and-forget. A server restart mid-run kills all state. This is the first engineering investment.

---

## Where We're Going

**Vision:** The platform where a small business owner hires their first AI employee. They describe what they want — "you handle my inbound customer emails" — and the agent works 24/7, getting smarter over time, escalating only when it genuinely needs a human.

**Three premises:**

1. **Agents are the product** — not a social media tool, not a Google Ads optimizer. AgentOS makes any agent accessible to anyone.

2. **The distribution problem is the real problem** — most people who could benefit don't know what agents are or can't configure them. The gap isn't the agent runtime — it's getting durable, working agents into the hands of non-technical people.

3. **UI/UX is the moat** — not the protocol, not the runtime. The feeling of opening a canvas, seeing your agent team, and knowing it will work while you sleep.

**ADE redefined:** Agent Distribution Environment — infrastructure that makes AI agents accessible to the masses. The right comparison is not "VS Code for agents." It is **"Canva for AI agents."**

---

## What We're Building and When

### Phase 1 — Durable Agent MVP

Ship a working platform where a user can **hire an agent once** and have it work continuously. This is not a demo. This is a product.

**Core loop:**
```
User describes what they want
  → Agent is deployed (not just run)
  → Agent wakes on heartbeat schedule, checks for work
  → Acts autonomously, escalates what it can't handle
  → User gets notified only when escalation is needed
  → Agent gets better over time via memory
```

**Deliverables:**
1. Landing page — validate demand, collect waitlist emails ✅ deployed
2. **Durable execution infrastructure** — BullMQ + Postgres, state survives process death, checkpoints enable resume
3. **Heartbeat scheduler** — agents wake on cron, check work, act, sleep
4. **Agent canvas redesigned as team dashboard** — org chart layout, agent cards with status, next scheduled heartbeat, last ran
5. **NL interpretation layer** — parses plain English → persistent agent config with heartbeat schedule
6. **Two-tier escalation UX** — action approval modal + agent governance board
7. **Resource budgets** — per-agent attention/compute budgets with visual bars
8. **Gmail OAuth integration** — email read, draft, send as real tools
9. **Activity log** — ticket-based, searchable, filterable, timeline view
10. Auth — magic link email, no passwords

**Phase 1 Templates (all durable, all scheduled):**
- Customer Email Agent — wakes daily, handles inbound, escalates what it can't
- Lead Research Agent — wakes weekly, updates a lead list continuously
- Customer Support Agent — wakes on new ticket, drafts responses, awaits approval

### Phase 2 — Memory + Learning

Agents that remember and improve.

**Deliverables:**
- Working memory (per-session, immediate context)
- Long-term memory (cross-session, learns user preferences over time)
- Approval UX hardening for escalation chains
- Template gallery expansion (6–10 templates)
- Multi-agent delegation (agents that hand off to other agents)

### Phase 3 — Scale

**Deliverables:**
- More OAuth integrations (Calendar, CRM, Slack)
- Agent marketplace
- Team collaboration (multiple users on same agent team)
- Mobile experience

---

## What We're NOT Building

Explicit non-goals. These are deliberate scope boundaries.

**We are NOT building:**
- Developer tools or IDEs
- Code agents or coding assistants
- CLI tools or terminal interfaces
- Agent development frameworks
- General-purpose agent runtimes for developers
- **One-off task runners** (fire-and-forget run-and-done execution)

**On one-off task runners:** This is the critical non-goal. The MVP must not be designed around "run once, get result, done." Every feature must be designed for "hire once, works forever." If it only makes sense as a one-shot execution, it doesn't ship in Phase 1.

---

## Why Now

The multi-agent orchestration wave is accelerating. Evidence:

- **n8n MCP** — workflow automation adding MCP for multi-agent coordination
- **Stripe Projects** — project management integrating agent orchestration
- **Open WebUI** — local AI interface adding multi-agent support
- **Ruflo** — new entrant focused on AI agent management
- **VS Code agents** — Microsoft embedding agent orchestration into the world's most popular IDE
- **Copilot Swarm** — Microsoft's multi-agent research into coordinated AI agents
- **OpenAI Isara investment** — $40M+ bet that agents building and managing other agents is the next platform shift
- **Paperclip AI** — open-source "zero-human company" orchestration with heartbeats, org charts, cost budgets

The pattern: **agents that use tools are being replaced by agents that build and manage other agents.** The infrastructure is being built for developers. The business user who could benefit most is still using ChatGPT one prompt at a time, Zapier with no AI, or paying consultants too much for work that could be automated.

**The durable agent insight is the differentiator.** Every competitor builds ephemeral agents. We build persistent agents. That is the Canva moment. When Canva launched, design tools existed. What didn't exist was a tool non-designers could open and feel like they could use. When we launch, AI agent platforms exist. What doesn't exist is a platform a small business owner opens and feels like they just hired their first AI employee.

---

## Competitive Positioning

| Product | Target | Durable | Heartbeats | Canvas | Org Chart | Our Advantage |
|---------|--------|---------|-----------|--------|---------|---------------|
| Emdash | Developers | ❌ | ❌ | ❌ | ❌ | — |
| Glass | Developers | ❌ | ❌ | ❌ | ❌ | — |
| Collaborator | Developers | ❌ | ❌ | ✅ | ❌ | — |
| Cling Kanban | Developers | ❌ | ❌ | ✅ | ❌ | — |
| Paperclip | AI builders | ✅ | ✅ | ✅ | ✅ | Heartbeats, cost budgets, board governance |
| **AgentOS** | **Everyone else** | **✅** | **Planned** | **✅** | **Planned** | **Durable + Heartbeats + Org Chart + Canva-level UX** |

Every existing ADE targets developers. No existing ADE serves the non-technical business user with durable, always-on agents. Paperclip is the closest competitive threat — but they target AI company builders who want CLI-first control. AgentOS's moat is making the same capabilities accessible through visual simplicity and natural language.

---

## The Core Bet: UI/UX Is the Moat

We are not betting on having the best agent runtime. Runtime quality is a commodity — GPT-4o, Claude 3.5, Gemini 2.0 are all good enough. The differentiator is not the model. It is not the protocol.

**It is the experience of opening a canvas, seeing your agent team, and knowing it will work while you sleep.**

Paperclip's heartbeat timeline and org chart UI validate the visual metaphor. Canva didn't win design tools because it had the best rendering engine. Figma didn't win because it was the only cloud option. We win if — and only if — opening AgentOS feels like hiring your first employee.

The runtime is infrastructure. The UI is the product.

---

## Product Design: The Adaptive Abstraction Ladder

Users have different comfort levels with control. The system must support four layers of user control without overwhelming anyone:

**Layer 1 — Pure Intent**
"I want an agent that handles my customer emails."
The system infers everything: schedule, tools, escalation policy, resource budgets. The user expresses only the outcome they want.

**Layer 2 — Agent-Level**
"You handle my emails. Run every morning at 9am. Use Gmail."
The user sets schedule and tool access. The system manages escalation and execution.

**Layer 3 — Escalation Policy**
"You handle my emails. Run every morning at 9am. CC me on anything going to executives."
The user sets schedule, tools, and escalation rules. The system executes within those guardrails.

**Layer 4 — Per-Action Control**
"Before sending any email, show me what you're going to say."
The user reviews every action before execution. Maximum control, maximum friction.

The user chooses their layer. The system defaults to Layer 1 for new users. The system flags conflicts when lower-layer settings contradict higher-layer stated goals ("you said handle my emails autonomously but you're reviewing every send").

---

## Durable Execution: The Technical Core

### The Heartbeat Model

Paperclip validates this: agents are **not** continuous loops. They are **always-on workers** that wake on a heartbeat schedule:

```
Heartbeat fires (every 15 min / hourly / daily)
  → Agent checks: is there new work?
  → If yes: agent executes a bounded task
  → Agent completes or escalates
  → Agent sleeps until next heartbeat
```

This is comprehensible to non-technical users. It is also durable — each heartbeat is a discrete, checkpointable unit of work.

### The State Machine

The durable agent moves through defined states — not an arbitrary LLM loop:

- `idle` — no work scheduled, waiting for next heartbeat
- `running` — executing a bounded task
- `waiting_for_approval` — paused, awaiting human decision
- `paused` — user-paused or budget-exceeded
- `completed` — task done successfully
- `failed` — task failed with error

Each transition is logged as a checkpoint. If the process dies mid-run, the agent resumes from the last checkpoint on the next heartbeat.

### Infrastructure Stack

- **Postgres** — per-agent state, checkpoint log, tool call history, idempotency keys
- **BullMQ** — durable job queue with persistence
- **Redis** — pub/sub for real-time canvas updates (SSE fallback: polling)
- **Idempotency keys** — every mutating tool call has a ULID-based key; re-execution returns cached result

### Cancellation Is Not Rollback

If an agent has sent 5 of 12 emails and you cancel, those 5 emails stay sent. Cancellation means "stop scheduling the remaining 7." This is a user education requirement.

---

## Phased Delivery Roadmap

### Now → 30 days: Durable Foundation

**Priority 0:** Durability is not optional.

```
Durable execution infrastructure:
  → BullMQ job queue replaces in-process async/await
  → Postgres checkpoint log (agent_id, step, state, timestamp)
  → Idempotency keys on gmail.send, gmail.read, web.search
  → Redis pub/sub for real-time canvas updates
  → State machine transitions replace raw LLM loops
  → Heartbeat scheduler wired to BullMQ
```

**Key milestones:**
- [ ] BullMQ queue wired to runner
- [ ] Postgres checkpoint system for agent state persistence
- [ ] Idempotency on mutating tool calls
- [ ] State machine runner (idle → running → waiting → completed/failed)
- [ ] Agent survives server restart mid-task and resumes

### 30 → 60 days: Canvas + Scheduler

```
User opens canvas
  → Types "I want an agent that handles my customer emails daily"
  → NL layer parses to durable agent config with heartbeat schedule
  → Canvas shows agent card: role, schedule, resource budget
  → Agent card shows: "Next wake: 9:00am tomorrow"
  → User clicks Activate — agent is hired, not just run
  → Canvas shows: "Last woke 9:01am — 12 emails processed"
```

**Key milestones:**
- [ ] NL interpretation layer → persistent agent config
- [ ] Agent heartbeat schedule configurable via NL ("daily at 9am")
- [ ] Canvas redesigned as team dashboard (org chart layout)
- [ ] Agent cards show: status, next heartbeat, last ran
- [ ] Gmail OAuth connected end-to-end
- [ ] Two-tier escalation: action modal + governance board
- [ ] Resource budget UI (attention/compute bars)

### 60 → 90 days: Memory + First Users

```
Agent remembers: "User prefers short, direct emails"
Agent has run 30 times — user hasn't had to intervene once
Agent encounters new escalation → user approves → agent learns
```

**Key milestones:**
- [ ] Working memory (per-session context injection)
- [ ] Long-term memory (cross-session preference learning via mem0.ai)
- [ ] Activity log: ticket-based, searchable, timeline view
- [ ] Template gallery with 3 durable templates
- [ ] Magic link auth
- [ ] Invite early users from waitlist

### 90+ days: Expand Reach

- [ ] Additional OAuth integrations (Calendar, CRM, Slack)
- [ ] Community template sharing
- [ ] Agent marketplace
- [ ] Multi-agent delegation (agents that delegate to other agents)
- [ ] Mobile experience

---

## Key Decisions and Rationale

**Decision: Target non-technical business users, not developers.**
Every existing ADE competes for developers. Non-technical users are the underserved majority and the path to scale.

**Decision: Durable agents, not one-off runners.**
"Hire once, works forever" is categorically more valuable than "run once, get result." The business model depends on persistent value.

**Decision: Heartbeat model for always-on execution.**
Agents wake on schedule, check work, act, then sleep. Discrete, comprehensible, checkpointable units. Not a continuous LLM loop.

**Decision: Canvas-first as team dashboard, not pipeline visualizer.**
Org chart layout — agents have reporting lines, status indicators, resource budgets. Non-technical users understand org charts from their own companies.

**Decision: Two-tier escalation.**
Action-level (inline modal for dangerous tools) vs. agent-level (governance board for creating agents, changing budgets). Different stakes deserve different UX.

**Decision: Adaptive abstraction ladder.**
Four layers from pure intent to per-action control. User chooses their layer. System flags conflicts between layers.

**Decision: Plain English input, not structured syntax.**
The target user doesn't know what a cron expression is. "Run every morning at 9am" is the interface.

**Decision: BullMQ + Postgres for durability, not in-process execution.**
In-process async/await cannot survive process death. BullMQ jobs with Postgres persistence enable resume. Not premature optimization — the difference between a product and a demo.

**Decision: Idempotent tool calls as the default.**
Resume + retry = double-execution risk. Every mutating tool call must be idempotent or use an idempotency key. Correctness requirement.

---

## Success Metrics

**Phase 1 MVP:**
- An agent survives a server restart mid-task and resumes from last checkpoint
- User sees agent status at any time (not just during active run)
- User sets up an agent in < 5 minutes via plain English
- Agent wakes on schedule without user triggering manually
- At least 3 templates working end-to-end with durable execution
- waiting_for_approval state surfaces as a notification within 10 seconds

**Post-MVP:**
- Agents run unattended for 7+ days without failure
- User escalation rate < 5% of agent runs (agent handles 95%+ autonomously)
- Agent completion rate > 90% (of scheduled runs, how many complete successfully)
- User comprehension score: non-technical user understands what their agent is doing without reading docs
- NPS / satisfaction: would the user recommend AgentOS to another small business owner?

---

## Risks and Mitigations

**Risk: BullMQ/Redis complexity is too high for MVP timeline.**
Mitigation: Postgres-only durability with simple polling is the fallback. Redis pub/sub is replaceable with SSE polling. BullMQ is required — in-process execution cannot be made durable without it.

**Risk: Non-technical users don't trust agent outputs without reviewing every step.**
Mitigation: Start with low-stakes workflows (email research, lead enrichment) before high-stakes (sending emails). Human-in-the-loop for sensitive tools. Trust builds through demonstrated competence.

**Risk: LLM generates infinite loops.**
Mitigation: Per-agent step count limit with hard circuit breaker. Per-run token budget cap. If exceeded, agent pauses and alerts user.

**Risk: Developer-focused competitors expand to non-technical users.**
Mitigation: Move fast. First mover advantage in non-technical ADE space compounds — once users have agents running, switching costs are real.

**Risk: "Hire an agent" model requires too much trust for early adopters.**
Mitigation: Start low-stakes. Let demonstrated competence build trust over time.

---

## Open Questions

**Resolved:**
- Target audience: Non-technical business users ✅
- Core bet: UI/UX is the moat, durable agents are the product ✅
- Interface mode: Canvas-first team dashboard, NL input ✅
- MVP priority: Durable execution first ✅
- Phase 1 tools: Gmail + Web search ✅
- Phase 1 auth: Magic link ✅
- Execution model: State machine with heartbeats, not raw LLM loop ✅
- Heartbeat model: Agents wake on schedule, act, sleep ✅
- Org chart layout: Agents as team members with hierarchy ✅

**Deferred to Phase 2:**
- Mobile native app vs. responsive web?
- Team collaboration (multiple users on same agent team)?
- Agent marketplace or only curated templates?
- Pricing model (per-agent, per-run, per-user, freemium)?
- Notification delivery: in-app only? Email? SMS?
- Activity log retention: how far back? Privacy implications?

---

## Sources

- SPEC.md — AgentOS v3 product & technical specification
- README.md — AgentOS strategic positioning and competitive landscape
- docs/paperclip-assessment.md — Paperclip AI competitive analysis
- docs/brainstorms/2026-03-31-durable-agents-product-requirements.md — durable agents product requirements
- docs/plans/2026-03-30-001-feat-agentos-v3-nl-canvas-mvp-plan.md — MVP implementation plan
- docs/plans/2026-03-31-003-feat-agentos-working-memory-plan.md — working memory spec
- docs/plans/2026-03-31-004-feat-agentos-longterm-memory-microservice-plan.md — long-term memory spec
- docs/ARCHITECTURE-01-capability-registry.md through ARCHITECTURE-05-reasoning-trace.md — foundational architecture
