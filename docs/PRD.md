# AgentOS v5 — Product Requirements Document

**Version:** 5.0
**Date:** 2026-04-01
**Status:** Active — Source of Truth
**Classification:** Product — Internal

---

## Table of Contents

1. [Vision](#1-vision)
2. [Target Users](#2-target-users)
3. [The Real Product](#3-the-real-product)
4. [The Competitive Window](#4-the-competitive-window)
5. [What We Are NOT Building](#5-what-we-are-not-building)
6. [Core Product Concept](#6-core-product-concept)
7. [The MVP](#7-the-mvp)
8. [Trust Architecture — The Actual Moat](#8-trust-architecture--the-actual-moat)
9. [Harness Architecture — Built on Strong Primitives](#9-harness-architecture--built-on-strong-primitives)
10. [UX Specifications](#10-ux-specifications)
11. [Technical Architecture](#11-technical-architecture)
12. [Phased Roadmap](#12-phased-roadmap)
13. [Business Model](#13-business-model)
14. [Success Metrics](#14-success-metrics)
15. [Document Roadmap](#15-document-roadmap)

---

## 1. Vision

**"Hire an AI employee. It works while you sleep. And you can trace everything it does."**

AgentOS is a **world-class agent harness** — not a workflow tool, not a task runner, not a pipeline builder — with **Canva-level UX for non-technical business users**.

The comparison is not "Claude Code for business." It's **"Canva for AI agents."**

Every business owner has work that floods in faster than they can handle — leads, inquiries, research, coordination, follow-ups. AgentOS lets anyone hire an AI employee to own any domain of work, prompted into existence through natural language.

---

## 2. Target Users

### Primary Persona: Maria

**Age:** 44 | **Role:** Owns a 12-person HVAC company
**Tech:** QuickBooks, Gmail, LinkedIn. Has never built an automation. Used Zapier once, got confused.
**Pain:** 6 hours/week on repetitive work — triaging leads, chasing invoices, answering common questions. Misses leads. Pays $2,000/month for a VA who handles one domain only and doesn't work while Maria sleeps.
**Wants:** "I want someone to handle the work I don't have time for. I want to approve the important decisions and let the rest go. And I need to be able to show my accountant exactly what it did if they ask."
**Right now:** Her VA doesn't work while Maria sleeps. A lead at 10pm gets a response at 9am. That's a lost job.

### Secondary Persona: James

**Age:** 31 | **Role:** Marketing manager at a 50-person e-commerce brand
**Tech:** HubSpot, Slack, Notion. Has tried Make.com. Shipped one AgentGPT workflow that didn't stick.
**Pain:** Competitive analysis takes 4 hours every Monday. Social media monitoring is manual. Misses opportunities because research can't keep up with the pace.
**Wants:** "I want a research team that never sleeps. Weekly competitive briefs. Daily content drafts. I review and approve the important stuff."
**Compliance:** James's CFO asks monthly: "What did that AI system do with our customer data?" James needs to answer in 5 minutes.

### The Distinction That Matters

Maria and James are both non-technical business users. But:

- Maria needs **one agent that works always-on** and handles her inbound work (leads, inquiries, follow-ups)
- James needs **a team of agents** that coordinate (research → draft → review)

The MVP serves Maria. Phase 2 serves James.

---

## 3. The Real Product

### What AgentOS Actually Is

**A trust infrastructure layer for AI agents — for businesses that cannot afford to operate blind.**

Not a configuration screen. Not a workflow canvas. Not a pipeline builder. A **team dashboard** where Maria opens the app, sees her agents working, and — critically — can trace every decision, every tool call, every learned fact, with cryptographic integrity.

### The Threefold Moat

**Moat 1 — Trust Infrastructure:** Auditability, memory integrity, security primitives built in before features. Not bolted on after. Every business needs to answer "what did my agent do?" — AgentOS makes that answerable.

**Moat 2 — Domain Depth:** Vertical agents for any business domain (HVAC, legal, real estate, healthcare-adjacent) that require auditable, judgment-capable AI employees. This takes 12-18 months to get right and cannot be cloned by downloading a reference harness and shipping in 90 days.

**Moat 3 — UX for the Masses:** Canva-level simplicity for an audience Anthropic will never serve. Non-technical business users who need AI employees, not AI tools. The agent creation experience is as easy as describing what you want in plain English.

### The Five Pillars

1. **NL-to-Deployment** — Describe what you want in plain English. Watch your agent team get built in real time. No config files. No JSON. No jargon.

2. **Visual Agent Harness** — A canvas that shows agent teams as an org chart with live status, reasoning traces, and memory state. Maria sees what her agents are doing right now — not a log file.

3. **Durable Execution** — Agents that survive server restarts, checkpoint their progress, and resume from where they left off. Every state transition is logged. Every tool call is idempotent.

4. **Persistent Memory + Judgment** — Agents that remember what happened last week, learn from Maria's approval patterns, and only escalate what genuinely needs human input. Every learned fact is verifiable.

5. **Business Data Access** — OAuth connections to Gmail, Calendar, HubSpot. Agents that can actually do the work — with every action logged and traceable.

6. **Auditability** — Every tool call, every LLM decision, every memory extraction, every approval is logged with cryptographic integrity. Maria can answer "what did my agent do last Tuesday?" in under 5 minutes. Exportable for compliance.

---

## 4. The Competitive Window

### The Old Thinking (v4)

*"6-12 months before Anthropic or a well-funded competitor figures out what we're doing."*

This was wrong. The 6-12 month window is not for **building the harness** — that's already commoditized. ClawCode reached 74k stars hours after the leak. Every engineering team with 3 months and a reference implementation can clone the durable execution, checkpoint/resume, and streaming patterns.

### The New Thinking (v5)

The window is for **becoming the trusted, auditable system that regulated industries and careful business owners will demand.**

The companies that win are the ones that answer the question cleanly:

> *"Can you tell me, precisely, what your system did with my data on a specific day last month? Not what it was configured to do. Not what it was supposed to do. What it actually did — and why?"*

The harness is already figured out. The differentiation is what you build **around it** — audit trails, memory integrity, security primitives, compliance wrappers — that take 12-18 months to accumulate and cannot be fast-followed.

### The Cambrian Explosion Is Real

The leaked Claude Code source (v2.1.88, 512,000 lines, 1,906 TypeScript files) showed the world what production-grade agent infrastructure looks like. It handed every builder a reference architecture.

This means:
- **The baseline is rising.** Every new entrant will have durable execution and streaming traces within 90 days.
- **The differentiator is above the harness.** Trust, audit, compliance, domain depth.
- **The winner is not the first mover.** It's the one trusted with the most sensitive business data.

---

## 5. What We Are NOT Building

**Not a workflow tool.** Zapier, Make, n8n are workflow builders. You drag steps, connect triggers, run the pipeline. Every run starts fresh. Nothing persists. Nothing learns. No audit trail.

**Not a chat interface.** ChatGPT, Claude.ai are conversation tools. You type, it responds, done. The context is the conversation. There's no persistent worker.

**Not a developer tool.** Claude Code, Copilot, Devin are for engineers. They assume technical literacy. AgentOS assumes none.

**Not "an email agent."** An agent archetype is a template. The product is the harness + trust infrastructure. Any domain of work — leads, research, follow-ups, scheduling, intake — is a template. The harness is the moat.

**Not "build the harness fast and add trust later."** Trust primitives — audit logging, memory integrity, security isolation — must be built into the foundation. Retrofitting them onto an existing harness is a security nightmare and a compliance liability.

---

## 6. Core Product Concept

### The Hiring Metaphor

You don't run an agent. You **hire** one.

| Traditional Automation | AgentOS |
|----------------------|---------|
| You configure a workflow | You describe a worker |
| The workflow runs when triggered | The agent works on a schedule + proactively |
| Every run starts fresh | The agent remembers previous sessions |
| You check the output | The agent notifies you when it needs you |
| The workflow is a tool | The agent is an employee |
| What it did is a mystery | What it did is fully traceable |

### The Abstraction Ladder

Maria operates at the layer she's comfortable with. She can go deeper if she wants, but she never has to.

| Layer | What Maria Says | What It Means |
|------|---------------|---------------|
| **1 — Pure intent** | "Handle my inbound leads" | Agent infers everything: schedule, tools, escalation |
| **2 — Agent config** | "Check my CRM every hour, flag anything over $10K" | She controls schedule + escalation, not tools |
| **3 — Tool access** | "Give it Gmail and HubSpot access but NOT Salesforce" | She controls what the agent can touch |
| **4 — Per-action** | "Always ask me before it drafts for a new company" | She approves every individual action |

Most users start at Layer 1. The system surfaces Layer 2 naturally ("When should it run?"). Deeper layers are available but not required.

### The AHA Moment

Not a single dramatic reveal. Trust is earned incrementally.

Maria hires an agent Monday. Tuesday she wakes up to a notification: **"Lead Research Agent handled 14 leads while you slept. 2 escalated."** She didn't have to check. The agent just worked.

She taps the escalation. She sees: *"Agent wanted to draft a follow-up for Acme Corp — $50K potential deal. I didn't auto-approve because this is a new company. Here's the full reasoning."* She approves in 10 seconds.

After two weeks: Maria realizes she almost started her morning by researching a lead before remembering the agent already did it. She checks the activity log to confirm — and she can trace every decision the agent made, every lead it contacted, every draft it created.

After a month: Maria goes on vacation. Her agent handles everything. She gets back to a summary: **"Agent worked 12 days. Processed 47 leads. Drafted 31 follow-ups. 4 escalated. All traceable."** Her accountant asks what the AI did. She exports a compliance report in 2 minutes.

---

## 7. The MVP

### What the MVP Must Prove

The MVP is not a template or a feature. It is proof of the thesis:

> **A non-technical business user can hire a persistent, memory-enabled AI employee in under 5 minutes, trust it to work, and trace everything it did.**

### MVP Feature Set

**What ships in the MVP:**

1. **Visual Canvas** — Maria opens the app, sees her agent team as an org chart. Cards show role, status (idle/running/waiting), and what the agent is doing right now.

2. **NL-to-Agent Deployment** — Maria types "I want an agent that handles my inbound leads and drafts follow-up emails." The system shows her a preview of what that agent would do — its schedule, its tools, its escalation rules. She clicks "Activate." The agent is live. She can also pick from pre-built agent archetypes.

3. **Tool Integrations** — Agent connects to business data via OAuth integrations (Gmail, Calendar, HubSpot, Slack). Agent can read, draft, and act on real business data. Real work, not demos.

4. **Durable Execution** — The agent is a persistent process, not a request-response. It checkpoints after every action. Server restarts don't kill in-flight work. Every state transition is logged.

5. **Real-Time Reasoning Traces** — Maria watches her agent think. Not a spinner. Not a "working..." message. The agent's actual reasoning, streamed live: "Processing lead from Acme Corp... Checking company size... $50K potential deal... Drafting follow-up... Escalating because new company..."

6. **Escalation Modal** — When the agent needs human input, Maria gets a notification. She opens the modal, sees what happened and what the agent wants to do, and decides: Approve / Edit / Skip / Cancel.

7. **Agent Card** — Status dot, last run time, next wake time, budget bar. Maria always knows the state of her team.

8. **Activity Log** — Every agent action is logged. Searchable. Filterable. **Exportable.** 90-day retention.

9. **Magic Link Auth** — Maria signs in with email. No passwords.

10. **Push Notifications** — Escalations reach Maria immediately. Not in-app polling. Real push.

11. **Immutable Audit Trail** — Every tool call is logged with: timestamp, actor, input hash, output hash, LLM reasoning text. Maria can query her full audit history. Logs are tamper-evident (append-only, no UPDATE/DELETE on step records).

### What Is NOT in the MVP

- **Multi-agent orchestration** — Phase 3
- **Template gallery with 8 templates** — MVP has 3 pre-built agent archetypes (Lead Research, Customer Follow-Up, Research Monitor). Sufficient to prove thesis.
- **Long-term memory** — Working memory ships in MVP. Cross-session memory ships at Phase 2.
- **Additional tool integrations** — Gmail, Calendar, HubSpot, Slack — enough integrations to prove the domain model works.
- **Skills directory** — Phase 2
- **Governance board** — Phase 2
- **Auto-pause on budget** — Phase 2
- **PROACTIVE always-on mode** — Phase 2 (MVP uses scheduled heartbeats)
- **Permission auto-approval** — Phase 2 (MVP requires approval for every non-trivial action)
- **Memory integrity verification** — Phase 2

### The MVP Is Not a Single-Domain Tool

The MVP ships three agent archetypes to prove the domain model: Lead Research, Customer Follow-Up, and Research Monitor. These are proof points, not the product.

The product is the harness + trust infrastructure. Any domain of work can be delegated to an AgentOS agent. The MVP proves this for three domains. The template gallery, multi-agent, and skills system are surface on top.

---

## 8. Trust Architecture — The Actual Moat

This section defines the trust primitives that are built into the foundation from Day 1. They are not features. They are the system.

### The Auditability Principle

**Maria must be able to answer any question about her agent's past behavior within 5 minutes, without calling support.**

Specific questions Maria must be able to answer:

| Question | Trust Requirement |
|---|---|
| "What did my agent do yesterday?" | Full activity log, every tool call, timestamped |
| "Did my agent act outside its approved scope?" | Every action linked to a run + approval record + scope boundary |
| "Why did my agent escalate this?" | Full LLM reasoning text at the moment of escalation |
| "What facts did my agent learn about my business?" | Verifiable memory log — every extracted fact, with confirm/deny |
| "Can I export what my agent did for my accountant?" | CSV/PDF export of full audit trail, date-range selectable |
| "What would happen if someone replayed a tool call?" | Idempotency keys prevent duplicate execution |

### Audit Log Schema

Every step in the reasoning trace is an immutable record:

```typescript
interface AuditableStep {
  step_id: string;           // ULID — globally unique, sortable by time
  run_id: string;            // Parent run
  agent_id: string;          // Which agent
  user_id: string;           // Whose agent (for multi-tenant isolation)
  seq: number;               // Monotonic within run

  // Immutable content (no UPDATE/DELETE allowed on this record)
  type: StepType;
  timestamp: string;         // ISO 8601

  // Integrity
  input_hash: string;        // SHA-256 of tool input (if applicable)
  output_hash: string;       // SHA-256 of tool output (if applicable)

  // Content
  payload: object;           // Step-type-specific payload

  // Provenance
  checkpoint_id: string;     // Which checkpoint this step was saved in
  resumed_from?: string;     // If this run was resumed, from which run_id
}
```

**Integrity rules:**
- Steps table: `INSERT` only. No `UPDATE` or `DELETE`. Audit log is append-only.
- Output hash enables Maria to prove content was not modified after the fact.
- Checkpoint ID links every step to the durable state at the time.

### Audit Trail UI

**Activity Log (Exportable):**

```
/activity
┌──────────────────────────────────────────────────────────────────┐
│  Activity Log — Last 30 days          [Export CSV] [Export PDF] │
├──────────────────────────────────────────────────────────────────┤
│  Filter: [Agent ▾] [Date range] [Action type ▾] [🔍 Search]    │
│                                                                   │
│  Apr 1, 2026                                                      │
│  10:32am  Lead Research   ✅ Auto-approved: drafted follow-up   │
│  10:31am  Lead Research   🔍 Read: 5 new leads (HubSpot)        │
│  9:47am   Lead Research   ⏸️  Checkpoint saved (step 142)       │
│                                                                   │
│  Mar 31, 2026                                                      │
│  3:22pm   Lead Research   ⚠️  Escalated: Acme Corp ($50K)      │
│  3:22pm   Lead Research   [Maria approved & edited draft]        │
│  3:18pm   Lead Research   🔍 Read: 12 leads (all)              │
└──────────────────────────────────────────────────────────────────┘
```

### Security Architecture

**Cross-tenant isolation (Phase 1, non-negotiable):**

Every database query includes `user_id` as a mandatory filter. Postgres row-level security policies enforce this at the database layer — not just application code.

```sql
-- Example: Agents table
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_tenant_isolation ON agents
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

**Blast radius on compromise:**

If Maria's OAuth token is compromised, the blast radius is:
- Agent can access Maria's Gmail (already granted)
- Agent **cannot** access other users' data (tenant isolation)
- Agent **cannot** exfiltrate data to unapproved recipients (approved contact list enforced)
- All actions are logged under Maria's user_id (non-repudiation)

**Approved contact list (Phase 1):**

Maria maintains a list of approved email recipients. By default, the agent can only send emails to approved contacts.

- New recipients require explicit escalation + approval
- "Always approve emails to this domain" = custom rule (Phase 2)
- Outbound emails to unlisted recipients are blocked by default

**OAuth scope minimization:**

| Capability | Required Scope | When Granted |
|---|---|---|
| Read emails | `gmail.readonly` | Agent activation |
| Send emails | `gmail.send` | Agent activation (requires approved contacts) |
| Modify drafts | `gmail.compose` | Agent activation |
| Delete/archive | `gmail.modify` | Phase 2 |

### Memory Integrity

**The hallucination guard (Phase 2, designed in Phase 1):**

mem0.ai extracts facts from reasoning transcripts. Hallucination is possible. We design for it from Day 1.

Design: Every extracted fact goes into a `learned_facts` table with:
- `fact_text`: The extracted claim
- `confidence`: mem0's confidence score
- `source_step_id`: Which reasoning step it came from
- `status`: `pending | confirmed | denied`
- `confirmed_at`, `denied_at`

Phase 2: Facts surface in Maria's activity log as "Learned: [fact]." Maria confirms or denies. Confirmed facts are used in future reasoning. Denied facts are flagged for mem0 prompt tuning.

This creates the **trust feedback loop**: Maria teaches her agent what's true about her business.

---

## 9. Harness Architecture — Built on Strong Primitives

### The Claude Code Reference

Anthropic's Claude Code (v2.1.88) is a world-class agent harness — 512,000 lines across 1,906 TypeScript files — that represents the most complete, production-grade reference implementation of agent infrastructure in existence.

We use it as our engineering reference. We do not clone it. We adapt its principles.

**What makes Claude Code's architecture world-class:**

| Pattern | What It Means | AgentOS Implementation |
|---------|--------------|----------------------|
| **QueryEngine core loop** | 46,000-line QueryEngine drives the entire LLM API loop — streaming, tool calls, token tracking, state machine. Every other module plugs into it. | Our `DurableRunner` follows the same pattern: typed exit reasons, streaming token consumption, tool loop. Not a 46k line file — but the same design principles. |
| **Streaming tool execution** | Tools fire as tokens are generated — during LLM streaming, not after. User sees "Reading inbox..." before reasoning completes. | Implemented in MVP. SSE stream delivers tool events as they fire. |
| **Typed exit reasons** | Every run ends with `completed \| escalated \| error \| max_steps \| budget_exceeded`. Not ambiguous. | Phase 1. Enables analytics, retry logic, and Maria's "why did it stop?" question. |
| **Three-layer memory** | Working memory (ephemeral) → compressible transcript (compacts to summary) → long-term memory (persistent facts). Auto-healing: compaction discards reasoning chains, keeps distilled facts. | Phase 2. Phase 1 MVP: working memory only. |
| **AUTOCOMPACT_BUFFER_TOKENS** | Compaction fires at 13,000 tokens below effective context limit (itself reduced by 20,000-token summary reserve). Discards intermediate reasoning chains, replaces with compressed digest. | Context window management designed in from start. MVP: hard stop at token limit. Phase 2: smart compaction. |
| **Tool.ts (29,000 lines)** | Single monolithic tool definition file. Every tool has: name, description, input schema, output schema, permission scope, concurrency rules, rate limits. | Phase 1: Gmail tools defined with full schema, permission scope, concurrency classification. |
| **Permission scopes** | Every tool call is evaluated against user-granted permission scopes. Tools have permission tiers (read-only, write, admin). | Phase 1: Approved contact list enforces recipient scoping on email send. |
| **Heartbeat scheduling** | Agents wake on cron interval. PROACTIVE agents also wake on event (Gmail push). Both patterns supported. | MVP: cron heartbeat only. Phase 2: PROACTIVE webhook. |
| **Multi-agent fork** | Coordinator spawns parallel workers. Each has isolated transcript. Sidechain transcripts for audit. | Phase 3. |
| **Idempotency keys** | Every tool call has a ULID-based idempotency key. Replayed calls return cached result, don't re-execute. | Phase 1. |

### The 5P Agent Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     PERSONA LAYER                       │
│  System prompt constructed from:                       │
│  - Maria's NL description → distilled instructions    │
│  - Approved contact list                              │
│  - Confirmed memory facts (Phase 2)                   │
│  - Tier 1 auto-approval history                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    PLANNER LAYER                        │
│  LLM reasons: what to do next                          │
│  Emits: decision step with reasoning text               │
│  Evaluates: escalation conditions                      │
│  → If escalate: pause, emit escalation step            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     TOOL LAYER                         │
│  Tool dispatcher: calls tools in sequence/parallel     │
│  Streaming: tools fire during token generation        │
│  Concurrency: partitioned by safety (read vs write)  │
│  Rate limiting: per-tool, per-user                   │
│  Logging: every call → audit trail                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   MEMORY LAYER                         │
│  Working memory: ephemeral, per-run                   │
│  Checkpoints: durable, per-step, Postgres            │
│  Long-term (Phase 2): mem0 + Qdrant                  │
│  Hallucination guard (Phase 2): fact verification    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   SCHEDULER LAYER                      │
│  BullMQ: cron-based scheduled wakes                   │
│  Heartbeat: periodic keepalive + checkpoint           │
│  PROACTIVE (Phase 2): Gmail push → immediate wake     │
└─────────────────────────────────────────────────────────┘
```

---

## 10. UX Specifications

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
│ 🟢 Lead Research Agent [⋯]  │
│ "Researches inbound leads   │
│  and drafts follow-ups"     │
│ ──────────────────────────── │
│ ✓ Idle                      │
│ Last: Today 9:01am — 14 leads│
│ Next: Tomorrow 9:00am        │
│ ──────────────────────────── │
│ [████████░░] 80% budget      │
│ 47 leads this week           │
│ 3 traceable escalations     │
└─────────────────────────────┘
```

### The Reasoning Trace Panel

When Maria clicks on a running agent, a panel slides in from the right showing the agent's live reasoning:

```
┌─────────────────────────────────────────────────────┐
│ Lead Research — Working                    [−] [×]  │
├─────────────────────────────────────────────────────┤
│ 9:01:03  → Checking CRM for new leads...           │
│ 9:01:04  → Found 14 new leads                      │
│ 9:01:05  → 3 are existing customers (skipping)     │
│ 9:01:06  → 8 are new inquiries                     │
│ 9:01:07  → 2 mention large contract — flagging    │
│ 9:01:08  → Acme Corp: $50K potential — escalate   │
│ 9:01:09  → Drafting follow-up for Smith inquiry... │
│ 9:01:12  → Draft complete. Auto-approved.          │
│            Escalating Acme Corp lead.               │
│            Confidence: 0.31 (threshold: 0.85)      │
│ 9:01:13  → ⚠️ ESCALATE — waiting for Maria        │
└─────────────────────────────────────────────────────┘
```

This is the world-class harness UX. Maria watches her agent think in real time. She understands what it's doing without reading docs. She trusts it because she can see the reasoning.

### The Escalation Modal

```
┌─────────────────────────────────────────────────────┐
│ ✋ Lead Research Agent needs your input       [×]   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  The agent wants to draft a follow-up for:         │
│                                                      │
│  Company:  Acme Corp                                │
│  Value:    $50K potential                           │
│  Contact:  John Chen, VP of Operations               │
│                                                      │
│  Proposed follow-up:                                │
│  "Hi John, Thanks for your interest in our HVAC    │
│   services. I'd love to schedule a call..."        │
│                                                      │
│  ─────────────────────────────────────────         │
│  Reasoning: New company, high value ($50K).          │
│  Confidence: 31%. Below 85% threshold for new       │
│  companies. Escalated to Maria for review.          │
│  ─────────────────────────────────────────         │
│                                                      │
│  [Approve Draft] [Edit & Approve]                  │
│  [Skip This Lead] [Cancel]                          │
└─────────────────────────────────────────────────────┘
```

---

## 11. Technical Architecture

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
│        │         │  Durable     │    │  BullMQ Heartbeat          │   │
│        │         │  Runner      │◄───│  Scheduler                  │   │
│        │         │              │    └──────────────────────────┘   │
│        │         │  checkpoint/ │                                    │
│        │         │  resume      │                                    │
│        │         └──────┬───────┘    ┌──────────────────────────┐   │
│        │                │            │  Postgres                 │   │
│        │                ▼            │  agents, runs, steps,     │   │
│        │         ┌──────────────┐    │  checkpoints (append-only)│   │
│        │         │  Tool Layer  │    └──────────────────────────┘   │
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
│  │  Auth: Magic Link (email) + Row-Level Security             │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘

Phase 2 additions:
  ┌──────────────────────────────────────────────────────────────┐
  │  Long-Term Memory Microservice                                │
  │  mem0.ai (extraction) → Qdrant (vectors) + Postgres (facts)│
  │  Memory integrity: Maria confirms every extracted fact.    │
  │                                                              │
  │  PROACTIVE Webhook Receiver                                   │
  │  Gmail push → Cloudflare Worker → BullMQ wake immediately     │
  │                                                              │
  │  Permission Classifier                                        │
  │  TRANSCRIPT_CLASSIFIER: classifies tool calls → auto-approve │
  │  Output includes reasoning: why the decision was made.      │
  │  Custom rules: "always approve emails to @domain.com"        │
  └──────────────────────────────────────────────────────────────┘

Phase 3 additions:
  ┌──────────────────────────────────────────────────────────────┐
  │  Multi-Agent Orchestration                                    │
  │  Coordinator (fork + sidechain) → parallel workers           │
  │                                                              │
  │  Skills Directory                                             │
  │  skills/<name>/SKILL.md — bundled agent configs             │
  │                                                              │
  │  Remote Bridge                                               │
  │  git worktree isolation + JWT heartbeat + work polling        │
  └──────────────────────────────────────────────────────────────┘
```

### Streaming Tool Execution

```
Agent reasons → LLM streams token by token
Tool calls fire as they are generated — before reasoning completes
Maria sees "Checking inbox..." immediately, not after full reasoning
Gmail read: parallel-safe (runs concurrently with other tools)
Gmail send: serial-only (one send at a time per agent)
```

### Permission Auto-Approval (Phase 2)

```
Tool call requested
  → TRANSCRIPT_CLASSIFIER evaluates: is this routine for this user's patterns?
  → Confidence > 90%: auto-execute + notify after (with reasoning explanation)
  → Confidence 70-90%: execute + notify after
  → Confidence < 70%: pause, show escalation modal
  → User decision updates classifier → next similar call is easier
```

The classifier **outputs its reasoning**, not just a confidence score. Maria always knows why the agent auto-approved or escalated.

---

## 12. Phased Roadmap

### Phase 1 — MVP (Days 0–90): Prove the Thesis

**Goal:** A non-technical user can hire a persistent, durable AI employee in under 5 minutes, trust it to work, and trace everything it did.

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
| Activity log | Ticket-based, searchable, **exportable**, 90-day retention |
| Immutable audit trail | Append-only step log; SHA-256 hashes; no UPDATE/DELETE |
| Magic link auth | Password-free email auth |
| Push notifications | Escalations reach Maria immediately |
| Approved contact list | Agent can only email recipients on Maria's approved list |

**Success condition:** Maria hires her first agent on Day 2. On Day 3, she wakes up to "Lead Research Agent processed 14 leads while you slept." She can trace every lead the agent touched — which ones, what it did, why — in under 2 minutes.

**What we are NOT shipping:** Template gallery (beyond 3 agent archetypes), multi-agent, long-term memory, PROACTIVE, Calendar, HubSpot, governance board, auto-pause, skills directory, permission auto-approval, memory integrity verification.

---

### Phase 2 — Differentiate (Days 90–180): Make It Unstoppable

**Goal:** AgentOS has durable competitive moats that Anthropic cannot replicate because they are a model company.

**Features:**

| Feature | Description | Competitive Moat |
|---------|-------------|------------------|
| **Permission auto-approval** | TRANSCRIPT_CLASSIFIER-inspired AI classifier. Routine actions auto-execute. Only unusual ones escalate. **Outputs reasoning** for every decision. | Anthropic's classifier trains on code. Ours trains on business workflow patterns. Domain-specific. |
| **Long-term memory** | mem0.ai + Qdrant. Agent remembers Maria's preferences across sessions. | Always-on learning. Competitors start fresh every session. |
| **Memory integrity** | Every extracted fact is confirmed or denied by Maria. Hallucinations are flagged and corrected. | Hallucination guard creates a trust feedback loop that improves over time. |
| **PROACTIVE mode** | Event-driven webhook → agent wakes immediately when new work arrives, not on next heartbeat. | 2-minute latency from new lead/inquiry to agent action. Not next-day. |
| **Template gallery** | 8–10 pre-built agents. Verticalized: HVAC Lead Handler, Legal Intake, Real Estate Research. | Vertical expertise. Not generic. Compliance-ready templates. |
| **Skills directory** | skills/<name>/SKILL.md — bundled agent configs with YAML frontmatter | Templates upgradeable without re-hire. Maria keeps memory and approval history. |
| **Auto-pause on budget** | Agent pauses when budget exceeded. Maria resumes when ready. | Trust feature — agent doesn't overspend. |
| **Governance board** | Tier 2: structural changes (new tools, new agents) require approval | Safety for business owners. Audit trail of governance decisions. |

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

## 13. Business Model

### The ROI Math

Maria pays $2,000/month for a VA. Her VA:
- Checks one domain of work once a day (morning)
- Doesn't work while Maria sleeps
- Doesn't remember context across sessions
- Doesn't produce an audit trail
- Costs $2,000/month

AgentOS with one AI employee:
- Works always-on (PROACTIVE mode, Phase 2)
- Has memory across sessions
- Handles 80%+ of delegated work autonomously (Phase 2)
- Produces a complete, exportable audit trail
- Costs $199/month per agent

**ROI: 10x cost reduction. The product pays for itself immediately. And Maria can answer her accountant's questions.**

### Pricing Tiers

| Plan | Price | Agents | Features |
|------|-------|--------|---------|
| **Starter** | $99/month | 1 agent | MVP features, Gmail only, audit log |
| **Professional** | $249/month | 3 agents | Phase 1 + Phase 2 features, Calendar |
| **Business** | $499/month | 5 agents | All Phase 2 features, PROACTIVE, memory |
| **Team** | $999/month | Unlimited | Phase 3 features, multi-user, HubSpot |

**Trial:** 14-day free trial. No credit card required. Full features.

**Enterprise:** Custom pricing. Remote bridge. SLA. Dedicated support. Compliance audit packages.

### The Vertical Template Opportunity

Vertical templates (pre-built agents for specific industries) create category-defining products — and the trust infrastructure that regulated industries demand:

- **HVAC Lead Agent** ($99/month): "Handles inbound leads, dispatches service calls, triages urgency. Full audit trail for job costing."
- **Real Estate Research Agent** ($149/month): "Monitors listings, researches comparables, drafts follow-up. Compliance-ready activity log."
- **Legal Intake Agent** ($199/month): "Screens intake inquiries, captures client info, routes to appropriate attorney. Attorney-grade audit trail."

Anthropic will never build these. They are a model company. We become the Canva of regulated-industry AI employees.

---

## 14. Success Metrics

### Product Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first agent | < 5 min from signup | Session timestamp: signup → first agent activated |
| Activation rate | > 60% of signups hire an agent | signups with ≥1 activated agent / total signups |
| AHA moment rate | > 50% experience it by day 3 | Agent completes work before user's first app open that day |
| **Audit query time** | < 5 min | Time for Maria to answer "what did my agent do last Tuesday?" |
| **Audit export completion** | 100% | All exported records match source data (hash verification) |
| Auto-approval precision (Phase 2) | > 90% | Auto-approved actions requiring no reversal / total auto-approved |
| Auto-approval coverage (Phase 2) | > 80% | Auto-approved calls / total tool calls |
| Escalation precision | > 95% | Escalated items user confirms were correct / total escalated |
| Missed escalation rate | < 5% | Escalations user says should have been auto-approved / total auto-approved |
| Agent completion rate | > 90% | Completed runs / scheduled runs |
| PROACTIVE response latency (Phase 2) | < 2 min | New lead/inquiry arrival → agent acted or escalated |

### Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Trial → Paid conversion | > 25% | Paid subscriptions / trial signups |
| Monthly churn | < 5% | Cancelled subscriptions / total at month start |
| NPS | > 40 | "How likely to recommend?" (0-10) at day 30 |
| Agent retention | > 70% | Active agents after 30 days / total activated |
| Support ticket rate | < 5% | Users filing support tickets / MAU |
| **Compliance export requests** | Tracked | Number of users exporting audit logs monthly |

### Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent survival rate | > 95% | Successful wakes / scheduled wakes |
| Resume success rate | > 99% | Resumed runs / interrupted runs |
| Checkpoint completeness | 100% | All state transitions logged vs. expected |
| Idempotency correctness | 0 duplicates | Tool calls with same idempotency key |
| **Audit log integrity** | 100% | Append-only table has no UPDATE/DELETE violations |
| **Cross-tenant isolation** | 0 cross-tenant leaks | Postgres RLS policy enforced on all queries |
| PROACTIVE webhook latency (Phase 2) | < 30s | Gmail push → agent wake |

---

## 15. Document Roadmap

### Documents Required to Execute This PRD

The PRD defines *what* we are building. These documents define *how*.

#### Prerequisite (Before Any Engineering)

| Document | Purpose | Owner |
|----------|---------|-------|
| **PRD v5 (this document)** | Product definition. Source of truth. | Product |
| **Legal Review: Anthropic Reference** | PRD uses "publicly available Claude Code behavior" framing. Legal counsel must confirm this framing is sufficient before external sharing. See `docs/legal-review-2026-04-01.md`. | Legal |
| **User Interview Guide: MVP Hypothesis** | 5 Maria interviews to validate: (1) Would you hire an agent for $199/month? (2) Is 5 minutes to first agent fast enough? (3) Does the auditability framing resonate? | Product |
| **Harness Architecture Reference** | Internal engineering reference. Claude Code patterns mapped to AgentOS implementation. Not for external sharing. | Engineering |

#### Phase 1 — MVP (Days 0–90)

| Document | Purpose | Dependencies |
|----------|---------|-------------|
| **Design System v1** | Color tokens, typography, spacing, component library. | PRD v5 |
| **Spec: Reasoning Trace Format** | JSON schema for streaming reasoning events. SSE contract. | PRD v5 |
| **Plan: Phase 1 Execution** | Full Phase 1 build plan. Maps MVP features to implementation units. | PRD v5, Harness Architecture Reference |
| **Plan: Durable Execution** | BullMQ + Postgres checkpoint/resume. Heartbeat scheduler. Immutable step log. | PRD v5, Harness Architecture Reference |
| **Plan: NL-to-Agent Deployment** | GPT-4o → agent config. Prompt design. Fallback behavior. Error handling. | PRD v5 |
| **Plan: Canvas UI** | React component specs for org chart, agent cards, reasoning trace panel. | PRD v5, Design System |
| **Plan: Gmail Integration** | OAuth flow, token storage, read/compose/send tools, rate limiting. Approved contact list enforcement. | PRD v5, Harness Architecture Reference |
| **Plan: Audit Trail API** | Immutable step log schema, SHA-256 hashing, append-only enforcement, export endpoints. | PRD v5, Harness Architecture Reference |

#### Phase 2 — Differentiate (Days 90–180)

| Document | Purpose | Dependencies |
|----------|---------|-------------|
| **Plan: Permission Auto-Approval** | TRANSCRIPT_CLASSIFIER architecture. Training data. Confidence thresholds. **Explainable decisions.** | PRD v5, Phase 1, Harness Architecture Reference |
| **Plan: Long-Term Memory Microservice** | mem0.ai + Qdrant + Postgres. Recall/remember API. Memory integrity. | PRD v5, Phase 1, Harness Architecture Reference |
| **Plan: Memory Integrity** | Fact verification UI. Hallucination guard. Confirmed/denied fact loop. | PRD v5, Phase 1, Harness Architecture Reference |
| **Plan: PROACTIVE Webhook Receiver** | Gmail push → Cloudflare Worker → BullMQ wake. Scale to N users. | PRD v5, Phase 1, Harness Architecture Reference |
| **Plan: Template Gallery** | 8 vertical templates. SKILL.md schema. Gallery UI. Compliance metadata. | PRD v5, Phase 1 |
| **Plan: Skills Directory** | skills/<name>/SKILL.md schema. Loader. Versioning. | PRD v5, Phase 1 |
| **Plan: Governance Board** | Tier 2 escalation UI. Server-side verification. | PRD v5, Phase 1 |
| **Ops: mem0.ai Cost Monitoring** | Per-user cost tracking. Alert thresholds. Quotas. | Long-Term Memory plan |

#### Phase 3 — Scale (Days 180–270)

| Document | Purpose | Dependencies |
|----------|---------|-------------|
| **Plan: Multi-Agent Orchestration** | Coordinator → fork workers. Phase 3 of Claude Code patterns. | PRD v5, Phase 2 |
| **Plan: Skills Marketplace** | User-created skills. Discovery. Sharing. | PRD v5, Skills Directory |
| **Plan: Remote Bridge Architecture** | Git worktree isolation. JWT heartbeat. Enterprise deployment. | PRD v5, Phase 2 |
| **Plan: Team Collaboration** | Multi-user auth. Role-based access. Shared agent teams. | PRD v5, Phase 2 |

#### Cross-Cutting (All Phases)

| Document | Purpose | Owner |
|----------|---------|-------|
| **Data Model** | ERD: users, agents, runs, checkpoints, steps (append-only), oauth_tokens, memories, learned_facts | Engineering |
| **API Contract** | REST API spec for all endpoints. Auth. Rate limits. | Engineering |
| **Security Model** | OAuth token encryption at rest. PII handling. GDPR. Data retention. **Row-level security. Cross-tenant isolation audit.** | Security/Eng |
| **Alerting & On-Call** | P1/P2/P3 alerts for all production systems. Runbooks. | DevOps |
| **Deployment Config** | Vercel config. Environment variables. Secrets management. | DevOps |
| **Monitoring & Observability** | Metrics dashboards. Latency SLOs. Error rates. **Audit log integrity monitor.** | DevOps |

---

## Appendix: What the Claude Code Leak Gave Us

*(For internal engineering reference only — do not share externally)*

Claude Code v2.1.88 (2026-04-01) — 512,000 lines, 1,906 TypeScript files.

Analysis of Claude Code's architecture revealed production-grade implementations of:

| Pattern | Scale | What It Showed Us |
|---------|-------|------------------|
| QueryEngine core loop | 46,000 lines | Central state machine. Typed exit reasons. Token tracking. Streaming. All other modules plug into this. |
| Tool.ts | 29,000 lines | Every tool has: name, schema, permission scope, concurrency rules, rate limits. Single source of truth. |
| Streaming tool execution | Full file | Tools fire during token generation. Partitioned by concurrency safety. |
| Typed exit reasons | Throughout | `completed \| escalated \| error \| max_steps \| budget_exceeded` — explicit state machine, not implicit |
| Three-layer memory | MEMORY.md | Working → compressible transcript → long-term. Auto-healing: intermediate chains discarded, distilled facts kept. |
| Context compaction | AUTOCOMPACT_BUFFER_TOKENS = 13,000 | Compaction fires 13k tokens below effective limit. 20k reserved for summary output. Discards reasoning chains, keeps compressed digest. |
| Permission scopes | Tool.ts | Every tool has permission tiers. Scope evaluated before execution. |
| Heartbeat scheduling | scheduleRemoteAgents.ts | Cron-based wake + event-driven override. PROACTIVE pattern. |
| Multi-agent fork | forkSubagent.ts, runAgent.ts | Sidechain transcripts. Fork recursion guard. Parent/worker memory isolation. |
| Idempotency keys | Throughout | ULID-based per tool call. Replay returns cached result. |

**The critical insight:** These are not features. They are the engineering substrate. Maria never sees `Tool.ts`. She experiences an agent that works reliably, never loses context, and explains itself completely.

**How we adapted these patterns** — and what we deliberately changed — is documented in `docs/harness-architecture-reference.md`. The key principle: Claude Code runs on the user's machine; AgentOS runs on our cloud servers accessing Maria's Gmail via OAuth. Every pattern that works because it's local must be re-examined for multi-tenant SaaS. The tool permission model, the memory system, and the telemetry architecture are all fundamentally different in AgentOS — by design.

---

*Last updated: 2026-04-01*
*Owner: Product*
*Status: Active — Source of Truth*
*Version: 5.0 (replaces v4)*
