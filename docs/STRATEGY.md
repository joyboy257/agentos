# AgentOS v3 Strategy

**Version:** 1.1
**Date:** 2026-03-31
**Status:** Living Document

---

## Executive Summary

AgentOS is an **Agent Distribution Environment (ADE)** — infrastructure that makes AI agents accessible to non-technical business users the same way Canva made design accessible to non-designers.

The multi-agent orchestration wave is here. n8n MCP, Stripe Projects, Open WebUI, Ruflo, VS Code agents, Copilot Swarm, OpenAI's Isara investment — all confirm that agents that use tools are being replaced by agents that build and manage other agents. Every existing ADE targets developers. No ADE targets the small business owner who wants an agent that works for them 24/7. That is the opening.

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
| "Did it finish?" | "What's the current status?" |
| You check the output | The agent notifies you when done |
| No compounding memory | Gets smarter over time |

The business value of "I set this up once and it works forever" is categorically different from "I run this task and get a result." Zapier has $600M ARR proving that durable workflow automation is worth paying for. AI agents done right are Zapier + a team of researchers + a writer + an analyst — all in one.

---

## Where We Are

Pre-product v3 MVP.

The v2 docs are archived. v2 had 11 unresolved gaps and was developer-focused. v3 is a complete reset toward non-technical business users as the primary audience.

**What exists today:**
- Landing page deployed at vercel
- Core app scaffold (Next.js, TypeScript)
- Hook system (Units 1–2 complete: registry, types, runner integration)
- Initial agent runtime (`InProcessRunner`) — ephemeral, stateless, in-process
- Basic Gmail and web search tools
- Three architecture docs (capability registry, MCP client, reliability middleware) — foundation layer

**What doesn't exist yet:**
- **Durable agent execution** — state that survives process death, progress that persists, checkpoints that enable resume
- **NL interpretation layer** (plain English → agent graph)
- **Canvas UI** (agent cards, connections, persistent workflow state)
- **Agent scheduler** — cron/trigger configuration for persistent agents
- **Template gallery**
- **Auth (magic link)**

**Critical gap:** The current `InProcessRunner` is fire-and-forget. A server restart mid-run kills all state. This must be replaced with durable execution before the product is shippable.

---

## Where We're Going

**Vision:** The platform where a small business owner hires their first AI employee. They describe what they want — "you handle my inbound customer emails" — and the agent works 24/7, getting smarter over time, escalating only when it genuinely needs a human.

**Three premises that guide every decision:**

1. **Agents are the product** — not a social media tool, not a Google Ads optimizer. AgentOS makes any agent accessible to anyone.

2. **The distribution problem is the real problem** — most people who could benefit don't know what agents are or can't configure them. The gap isn't the agent runtime — it's getting durable, working agents into the hands of non-technical people.

3. **UI/UX is the moat** — not the protocol, not the runtime. The feeling of opening a canvas, seeing your agent team, and understanding that it will work while you sleep.

**ADE redefined:** Agent Distribution Environment — infrastructure that makes AI agents accessible to the masses. The right comparison is not "VS Code for agents." It is "Canva for AI agents."

---

## What We're Building and When

### Phase 1 — Durable Agent MVP

Ship a working platform where a user can **hire an agent once** and have it work continuously. This is not a demo. This is a product.

**Core loop:**
```
User describes what they want
  → Agent is deployed (not just run)
  → Agent works on schedule or webhook
  → User gets notified only when escalation is needed
  → Agent gets better over time via memory
```

**Deliverables:**
1. Landing page — validate demand, collect waitlist emails ✅ deployed
2. **Durable execution infrastructure** — state survives process death, checkpoints enable resume, progress is persistent
3. Agent canvas — renders agent team with durable state, not one-off run
4. **Agent scheduler** — cron-based triggers (daily, hourly, on-event)
5. NL interpretation layer — parses plain English → persistent agent configuration
6. Gmail OAuth integration — email read, draft, send as real tools
7. Hook system — full lifecycle visibility for canvas UI reactivity
8. Auth — magic link email, no passwords

**Phase 1 Templates (all durable, all scheduled):**
- Customer Email Agent — runs daily, handles inbound, escalates what it can't
- Lead Research Agent — runs weekly, updates a lead list continuously
- Customer Support Agent — runs on new ticket, drafts responses, awaits approval

