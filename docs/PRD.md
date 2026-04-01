# AgentOS v4 — Product Requirements Document

**Version:** 4.0
**Date:** 2026-04-01
**Status:** Active — Source of Truth
**Classification:** Product — Internal

---

## Table of Contents

1. [Vision](#1-vision)
2. [Target Users](#2-target-users)
3. [The Real Product](#3-the-real-product)
4. [What We Are NOT Building](#4-what-we-are-not-building)
5. [Core Product Concept](#5-core-product-concept)
6. [The MVP](#6-the-mvp)
7. [UX Specifications](#7-ux-specifications)
8. [Technical Architecture](#8-technical-architecture)
9. [Phased Roadmap](#9-phased-roadmap)
10. [Business Model](#10-business-model)
11. [Success Metrics](#11-success-metrics)
12. [Document Roadmap](#12-document-roadmap)

---

## 1. Vision

**"Hire an AI employee. It works while you sleep."**

AgentOS is a **world-class agent harness** — not a workflow tool, not a task runner, not a pipeline builder — with **Canva-level UX for non-technical business users**.

The comparison is not "Claude Code for business." It's **"Canva for AI agents."**

- Claude Code is for developers who live in terminals and understand agents
- AgentOS is for small business owners who have never built an automation and don't want to

**The competitive insight:** Anthropic accidentally leaked their Claude Code source in March 2026. This gave us the engineering blueprint for world-class agent infrastructure — durable execution, streaming tool execution, permission auto-approval, multi-agent orchestration, context compaction. We can build the harness. Anthropic will never build the UX for Maria.

**The real competitive window:** 6-12 months before Anthropic or a well-funded competitor figures out what we're doing and builds it for this audience. We use that window to establish product-market fit, get vertical templates live (HVAC, legal, real estate), and build the trust moat that comes from Maria's agents having worked for her for months.

---

## 2. Target Users

### Primary Persona: Maria

**Age:** 44 | **Role:** Owns a 12-person HVAC company
**Tech:** QuickBooks, Gmail, LinkedIn. Has never built an automation. Used Zapier once, got confused.
**Pain:** 6 hours/week on email triage. Misses leads. Pays $2,000/month for a VA who checks email once a day.
**Wants:** "I want someone to handle the emails I don't have time for. I want to approve the important ones and let the rest go."
**Right now:** Her VA doesn't work while Maria sleeps. A lead at 10pm gets a response at 9am. That's a lost job.

### Secondary Persona: James

**Age:** 31 | **Role:** Marketing manager at a 50-person e-commerce brand
**Tech:** HubSpot, Slack, Notion. Has tried Make.com. Shipped one AgentGPT workflow that didn't stick.
**Pain:** Competitive analysis takes 4 hours every Monday. Social media monitoring is manual.
**Wants:** "I want a marketing team that never sleeps. Research on competitors every week. Content drafts daily. I review and approve."

### The Distinction That Matters

Maria and James are both non-technical business users. But:

- Maria needs **one agent that works always-on** and handles her email flood
- James needs **a team of agents** that coordinate (research → draft → review)

The MVP serves Maria. Phase 2 serves James.

---

## 3. The Real Product

### What AgentOS Actually Is

**A visual platform for hiring, managing, and trusting AI employee teams.**

Not a configuration screen. Not a workflow canvas. Not a pipeline builder. A **team dashboard** where Maria opens the app, sees her agents working, and feels the same confidence she'd feel seeing her office staff doing their jobs.

The harness is the engineering foundation (reverse-engineered from Claude Code). The UX is the moat.

### The Five Pillars

1. **NL-to-Deployment** — Describe what you want in plain English. Watch your agent team get built in real time. No config files. No JSON. No agents-understand.

2. **Visual Agent Harness** — A canvas that shows agent teams as an org chart with live status, reasoning traces, and memory state. Maria sees what her agents are doing right now — not a log file.

3. **Durable Execution** — Agents that survive server restarts, checkpoint their progress, and resume from where they left off. This is the engineering moat from Claude Code patterns. It makes agents feel like employees, not scripts.

4. **Persistent Memory + Judgment** — Agents that remember what happened last week, learn from Maria's approval patterns, and only escalate what genuinely needs human input. Not stateless pipelines.

5. **Business Data Access** — OAuth connections to Gmail, Calendar, HubSpot. Agents that can actually do the work, not just draft responses.

### What Makes It World-Class (from Claude Code Leak)

These are the engineering patterns we reverse-engineered and will implement:

| Claude Code Pattern | AgentOS Implementation |
|--------------------|----------------------|
| Streaming tool execution | Tools fire as agent reasons — Maria sees "Reading inbox..." before full response |
| Permission auto-approval | Routine actions auto-execute; only unusual ones escalate |
| Fork + sidechain multi-agent | Coordinator spawns parallel workers; each has isolated transcript |
| Context compaction | Long agent sessions don't hit token limits; old context is summarized |
| Typed exit reasons | Agent run ends with `completed\|escalated\|budget_exceeded` — not ambiguous |
| Checkpoint + resume | Server restarts don't kill in-flight work |
| Heartbeat scheduler | PROACTIVE agents wake on interval, check for urgent work |
| Dream consolidation | KAIROS: between heartbeats, agent processes and refines memory |

These are not features. They are the **engineering substrate** that makes the product work. Maria never sees "checkpoint resume" — she sees her agent working reliably and never losing context. That is the product.

---

## 4. What We Are NOT Building

**Not a workflow tool.** Zapier, Make, n8n are workflow builders. You drag steps, connect triggers, run the pipeline. Every run starts fresh. Nothing persists. Nothing learns.

**Not a chat interface.** ChatGPT, Claude.ai are conversation tools. You type, it responds, done. The context is the conversation. There's no persistent worker.

**Not a developer tool.** Claude Code, Copilot, Devin are for engineers. They assume technical literacy. AgentOS assumes none.

**Not "an email agent."** An email agent is a template. The product is the harness. The template is the first thing Maria puts in the harness. The harness is the moat.

**Not Phase 2, Phase 1.5, and Phase 2.** The phased roadmap is: MVP, Differentiate, Scale. No suffixes. No confusion.

---

## 5. Core Product Concept

### The Hiring Metaphor

You don't run an agent. You **hire** one.

| Traditional Automation | AgentOS |
|----------------------|---------|
| You configure a workflow | You describe a worker |
| The workflow runs when triggered | The agent works on a schedule + proactively |
| Every run starts fresh | The agent remembers previous sessions |
| You check the output | The agent notifies you when it needs you |
| The workflow is a tool | The agent is an employee |

### The Abstraction Ladder

Maria operates at the layer she's comfortable with. She can go deeper if she wants, but she never has to.

| Layer | What Maria Says | What It Means |
|------|---------------|---------------|
| **1 — Pure intent** | "Handle my customer emails" | Agent infers everything: schedule, tools, escalation |
| **2 — Agent config** | "Check my email every hour, CC me on anything to executives" | She controls schedule + escalation, not tools |
| **3 — Tool access** | "Give it Gmail access but NOT Salesforce" | She controls what the agent can touch |
| **4 — Per-action** | "Always ask me before it sends to a new person" | She approves every individual action |

Most users start at Layer 1. The system surfaces Layer 2 naturally ("When should it run?"). Deeper layers are available but not required.

### The AHA Moment

Not a single dramatic reveal. Trust is earned incrementally.

Maria hires an agent Monday morning. Tuesday she wakes up and sees a notification: "Agent handled 3 emails while you slept. 1 escalated." She didn't have to check. The agent just worked. That's the moment.

After two weeks: Maria realizes she almost handled an email herself before remembering the agent already did it. That's when she knows the agent is real.

After a month: Maria goes on vacation. Her agent handles everything. She gets back to a summary: "Agent worked 12 days. Handled 47 emails. 4 escalated. All resolved." She didn't think about work once.

---

## 6. The MVP

### What the MVP Must Prove

The MVP is not a template or a feature. It is proof of the thesis:

> **A non-technical business user can hire a persistent, memory-enabled AI employee in under 5 minutes and trust it to work while they sleep.**

### MVP Feature Set

**What ships in the MVP:**

1. **Visual Canvas** — Maria opens the app, sees her agent team as an org chart. Cards show role, status (idle/running/waiting), and what the agent is doing right now.

2. **NL-to-Agent Deployment** — Maria types "I want an agent that handles my inbound customer emails." The system shows her a preview of what that agent would do — its schedule, its tools, its escalation rules. She clicks "Activate." The agent is live.

3. **Gmail Integration** — Agent can read, draft, and send email via OAuth. Real work, not demos.

4. **Durable Execution** — The agent is a persistent process, not a request-response. It checkpoints after every action. Server restarts don't kill in-flight work.

5. **Real-Time Reasoning Traces** — Maria watches her agent think. Not a spinner. Not a "working..." message. The agent's actual reasoning, streamed live: "Checking inbox... Found 12 emails... 3 are new leads... Escalating 1 (mentions competitor pricing)... Drafting responses for 2..."

6. **Escalation Modal** — When the agent needs human input, Maria gets a notification. She opens the modal, sees what happened and what the agent wants to do, and decides: Approve / Edit / Skip / Cancel.

7. **Agent Card** — Status dot, last run time, next wake time, budget bar. Maria always knows the state of her team.

8. **Activity Log** — Every agent action is logged as a ticket. Searchable. Filterable. Exportable.

9. **Magic Link Auth** — Maria signs in with email. No passwords.

10. **Push Notifications** — Escalations reach Maria immediately. Not in-app polling. Real push.

### What Is NOT in the MVP

- **Multi-agent orchestration** — That is Phase 2 (Differentiate)
- **Template gallery with 8 templates** — The MVP has 1 working agent type (email handler). That is sufficient to prove the thesis.
- **Long-term memory** — Working memory (per-session) ships in MVP. Cross-session memory ships at Phase 2.
- **Calendar, HubSpot, CRM integrations** — Gmail is enough for MVP.
- **Skills directory** — Ships at Phase 2 (Differentiate). MVP uses structured NL config.
- **Governance board** — Ships at Phase 2.
- **Auto-pause on budget** — Ships at Phase 2.
- **PROACTIVE always-on mode** — Ships at Phase 2 (Differentiate). MVP uses scheduled heartbeats.

### The MVP Is Not an Email Agent

The MVP ships an email handler because that is what Maria needs. But the **product is the harness** — the durable execution, the real-time traces, the visual canvas, the NL deployment. The email handler is the first use case. Not the product.

If we shipped nothing but a canvas with a durable, memory-enabled, always-on agent running Gmail — that proves the thesis. The template gallery, multi-agent, and skills system are surface on top.

---

## 7. UX Specifications

### The Canvas

The canvas is a **team dashboard**, not a flowchart.

```
┌─────────────────────────────────────────────────────────────────────┐
│  AgentOS          Your Team                        [Activity] [⚙]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│     ┌──────────┐                                                     │
│     │ Maria    │                                                     │
│     │ (you)   │                                                     │
│     └────┬─────┘                                                     │
│          │                                                           │
│    ┌─────┴──────┬──────────────────┐                                │
│    ▼            ▼                  ▼                                │
│ ┌──────┐  ┌──────────┐  ┌─────────────┐                          │
│ │Email  │  │Research  │  │ Marketing   │                          │
│ │Handler│  │Agent     │  │Agent        │                          │
│ │✓ idle │  │◐ running │  │💤 dreaming  │                          │
│ │9am ✓ │  │research: │  │memory proc │                          │
│ └──────┘  │Apple/MSFT │  └─────────────┘                          │
│            └──────────┘                                             │
│                                                                       │
│  ──────────────────────────────────────────────────────────────     │
│  [Type to hire: "I want an agent that..."]                          │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Key UX principles:**
- Maria never sees a node graph, edge, pipeline, or flowchart
- Agents appear as employee cards in an org chart
- Live status is visible at a glance — green (idle), pulsing green (working), amber (waiting for approval), gray (paused)
- The "Type to hire" bar is always visible, always inviting

### The Agent Card

```
┌─────────────────────────────┐
│ 🟢 Email Handler     [⋯]    │
│ "Handles inbound customer     │
│  emails"                    │
│ ──────────────────────────── │
│ ✓ Idle                      │
│ Last: Today 9:01am — 3 done  │
│ Next: Tomorrow 9:00am        │
│ ──────────────────────────── │
│ [████████░░] 80% budget      │
│ 47 emails this week          │
└─────────────────────────────┘
```

For PROACTIVE agents (Phase 2), the card changes:
```
┌─────────────────────────────┐
│ 🟢 Email Handler     [⋯]    │
│ Always-on · Memory active    │
│ ──────────────────────────── │
│ ✓ Working · woke 2min ago    │
│ Doing: "Drafting response    │
│  to Acme Corp inquiry..."    │
│ ──────────────────────────── │
│ [████████░░] 80% budget      │
│ 12 emails today · 3 escalated │
└─────────────────────────────┘
```

### The Reasoning Trace Panel

When Maria clicks on a running agent, a panel slides in from the right showing the agent's live reasoning:

```
┌─────────────────────────────────────────────────────┐
│ Email Handler — Working                    [−] [×]  │
├─────────────────────────────────────────────────────┤
│ 9:01:03  → Checking inbox...                       │
│ 9:01:04  → Found 14 new emails                     │
│ 9:01:05  → 3 from existing customers (skipping)    │
│ 9:01:06  → 8 are new inquiries                     │
│ 9:01:07  → 2 mention competitor pricing — flagging  │
│ 9:01:08  → 1 is from @acme.com (exec) — escalate  │
│ 9:01:09  → Drafting response to Smith inquiry...   │
│ 9:01:12  → Response drafted. Auto-approving        │
│            routine send. Escalating exec email.      │
└─────────────────────────────────────────────────────┘
```

This is the world-class harness UX. Maria watches her agent think in real time. She understands what it's doing without reading docs. She trusts it because she can see the reasoning.

### The Escalation Modal

```
┌─────────────────────────────────────────────────────┐
│ ✋ Email Agent needs your input              [×]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  The agent wants to send this email:               │
│                                                     │
│  To:    exec@acme.com                              │
│  Subject: Re: HVAC contract renewal                 │
│                                                     │
│  Body:                                               │
│  "Hi John, Following up on our contract...         │
│                                                     │
│  ─────────────────────────────────────────         │
│  Reasoning: This email is to exec@acme.com        │
│  (escalation rule: emails to executives).           │
│  Safe to send — existing customer, warm lead.     │
│  Confidence: 94%                                    │
│  ─────────────────────────────────────────         │
│                                                     │
│  [Approve]  [Edit & Send]  [Skip]  [Cancel]      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

The confidence score (94%) comes from the permission auto-approval classifier. Maria can override at any time. But most of the time, seeing the confidence score is enough — she approves and moves on.

### Onboarding (MVP)

```
1. Maria signs in with magic link
2. Canvas opens: "Your team is empty. Hire your first agent."
3. She types: "I want an agent that handles my inbound customer emails"
4. NL layer shows preview:
   - Role: Email Handler
   - Schedule: Daily 9am UTC
   - Tools: Gmail read, Gmail compose
   - Escalation: External recipients require approval
   - Budget: Standard
5. She clicks "Activate"
6. OAuth popup: "Connect Gmail" — she authorizes
7. Canvas: "Email Agent is live. First wake: tomorrow 9am."
8. Agent card appears: idle, next wake: tomorrow 9am

Day 2 (MVP end state):
  9:00am — Agent wakes, checks inbox, drafts responses
  9:01am — Push: "Agent handled 3 emails. 1 escalated. [Review]"
  Maria opens app, sees reasoning trace, approves escalated email
  ✓ AHA moment achieved
```

---

## 8. Technical Architecture

### The Engineering Substrate (from Claude Code Leak)

The MVP's durability, streaming, and checkpointing come from reverse-engineering Claude Code's harness patterns. These are the critical systems:

#### Durable Execution

```
Agent run = state machine: idle → running → waiting_for_approval → completed | failed | budget_exceeded

Every state transition is checkpointed to Postgres.
Every tool call has an idempotency key (ULID).
Server restart → runner reads last checkpoint → resumes.
```

#### Streaming Tool Execution

```
Agent reasons → LLM streams token by token
Tool calls fire as they are generated — before reasoning completes
Maria sees "Checking inbox..." immediately, not after full reasoning
Gmail read: parallel-safe (runs concurrently with other tools)
Gmail send: serial-only (one send at a time per agent)
```

#### Permission Auto-Approval (Phase 2 — Differentiation)

```
Tool call requested
  → TRANSCRIPT_CLASSIFIER evaluates: is this routine for this user's patterns?
  → Confidence > 90%: auto-execute (no modal, no notification)
  → Confidence 70-90%: execute + notify after
  → Confidence < 70%: pause, show escalation modal
  → User decision updates classifier → next similar call is easier
```

This is the #1 friction reducer. Without it, every email send requires approval. With it, the agent handles 80%+ of actions autonomously.

#### Memory Architecture

```
Working Memory (MVP — Phase 1):
  Per-session. Ephemeral. Within a heartbeat cycle.
  "What happened in this run."

Long-Term Memory (Phase 2 — Differentiation):
  Cross-session. Persistent. mem0.ai + Qdrant.
  "What Maria prefers. What she's approved before. What happened last week."
```

#### PROACTIVE Mode (Phase 2 — Differentiation)

```
Scheduled agents: wake → check → act → sleep
PROACTIVE agents: wake → check for urgent work → act if found → sleep
  OR: no urgent work → sleep until next tick

Urgent work detection: Gmail push webhook wakes agent immediately
Not polling. Event-driven. <2 minute latency from email arrival to agent action.
```

### System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         AgentOS App                                     │
│                                                                       │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Canvas    │  │  NL Layer    │  │  Event Stream (SSE)       │  │
│  │  (React)   │  │  (GPT-4o)   │  │  real-time reasoning      │  │
│  │  org chart │  │  intent →    │  │  traces + status updates  │  │
│  │  + cards   │  │  agent config│  │                           │  │
│  └─────┬──────┘  └──────┬───────┘  └────────────────────────────  │  │
│        │                │                                            │
│        │ SSE            ▼                                            │
│        │         ┌──────────────┐    ┌──────────────────────────┐   │
│        │         │  Durable     │◄───│  BullMQ Heartbeat        │   │
│        │         │  Runner      │    │  Scheduler               │   │
│        │         │              │    └──────────────────────────┘   │
│        │         │  checkpoint/ │                                    │
│        │         │  resume      │                                    │
│        │         └──────┬───────┘    ┌──────────────────────────┐   │
│        │                │            │  Postgres                 │   │
│        │                ▼            │  agents, runs, checkpoints │   │
│        │         ┌──────────────┐    └──────────────────────────┘   │
│        │         │  Tool Layer  │                                 │
│        │         │  Gmail OAuth  │                                 │
│        │         │  (serialized) │                                 │
│        │         └──────────────┘                                 │
│        │                                                         │
│        │         ┌──────────────┐    ┌──────────────────────────┐  │
│        │         │  Working     │    │  Push Notifications      │  │
│        │         │  Memory      │    │  (escalations only)     │  │
│        │         │  (session)   │    └──────────────────────────┘  │
│        │         └──────────────┘                                 │
│        │                                                         │
│  ┌─────▼──────────────────────────────────────────────────────┐   │
│  │  Auth: Magic Link (email)                                   │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘

Phase 2 additions (Differentiation):
  ┌──────────────────────────────────────────────────────────────┐
  │  Long-Term Memory Microservice                                │
  │  mem0.ai (extraction) → Qdrant (vectors) + Postgres (facts)│
  │                                                              │
  │  PROACTIVE Webhook Receiver                                   │
  │  Gmail push → Cloudflare Worker → wake agent immediately      │
  │                                                              │
  │  Permission Classifier                                        │
  │  TRANSCRIPT_CLASSIFIER: classifies tool calls → auto-approve │
  └──────────────────────────────────────────────────────────────┘

Phase 3 additions (Scale):
  ┌──────────────────────────────────────────────────────────────┐
  │  Multi-Agent Orchestration                                    │
  │  Coordinator (fork + sidechain) → parallel workers            │
  │                                                              │
  │  Skills Directory                                             │
  │  skills/<name>/SKILL.md — bundled agent templates            │
  │                                                              │
  │  Remote Bridge                                               │
  │  git worktree isolation + JWT heartbeat + work polling        │
  └──────────────────────────────────────────────────────────────┘
```

---

## 9. Phased Roadmap

### Phase 1 — MVP (Days 0–90): Prove the Thesis

**Goal:** A non-technical user can hire a persistent, durable AI employee in under 5 minutes and trust it to work.

**Feature Delivery:**

| Feature | Description |
|---------|-------------|
| Canvas team dashboard | Org chart view with agent cards, live status dots |
| NL-to-agent deployment | Type goal → preview agent → activate |
| Gmail OAuth integration | Read + compose + send |
| Durable execution | BullMQ + Postgres checkpoints; server restart survival |
| Real-time reasoning traces | Streaming tool execution; Maria watches agent think |
| Escalation modal | Approve / Edit / Send / Skip / Cancel |
| Agent card | Status, last run, next wake, budget bar |
| Activity log | Ticket-based, searchable, 90-day retention |
| Magic link auth | Password-free email auth |
| Push notifications | Escalations reach Maria immediately |

**Success condition:** Maria hires her first agent on Day 2. On Day 3, she experiences the AHA moment: she woke up to find her agent had already worked.

**What we are NOT shipping:** Template gallery (beyond the 1 email handler), multi-agent, long-term memory, PROACTIVE, Calendar, HubSpot, governance board, auto-pause, skills directory.

---

### Phase 2 — Differentiate (Days 90–180): Make It Unstoppable

**Goal:** Agent OS has durable competitive moats that Anthropic cannot replicate because they are a model company.

**Features:**

| Feature | Description | Competitive Moat |
|---------|-------------|------------------|
| **Permission auto-approval** | TRANSCRIPT_CLASSIFIER-inspired AI classifier. Routine actions auto-execute. Only unusual ones escalate. | Anthropic's classifier trains on code. Ours trains on email/CRM patterns. Domain-specific. |
| **Long-term memory** | mem0.ai + Qdrant. Agent remembers Maria's preferences across sessions. | Always-on learning. Competitors start fresh every session. |
| **PROACTIVE mode** | Gmail push webhook → agent wakes immediately, not on next heartbeat. Event-driven. | 2-minute latency from email to action. Not next-day. |
| **Template gallery** | 8–10 pre-built agents. Verticalized: HVAC Email Handler, Legal Intake, Real Estate Lead Research. | Vertical expertise. Not generic. |
| **Skills directory** | skills/<name>/SKILL.md — bundled agent configs with YAML frontmatter | Templates are upgradeable without re-hire |
| **Auto-pause on budget** | Agent pauses when budget exceeded. Maria resumes when ready. | Trust feature — agent doesn't overspend |
| **Governance board** | Tier 2: structural changes (new tools, new agents) require approval | Safety for business owners |

**Success condition:** 80%+ of tool calls are auto-approved. Maria's agents have been working for 3 months without requiring constant attention. NPS > 40.

---

### Phase 3 — Scale (Days 180–270): Team + Enterprise

**Goal:** AgentOS serves teams, not just individuals. James (marketing manager) can run a full agent team.

**Features:**

| Feature | Description |
|---------|-------------|
| **Multi-agent orchestration** | Coordinator agent → parallel workers (research → draft → review) |
| **Team collaboration** | Multiple users, shared agent team, role-based access |
| **Remote bridge** | Persistent cloud agents for enterprise isolation |
| **HubSpot + Calendar OAuth** | CRM + calendar integration for James's use case |
| **Slack integration** | Agent summaries delivered to Slack channels |
| **Agent marketplace** | Users share and discover agent templates |

**Success condition:** James runs a 3-agent marketing team (research + draft + review). Agent team processes 50 competitor updates/week without James touching anything except approvals.

---

## 10. Business Model

### The ROI Math

Maria pays $2,000/month for a VA. Her VA:
- Checks email once a day (morning)
- Doesn't work while Maria sleeps
- Doesn't remember context across sessions
- Costs $2,000/month

AgentOS with one email agent:
- Works always-on (PROACTIVE mode, Phase 2)
- Has memory across sessions
- Handles 80%+ of emails autonomously
- Costs $199/month per agent

**ROI: 10x cost reduction. The product pays for itself immediately.**

### Pricing Tiers

| Plan | Price | Agents | Features |
|------|-------|--------|---------|
| **Starter** | $99/month | 1 agent | MVP features, Gmail only |
| **Professional** | $249/month | 3 agents | Phase 1 + Phase 2 features, Calendar |
| **Business** | $499/month | 5 agents | All Phase 2 features, PROACTIVE, memory |
| **Team** | $999/month | Unlimited | Phase 3 features, multi-user, HubSpot |

**Trial:** 14-day free trial. No credit card required. Full features.

**Enterprise:** Custom pricing. Remote bridge. SLA. Dedicated support.

### The Vertical Template Opportunity

Vertical templates (pre-built agents for specific industries) create category-defining products:

- **HVAC Agent** ($99/month): "Handles service contract renewals, dispatches emergency calls, triages incoming leads"
- **Real Estate Agent** ($149/month): "Monitors listings, researches comparables, drafts follow-up emails"
- **Legal Intake Agent** ($199/month): "Screens intake calls, captures client info, routes to appropriate attorney"

Anthropic will never build these. They are a model company. We become the Canva of legal, HVAC, real estate AI agents.

---

## 11. Success Metrics

### Product Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first agent | < 5 min from signup | Session timestamp: signup → first agent activated |
| Activation rate | > 60% of signups hire an agent | signups with ≥1 activated agent / total signups |
| AHA moment rate | > 50% experience it by day 3 | Agent completes work before user's first app open that day |
| Auto-approval precision | > 90% | Auto-approved actions requiring no reversal / total auto-approved |
| Auto-approval coverage | > 80% | Auto-approved calls / total tool calls |
| Escalation precision | > 95% | Escaped items user confirms were correct to escalate / total escalated |
| Missed escalation rate | < 5% | Escalations user says should have been auto-approved / total auto-approved |
| Agent completion rate | > 90% | Completed runs / scheduled runs |
| PROACTIVE response latency | < 2 min | Email arrival → agent acted or escalated (Phase 2) |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Trial → Paid conversion | > 25% | Paid subscriptions / trial signups |
| Monthly churn | < 5% | Cancelled subscriptions / total at month start |
| NPS | > 40 | "How likely to recommend?" (0-10) at day 30 |
| Agent retention | > 70% | Active agents after 30 days / total activated |
| Support ticket rate | < 5% | Users filing support tickets / MAU |

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent survival rate | > 95% | Successful wakes / scheduled wakes |
| Resume success rate | > 99% | Resumed runs / interrupted runs |
| Checkpoint completeness | 100% | All state transitions logged vs. expected |
| Idempotency correctness | 0 duplicates | Tool calls with same idempotency key |
| PROACTIVE webhook latency | < 30s | Gmail push → agent wake (Phase 2) |

---

## 12. Document Roadmap

### Documents Required to Execute This PRD

The PRD defines *what* we are building. These documents define *how*.

#### Prerequisite (Before Any Engineering)

| Document | Purpose | Owner |
|----------|---------|-------|
| **PRD v4 (this document)** | Product definition. Source of truth. | Product |
| **Legal Review: Anthropic Reference** | The PRD currently references "leaked Claude Code source." This framing must be removed before any external sharing. Legal must confirm the boundary between "reverse engineering public behavior" and "using leaked source." | Legal |
| **User Interview Guide: MVP Hypothesis** | 5 Maria interviews to validate: (1) Would you hire an agent for $199/month? (2) Is 5 minutes to first agent fast enough? (3) Does the AHA moment framing resonate? | Product |

#### Phase 1 — MVP (Days 0–90)

| Document | Purpose | Dependencies |
|----------|---------|-------------|
| **Plan: Durable Execution** | BullMQ + Postgres checkpoint/resume. Heartbeat scheduler. | PRD v4 |
| **Plan: NL-to-Agent Deployment** | GPT-4o → agent config. Prompt design. Fallback behavior. Error handling. | PRD v4 |
| **Plan: Canvas UI** | React component specs for org chart, agent cards, reasoning trace panel. | PRD v4, Design System |
| **Plan: Gmail Integration** | OAuth flow, token storage, read/compose/send tools, rate limiting. | PRD v4 |
| **Plan: Escalation Modal** | UI spec + API. Approval workflow. Notification delivery. | PRD v4 |
| **Plan: Push Notifications** | Vercel Edge or similar. Web push. Escalation delivery. Quiet hours. | PRD v4 |
| **Design System v1** | Color tokens, typography, spacing, component library. | PRD v4 |
| **Spec: Reasoning Trace Format** | JSON schema for streaming reasoning events. SSE contract. | PRD v4, Durable Execution plan |

#### Phase 2 — Differentiate (Days 90–180)

| Document | Purpose | Dependencies |
|----------|---------|-------------|
| **Plan: Permission Auto-Approval** | TRANSCRIPT_CLASSIFIER architecture. Training data. Confidence thresholds. | PRD v4, Phase 1 |
| **Plan: Long-Term Memory Microservice** | mem0.ai + Qdrant + Postgres. Recall/remember API. | PRD v4, Phase 1 |
| **Plan: PROACTIVE Webhook Receiver** | Gmail push → Cloudflare Worker → BullMQ wake. Scale to N users. | PRD v4, Phase 1 |
| **Plan: Template Gallery** | 8 vertical templates. SKILL.md schema. Gallery UI. | PRD v4, Skills Directory plan |
| **Plan: Skills Directory** | skills/<name>/SKILL.md schema. Loader. Versioning. | PRD v4 |
| **Plan: Governance Board** | Tier 2 escalation UI. Server-side verification. | PRD v4, Phase 1 |
| **Ops: mem0.ai Cost Monitoring** | Per-user cost tracking. Alert thresholds. Quotas. | Long-Term Memory plan |

#### Phase 3 — Scale (Days 180–270)

| Document | Purpose | Dependencies |
|----------|---------|-------------|
| **Plan: Multi-Agent Orchestration** | Coordinator → fork workers. Phase 3 of Claude Code patterns. | PRD v4, Phase 2 |
| **Plan: Skills Marketplace** | User-created skills. Discovery. Sharing. | PRD v4, Skills Directory |
| **Plan: Remote Bridge Architecture** | Git worktree isolation. JWT heartbeat. Enterprise deployment. | PRD v4, Phase 2 |
| **Plan: Team Collaboration** | Multi-user auth. Role-based access. Shared agent teams. | PRD v4, Phase 2 |

#### Cross-Cutting (All Phases)

| Document | Purpose | Owner |
|----------|---------|-------|
| **Data Model** | ERD: users, agents, runs, tickets, checkpoints, oauth_tokens, memories | Engineering |
| **API Contract** | REST API spec for all endpoints. Auth. Rate limits. | Engineering |
| **Security Model** | OAuth token encryption at rest. PII handling. GDPR. Data retention. | Security/Eng |
| **Alerting & On-Call** | P1/P2/P3 alerts for all production systems. Runbooks. | DevOps |
| **Deployment Config** | Vercel config. Environment variables. Secrets management. | DevOps |
| **Monitoring & Observability** | Metrics dashboards. Latency SLOs. Error rates. | DevOps |

### Document Archive

The following documents are superseded by this PRD v4 and should be archived:

| Document | Reason |
|----------|--------|
| `docs/PRD.md` (v1.2) | Replaced by v4. Phase 1/1.5/2 structure was incoherent. |
| `docs/plans/2026-04-01-002-feat-agentos-phase-2-unified-plan.md` | Phase 2 content absorbed into v4 Phase 2 (Differentiate). Structure changed. |
| `docs/brainstorms/2026-03-31-durable-agents-product-requirements.md` | Content absorbed into v4. |
| `docs/brainstorms/2026-03-31-prd-contradictions-requirements.md` | Contradictions resolved in v4 structure. |

---

## Appendix: What the Claude Code Leak Gave Us

*(For internal engineering reference only — do not share externally)*

Analysis of publicly available Claude Code behavior and architectural patterns revealed production-grade implementations of:

| Pattern | File | What It Taught Us |
|---------|------|------------------|
| Durable core loop | `query.ts`, `QueryEngine.ts` | Labeled while loops with typed exit reasons. State machine design. |
| Streaming tool execution | `StreamingToolExecutor.ts` | Tools fire during streaming. Partition by concurrency safety. |
| Permission classifier | `TRANSCRIPT_CLASSIFIER` (107 refs) | Confidence thresholds. Auto-approval vs escalation decision. |
| Multi-agent fork | `forkSubagent.ts`, `runAgent.ts` | Sidechain transcripts. Fork recursion guard. Parent/worker isolation. |
| Coordinator mode | `coordinatorMode.ts` | 4-phase workflow. Spawn parallel workers. |
| Context compaction | `compact.ts`, `autoCompact.ts` | 4-tier compaction strategy. Token budget management. |
| MCP integration | `services/mcp/` | Full OAuth2+PKCE. 15-min auth cache. STDIO/SSE/HTTP transports. |
| Heartbeat scheduling | `scheduleRemoteAgents.ts` | Cron-based wake with event-driven override. |

**The critical insight:** These are not features. They are the engineering substrate that makes agents feel reliable, trustworthy, and worth paying for. Maria never reads `forkSubagent.ts`. She experiences an agent that works while she sleeps and never loses context. That experience is built on the patterns above.

---

*Last updated: 2026-04-01*
*Owner: Product*
*Status: Active — Source of Truth*
*Version: 4.0 (replaces v1.2)*