### Phase 2 — Memory + Learning

Agents that remember and improve.

**Deliverables:**
- Working memory (per-session, immediate context)
- Long-term memory (cross-session, learns user preferences over time)
- Approval UX for sensitive escalations
- Template gallery expansion

### Phase 3 — Scale

**Deliverables:**
- More OAuth integrations (Calendar, CRM, Slack)
- Agent marketplace
- Team collaboration (multiple agents working together)
- Mobile experience

---

## What We're NOT Building

Explicit non-goals. These are not accidental omissions — they are deliberate scope boundaries.

**We are NOT building:**
- Developer tools or IDEs
- Code agents or coding assistants
- CLI tools or terminal interfaces
- Agent development frameworks
- General-purpose agent runtimes for developers
- **One-off task runners** (fire-and-forget run-and-done execution)

**On one-off task runners:** This is the critical non-goal. The MVP must not be designed around the "run once, get result, done" model. Every feature must be designed for the "hire once, works forever" model. If it only makes sense as a one-shot execution, it doesn't ship in Phase 1.

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

The pattern is clear: **agents that use tools are being replaced by agents that build and manage other agents.** The infrastructure for this transition is being built — but it's all being built for developers. The business user who could benefit most is still using ChatGPT one prompt at a time, Zapier with no AI, or paying consultants too much for work that could be automated.

**The durable agent insight is the differentiator in the ADE space.** Every competitor builds ephemeral agents. We build persistent agents. That is the Canva moment — when Canva launched, design tools existed. What didn't exist was a tool that non-designers could open and feel like they could use. When we launch, AI agent platforms exist. What doesn't exist is a platform that a small business owner opens and feels like they just hired their first AI employee.

---

## Competitive Positioning

| Product | Target | Durable | Canvas | Runtime | Our Advantage |
|---------|--------|---------|--------|---------|---------------|
| Emdash | Developers | ❌ | ❌ | ✅ | — |
| Glass | Developers | ❌ | ❌ | ❌ | — |
| Collaborator | Developers | ❌ | ✅ | ❌ | — |
| Cling Kanban | Developers | ❌ | ✅ | ❌ | — |
| **AgentOS** | **Everyone else** | **✅** | **✅** | **✅** | **Durable + Canvas + Runtime + Non-technical UX** |

Every existing ADE targets developers. No existing ADE serves the non-technical business user with durable, always-on agents. That's the opening.

---

## The Core Bet: UI/UX Is the Moat

We are not betting on having the best agent runtime. Runtime quality is a commodity — GPT-4o, Claude 3.5, Gemini 2.0 are all good enough. The differentiator is not the model. It is not the protocol.

**It is the experience of opening a canvas, seeing your agent team, and knowing it will work while you sleep.**

Canva didn't win design tools because it had the best rendering engine. It won because opening Canva felt like the first time you opened Photoshop and actually understood what to do. Figma didn't win design tools because it was the only cloud option. It won because collaboration felt natural.

We will win if — and only if — opening AgentOS feels like hiring your first employee. Not configuring a workflow. Not running a task. **Hiring someone who works for you.**

The runtime is infrastructure. The UI is the product.

---

## Durable Execution: The Technical Core

This is the infrastructure bet that makes everything else possible. Without durable execution, every other feature is built on sand.

### The Problem with Fire-and-Forget

Current `InProcessRunner` executes an agent graph and returns. If the process dies at minute 30 of a 45-minute task:

- All state is lost
- The user has no visibility into what happened before the crash
- Re-running the agent starts from scratch — potentially re-sending emails that were already sent
- There is no recovery, no resume, no durability

This is acceptable for a demo. It is not acceptable for a product that users pay for.

### The Durable Agent Model

A durable agent:

1. **Survives process death** — state is stored in Postgres, not memory
2. **Enables resume** — checkpoints allow recovery from the last completed step
3. **Provides progress visibility** — at any moment, you can see where the agent is in its workflow
4. **Handles cancellations gracefully** — stop scheduling new work, don't undo what was already done
5. **Compounds memory** — gets better over time, doesn't relearn everything from scratch each run

### The Infrastructure Requirements

For Phase 1, the durable execution stack:

- **Postgres** — per-agent state, checkpoint log, tool call history
- **BullMQ** — durable job queue with persistence (not in-process async/await)
- **Redis** — pub/sub for real-time progress to canvas
- **Checkpoint system** — each step logged with ULID, agent state serialized at each milestone
- **Idempotency keys** — every mutating tool call has a ULID-based key; re-execution returns cached result

### The State Machine, Not the Loop

Raw LLM agents loop until they decide to stop. This is fundamentally non-durable — you can't checkpoint a loop.

The durable agent is a **state machine with defined transitions**:

- Agent has a current state: `idle | running | waiting_for_approval | paused | completed | failed`
- Transitions are explicit: `start → running`, `running → waiting_for_approval`, `waiting_for_approval → running`
- Each transition is logged as a checkpoint
- The agent doesn't loop arbitrarily — it moves through states until it reaches a terminal state or waits for external input

This is what makes durable agents buildable on top of LLMs. The LLM generates the output at each step. The state machine manages the lifecycle.

### Cancellation and Compensation

**Cancellation is not rollback.** If an agent has sent 5 of 12 emails and you cancel, those 5 emails stay sent. Cancellation means "stop scheduling the remaining 7."

**Compensation is opt-in and explicit.** If the user wants the ability to undo a sent email, that requires a specific "undo" tool that the agent knows how to call — not a general cancellation mechanism.

---

## Phased Delivery Roadmap

### Now → 30 days: Durable Foundation

**Priority 0 — Durability is not optional:**
The MVP cannot ship without durable execution. This must be the first engineering investment.

```
Durable execution infrastructure:
  → BullMQ job queue replaces in-process async/await
  → Postgres checkpoint log (agent_id, step, state, timestamp)
  → Idempotency keys on all mutating tool calls
  → Redis pub/sub for real-time canvas updates
  → State machine transitions replace raw LLM loops
```

**Key milestones:**
- [ ] BullMQ queue wired to runner (TBD — new unit)
- [ ] Postgres checkpoint system for agent state persistence
- [ ] Idempotency on gmail.send, gmail.read, web.search
- [ ] State machine runner (idle → running → waiting → completed/failed)
- [ ] Canvas shows persistent agent status (not one-shot run status)

### 30 → 60 days: NL Canvas + Scheduler

```
User opens canvas
  → Types "I want an agent that handles my customer emails daily"
  → NL layer parses to durable agent config
  → Canvas shows agent card with schedule: "Runs daily at 9am"
  → Agent deployed, begins execution
  → Canvas shows: "Last ran 9:01am — 12 emails processed"
```

**Key milestones:**
- [ ] NL interpretation layer working
- [ ] Agent scheduler (cron configuration) wired to BullMQ
- [ ] Canvas persistent state (agent remembers what it did)
- [ ] Gmail OAuth connected end-to-end
- [ ] Escalation modal for human approval

### 60 → 90 days: Memory + First Users

```
Agent remembers: "User prefers short, direct emails"
Agent has run 30 times — user hasn't had to intervene once
Agent encounters new escalation → user approves → agent learns
```

**Key milestones:**
- [ ] Working memory (per-session context injection)
- [ ] Long-term memory (cross-session preference learning)
- [ ] Template gallery with 3 durable templates
- [ ] Magic link auth
- [ ] Invite early users from waitlist

### 90+ days: Expand Reach

- [ ] Additional OAuth integrations (Calendar, CRM, Slack)
- [ ] Community template sharing
- [ ] Agent marketplace
- [ ] Multi-agent collaboration (agents that delegate to other agents)

---

## Key Decisions and Rationale

**Decision: Target non-technical business users, not developers.**
Rationale: Every existing ADE competes for developers. Non-technical users are the underserved majority and the path to scale.

**Decision: Durable agents, not one-off runners.**
Rationale: "Hire once, works forever" is categorically more valuable than "run once, get result." The business model depends on persistent value, not repeated manual triggering.

**Decision: Canvas-first, not chat-first.**
Rationale: Visual handoffs are comprehensible to non-technical users. A graph of cards with arrows is immediately understandable. "Hire an agent" feels like adding a team member, not submitting a form.

**Decision: Plain English input, not structured syntax.**
Rationale: The target user doesn't know what a cron expression is. "Run every morning at 9am" is the interface.

**Decision: BullMQ + Postgres for durability, not in-process execution.**
Rationale: In-process async/await cannot survive process death. BullMQ jobs with Postgres persistence enable resume. This is not premature optimization — it is the difference between a product and a demo.

**Decision: State machine over raw LLM loop.**
Rationale: Durable execution requires checkpointing. You can only checkpoint what has defined states. A raw LLM loop has no defined states — you can't resume from "somewhere in the middle of thinking." State machines make durability tractable.

**Decision: Idempotent tool calls as the default.**
Rationale: Resume + retry = double-execution risk. Every mutating tool call must be idempotent or use an idempotency key. This is a correctness requirement, not a nice-to-have.

---

## Success Metrics

**Phase 1 MVP:**
- An agent can survive a server restart mid-task and resume from last checkpoint
- User can see agent status at any time (not just during active run)
- User sets up an agent in < 5 minutes via plain English
- Agent runs on schedule without user triggering manually
- At least 3 templates working end-to-end with durable execution

**Post-MVP:**
- Agents run unattended for 7+ days without failure
- User escalation rate < 5% of agent runs (agent handles 95%+ autonomously)
- Agent completion rate > 90% (of scheduled runs, how many complete successfully)
- User reported comprehension score — does the user understand what their agent is doing?
- NPS / satisfaction — would the user recommend AgentOS to another small business owner?

---

## Risks and Mitigations

**Risk: BullMQ/Redis complexity is too high for MVP timeline.**
Mitigation: If the full stack is too much for Phase 1, use Postgres-only durability with a simple polling mechanism. Redis pub/sub is replaceable with SSE polling. BullMQ is the one that can't be deferred — in-process execution fundamentally cannot be made durable without it.

**Risk: Non-technical users don't trust agent outputs without reviewing every step.**
Mitigation: Human-in-the-loop approval for sensitive tools (email send). Escalation modal shows reasoning trace. Over time, the agent earns trust by demonstrating good judgment.

**Risk: LLM generates infinite loops in state machine.**
Mitigation: Per-agent step count limit with hard circuit breaker. Per-run token budget cap. If agent exceeds either, it pauses and alerts the user.

**Risk: Developer-focused competitors expand to non-technical users.**
Mitigation: Move fast. The durable agent insight is not yet widely held. First mover advantage in the non-technical ADE space compounds — once users have agents configured and running, switching costs are real.

**Risk: The "hire an agent" model requires too much user trust to get early adopters.**
Mitigation: Start with low-stakes workflows (email research, lead enrichment) before graduating to high-stakes (sending emails on behalf of the user). Let trust build through demonstrated competence.

---

## Open Questions

**Resolved:**
- Target audience: Non-technical business users ✅
- Core bet: UI/UX is the moat, durable agents are the product ✅
- Interface mode: Canvas-first, NL input ✅
- MVP priority: Durable execution first, not last ✅
- Phase 1 tools: Gmail + Web search ✅
- Phase 1 auth: Magic link ✅
- Execution model: State machine with checkpoints, not raw LLM loop ✅

**Deferred to Phase 2:**
- Mobile native app vs. responsive web?
- Team collaboration (multiple users on same agent team)?
- Agent marketplace or only curated templates?
- Pricing model (per-agent, per-run, per-user, freemium)?
- How does the user onboard when their first agent "just works" — is there a setup wizard?

---

## Sources

- SPEC.md — AgentOS v3 product & technical specification
- README.md — AgentOS strategic positioning and competitive landscape
- docs/plans/2026-03-30-001-feat-agentos-v3-nl-canvas-mvp-plan.md — MVP implementation plan
- docs/plans/2026-03-31-003-feat-agentos-working-memory-plan.md — Working memory spec
- docs/plans/2026-03-31-004-feat-agentos-longterm-memory-microservice-plan.md — Long-term memory spec
- docs/brainstorms/2026-03-30-agentos-v3-nl-canvas-requirements.md — NL layer requirements
- docs/ARCHITECTURE-01-capability-registry.md through ARCHITECTURE-05-reasoning-trace.md — foundational architecture
