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

**"Build your AI team. On a canvas. In plain English."**

AgentOS is an **infinite visual canvas** for composing AI agent teams — with **Canva-level simplicity** and **world-class engineering underneath**.

The comparison is not "n8n for AI agents." It's not a workflow builder. It's a **team composition tool**: you build teams of AI employees on an infinite canvas, each agent is a node you can prompt into existence, configure manually, or wire together visually.

Think: n8n's canvas meets paperclip.ai's spatial AI UI — where every node is a persistent, memory-enabled AI employee that works while you sleep.

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

**An infinite visual canvas for composing AI agent teams — where agents are persistent employees, not pipeline steps.**

AgentOS has two layers:

**The Canvas (n8n-style):** An infinite 2D canvas where each node is an AI agent. Nodes connect to each other, pass work between them, and report status visually. You compose teams by dragging nodes, wiring connections, and prompting new nodes into existence. This is one team — spatially composed, visually legible.

**The Portfolio (paperclip.ai-style):** Multiple canvases = multiple teams. Each canvas is a domain of work — HVAC operations, marketing research, client intake. You navigate between canvases the way you navigate between projects. Maria's whole business, organized as agent teams.

### The Threefold Moat

**Moat 1 — The Canvas UX:** An infinite, programmable canvas that makes AI team composition as intuitive as arranging sticky notes. Composable, visual, spatial. No other product combines this UX with a world-class harness underneath.

**Moat 2 — Trust Infrastructure:** Auditability, memory integrity, security primitives built in before features. Not bolted on after. Every business needs to answer "what did my agent do?" — AgentOS makes that answerable.

**Moat 3 — Domain Depth:** Vertical agent archetypes for regulated industries (HVAC, legal, real estate) that require auditable, judgment-capable AI employees. This takes 12-18 months to get right and cannot be cloned by downloading a reference harness and shipping in 90 days.

### The Five Pillars

1. **Infinite Canvas** — An n8n-style infinite canvas. Drag agents, wire connections, compose teams visually. Pan, zoom, arrange. The canvas is always there, always showing your teams.

2. **NL-to-Node** — Type "add a lead research agent" or "add a node between intake and follow-up" — the canvas responds. Agents can be prompted into existence or configured manually.

3. **Persistent Agent Nodes** — Each node is a real AI employee: durable execution, cross-session memory, reasoning traces, and scheduled or event-driven wake cycles. Not a pipeline step — a worker with judgment.

4. **Real-Time Reasoning Traces** — Watch any agent think in real time. Every decision is visible, timestamped, and logged. When it escalates, you see exactly why.

5. **Auditability** — Every tool call, every LLM decision, every learned fact is logged with cryptographic integrity. Full decision history exportable for compliance.

---

## 4. The Competitive Window

### The Old Thinking (v4)

*"6-12 months before Anthropic or a well-funded competitor figures out what we're doing."*

This was wrong. The 6-12 month window is not for **building the harness** — that's already commoditized. ClawCode reached 74k stars hours after the leak. Every engineering team with 3 months and a reference implementation can clone the durable execution, checkpoint/resume, and streaming patterns.

### The New Thinking (v5)

The window is for **becoming the trusted, auditable canvas for AI agent teams** — before n8n adds AI agents, before paperclip.ai adds trust infrastructure, before a well-funded entrant combines the two.

The competitive landscape on the canvas layer:
- **n8n** has the visual canvas. It has no AI agents, no memory, no trust layer.
- **paperclip.ai** has spatial AI UI. It is early and experimental.
- **Neither** combines an infinite canvas with a world-class harness AND a full trust infrastructure underneath.

The window is 12-18 months before one of them closes the gap. The differentiation is: world-class harness (durable execution, checkpointing) + infinite visual canvas (n8n-style) + full trust infrastructure (audit trails, memory integrity, compliance) — all three together.

### The Cambrian Explosion Is Real

The leaked Claude Code source (v2.1.88, 512,000 lines, 1,906 TypeScript files) showed the world what production-grade agent infrastructure looks like. It handed every builder a reference architecture.

This means:
- **The baseline is rising.** Every new entrant will have durable execution and streaming traces within 90 days.
- **The differentiator is above the harness.** Trust, audit, compliance, domain depth.
- **The winner is not the first mover.** It's the one trusted with the most sensitive business data.

---

## 5. What We Are NOT Building

**Not a traditional workflow tool.** Zapier, Make, n8n run pipelines: each step executes once per trigger, nothing persists between runs, nothing learns. AgentOS runs teams: agents are persistent workers with memory, judgment, and scheduled behavior. The canvas shows a team, not a pipeline.

**Not a chat interface.** ChatGPT, Claude.ai are conversation tools. You type, it responds, done. There's no persistent worker, no canvas, no team. AgentOS is not conversational — it's organizational.

**Not a developer tool.** Claude Code, Copilot, Devin are for engineers. They assume technical literacy. AgentOS assumes none. You compose teams visually or by typing plain English — not by writing code or configuring JSON.

**Not a single-agent product.** One agent is a demo. The product is teams of agents, composed on a canvas, working in parallel, passing results between nodes, reporting to Maria as a unit.

**Not "build the harness fast and add trust later."** Trust primitives — audit logging, memory integrity, security isolation — must be built into the foundation from day one.

---

## 6. Core Product Concept

### The Team Composition Metaphor

You don't configure a workflow. You **compose a team**.

| Workflow Builder | AgentOS |
|---|---|
| You drag steps and connect triggers | You drag nodes and wire them together |
| Every run starts fresh | Agents remember previous sessions |
| You check the output | Agents notify you when they need input |
| A pipeline is a tool | A team is an organizational unit |
| What ran is a log | What happened is fully traceable |

### The Canvas Interaction Model

Maria builds her team in three ways, in any combination:

| Mode | What Maria Does |
|---|---|
| **Visual** | Drag a new agent node onto the canvas. Wire it to other nodes. Configure it by clicking. |
| **Prompt** | Type "add a lead research node between intake and follow-up" — the canvas updates. |
| **Hybrid** | Drag a pre-built archetype onto the canvas, then prompt to customize: "make this one flag anything over $8K." |

Most users start with a pre-built archetype and customize it with one or two prompts. Power users compose complex teams visually.

### The Abstraction Ladder

Maria operates at the layer she's comfortable with. She can go deeper if she wants, but she never has to.

| Layer | What Maria Says | What It Means |
|------|---------------|---------------|
| **1 — Archetype** | Drag "Lead Research Agent" onto the canvas | Agent infers everything: schedule, tools, escalation |
| **2 — Prompt** | "Make it flag anything over $10K" | She controls escalation rules by prompting |
| **3 — Configure** | Click the node, set schedule, set budget | She controls schedule + budget directly |
| **4 — Wire** | Drag a connection between two nodes | She composes multi-node teams visually |

Most users start at Layer 1. The system surfaces Layer 2 naturally ("anything else?"). Deeper layers are available but not required.

### The AHA Moment

Not a single dramatic reveal. Trust is earned incrementally.

**Monday:** Maria opens the canvas. It's empty. She drags a "Lead Research Agent" archetype onto the canvas. The system shows her a preview node with what it inferred: schedule, tools, escalation rules. She clicks "Hire." The agent appears on the canvas.

**Tuesday:** She wakes up to a notification: **"Lead Research Agent handled 14 leads while you slept. 2 escalated."** She didn't have to check. The agent just worked.

She taps the escalation. She sees the reasoning trace: *"Agent wanted to draft a follow-up for Acme Corp — $50K potential deal. I didn't auto-approve because this is a new company. Here's the full reasoning."* She approves in 10 seconds.

**Two weeks in:** Maria realizes she almost started her morning by researching a lead before remembering the agent already did it. She opens the canvas — her team is there, status visible, reasoning traces available. She can trace every decision the agent made.

**A month in:** Maria has a team of 3 agents on the canvas. She goes on vacation. Her agents handle everything. She gets back to a summary: **"3 agents worked 12 days. Processed 47 leads. Drafted 31 follow-ups. 4 escalated. All traceable."** Her accountant asks what the AI did. She exports a compliance report in 2 minutes.

---

## 7. The MVP

### What the MVP Must Prove

The MVP is not a template or a feature. It is proof of the thesis:

> **A non-technical business user can compose an AI team on a visual canvas, put them to work in under 5 minutes, trust them to operate, and trace everything they did.**

### MVP Feature Set

**What ships in the MVP:**

1. **Infinite Canvas** — Maria opens the app to an empty canvas with a prompt bar: "What do you want your team to do?" She can also drag pre-built archetypes onto the canvas. Pan, zoom, arrange nodes. The canvas is always there.

2. **Agent Archetypes** — Three drag-and-drop archetypes: Lead Research, Customer Follow-Up, Research Monitor. Drag one onto the canvas — the system infers its configuration and shows a preview node.

3. **NL-to-Node** — Type into the canvas prompt: "add a lead research node between intake and follow-up" — the canvas updates. Type: "make it flag anything over $8K" — the node updates. Natural language controls the canvas.

4. **Visual Node Composition** — Drag nodes to reposition. Wire nodes together by dragging a connection between them. Click a node to configure schedule, budget, escalation rules directly. Visual, spatial, direct manipulation.

5. **Tool Integrations** — Each node connects to business data via OAuth integrations (Gmail, Calendar, HubSpot, Slack). Agents can read, draft, and act on real business data. Real work, not demos.

6. **Durable Execution** — Each agent node is a persistent process. It checkpoints after every action. Server restarts don't kill in-flight work. Every state transition is logged.

7. **Real-Time Reasoning Traces** — Click any running node. Maria watches her agent think — streamed live: "Processing Acme Corp... Checking deal size... $50K... Drafting follow-up... Escalating because new company..."

8. **Escalation Modal** — When any node needs human input, Maria gets a push notification. She opens the modal, sees the reasoning, and decides: Approve / Edit / Skip / Cancel.

9. **Node Status at a Glance** — Each node shows a status dot: green (idle), pulsing green (working), amber (waiting for approval), gray (paused). Maria sees her whole team status without opening anything.

10. **Activity Log** — Every agent action across all nodes is logged. Searchable. Filterable. **Exportable.** 90-day retention.

11. **Magic Link Auth** — Maria signs in with email. No passwords.

12. **Push Notifications** — Escalations reach Maria immediately. Not in-app polling. Real push.

13. **Immutable Audit Trail** — Every tool call is logged with: timestamp, actor, input hash, output hash, LLM reasoning text. Maria can query her full audit history. Logs are tamper-evident (append-only).

14. **Escalation Suggestions** — After every completed run, the agent evaluates whether suggestions apply. It may surface: recurring schedule proposals ("this task ran 3 times — I could run it automatically every Monday"), follow-on task proposals ("you could add a follow-up step after this"), and connector gap alerts ("I tried to use HubSpot but it's not connected"). Suggestions appear as dismissible cards on the canvas. This is the agent self-proposal pattern — the most "agent-like" behavior in Perplexity Computer. Maria can accept, ignore, or refine any suggestion.

### What Is NOT in the MVP

- **Advanced multi-node orchestration** — MVP supports wiring 2-3 nodes together. Complex fork/join patterns, parallel fan-out, and cross-node state coordination are Phase 2+.
- **Template gallery** — MVP has 3 pre-built archetypes. Full gallery with 8+ templates ships at Phase 2.
- **Long-term memory** — Working memory ships in MVP. Cross-session memory (mem0 + Qdrant) ships at Phase 2.
- **Additional tool integrations** — Gmail + Google Drive (MVP). HubSpot and Slack ship in Phase 2. Sufficient to prove the model and complete the Monday CSV automation loop. See `docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md`.
- **Skills directory** — Phase 2
- **Multi-canvas portfolio** — MVP is one canvas. Phase 2 adds the paperclip-style portfolio view for multiple teams.
- **Governance board** — Phase 2
- **Auto-pause on budget** — Phase 2
- **PROACTIVE always-on mode** — Phase 2 (MVP uses scheduled heartbeats)
- **Permission auto-approval** — Phase 2 (MVP requires approval for every non-trivial action)
- **Memory integrity verification** — Phase 2

### The MVP Proves the Canvas Thesis

The MVP has one canvas, three archetypes, and basic node wiring. This is sufficient to prove: a non-technical user can compose a team on a visual canvas and put them to work.

The full product is a portfolio of canvases, each representing a domain of work. Phase 2 delivers that.

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

### The Coordinator Pattern

Each canvas has one **Team Lead** — a full LLM agent visible on the canvas, managing the team. The Team Lead is not infrastructure — it is an agent with its own context, its own reasoning, its own tools. It is the Paperclip CEO, adapted for AgentOS.

**The product metaphor:** The Team Lead is the foreman on a work floor. It doesn't do the specialized work — it watches the specialists, assigns tasks, collects results, and knows when to bring in the boss (Maria) for decisions. It is a real AI employee, not a message broker.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      TEAM LEAD (visible node)                          │
│  - Full LLM agent with own context and tools                        │
│  - Reasons about task decomposition                                   │
│  - Assigns sub-tasks to workers                                      │
│  - Monitors reasoning traces via SSE                                  │
│  - Routes escalations to Maria                                       │
│  - Aggregates final output                                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  Worker A   │     │  Worker B   │     │  Worker C   │
   │ (Lead Res.) │     │ (Follow-Up) │     │ (Monitor)  │
   │  Sandbox    │     │  Sandbox    │     │  Sandbox   │
   │  Context:   │     │  Context:   │     │  Context:  │
   │  isolated   │     │  isolated   │     │  isolated  │
   │  Tools:     │     │  Tools:     │     │  Tools:    │
   │  HubSpot    │     │  Gmail      │     │  Web scrap │
   └─────────────┘     └─────────────┘     └─────────────┘
          │                   │                   │
          └───────────────────┴───────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Wire carries:  │
                    │  Output artifact │
                    │  (email draft,  │
                    │   lead profile) │
                    │  NOT context    │
                    └─────────────────┘
```

**Key properties:**

| Property | Rule |
|---|---|
| Team Lead is a full LLM agent | Has its own context window, system prompt, tool calls, token budget |
| Worker nodes are sandboxed | Each worker has isolated context. Team Lead watches via SSE, doesn't share context with workers. |
| Wire scope | Wires carry output artifacts (drafts, profiles, summaries), not raw context tokens. |
| Escalation path | Worker → Team Lead → Maria. The Team Lead triages and routes. |
| Coordinator continuity | One Team Lead per canvas. Survives worker restarts. Persists across canvas sessions. |
| No worker cap | Workers can be added or removed without restarting the Team Lead. Wires are hot-swapped. |

#### The Team Lead Node

The Team Lead appears as a distinct node type on the canvas — visually distinct from worker nodes (different border color, different icon, distinct tooling badge).

Maria can:
- Prompt the Team Lead directly: "reprioritize the team's work today"
- Click it to see its reasoning trace — how it decomposed a task, why it assigned work to a particular worker
- Rename it: "Lead Coordinator," "Office Manager," "Foreman" — Maria names her Team Lead

The Team Lead has a system prompt constructed from:
- The canvas goal: what the team is trying to accomplish
- Worker capabilities: what each wired worker can do
- Maria's preferences: from past approvals and edits
- Escalation history: patterns of what Maria has approved or rejected

#### How Wiring Works

A wire between Worker A and Worker B means: "when Worker A completes, pass its output to Worker B as input."

The Team Lead manages the handoff:
1. Worker A completes — produces an output artifact (e.g., a drafted email)
2. Team Lead receives the artifact
3. Team Lead validates the artifact against Worker B's expected input schema
4. If valid, Team Lead invokes Worker B with the artifact as input
5. If invalid, Team Lead flags a wiring error (Maria sees: "Worker B couldn't accept Worker A's output — check the wire")

This keeps workers decoupled. Worker A doesn't need to know about Worker B. The Team Lead knows the full wire graph.

#### Escalation Flow

```
Worker A detects escalation condition
  → Pauses its reasoning
  → Emits escalation event to Team Lead via SSE
  → Team Lead receives: { worker_id, reason, proposed_action, reasoning_trace }
  → Team Lead evaluates: should I route this to Maria, or can I handle it?
  → If route: Team Lead pauses Worker A's wire outputs
  → Team Lead routes escalation to Maria (push notification + inbox)
  → Maria resolves: Approve / Edit / Skip / Cancel
  → Team Lead applies Maria's decision to Worker A
  → Team Lead resumes Worker A or terminates based on decision
```

**The Team Lead's escalation context** includes:
- Which worker escalated and why
- The full reasoning trace at the moment of escalation
- The proposed action and its confidence
- What downstream workers would have received (blast radius)
- Team Lead's own reasoning: why it chose to escalate vs. auto-resolve

#### Team Lead vs. Worker Responsibilities

| | Team Lead | Worker |
|---|---|---|
| **Role** | Foreman / Office Manager | Specialist |
| **Context** | Team-level: knows all workers, wire graph, task state | Task-level: knows its own job |
| **Memory** | Full LLM context — can reason across entire team | Bounded — focused on assigned sub-task |
| **LLM calls** | Task decomposition, escalation triage, result aggregation | Execute tools, draft outputs |
| **Visible to Maria?** | Always — distinct node on canvas | Always — worker node on canvas |
| **Tools** | Access to team state, worker orchestration, escalation routing | Access to domain tools (HubSpot, Gmail, etc.) |
| **Pricing impact** | Burns tokens 24/7 while canvas is active | Burns tokens per task |

#### n8n / Slack / Paperclip Reference Points

| Pattern | Reference |
|---|---|
| Canvas (nodes + wires) | n8n — infinite canvas, drag nodes, wire connections |
| Team Lead as visible coordinator | Paperclip — CEO agent, org chart visible |
| Activity feed / escalations | Slack — push notifications, escalations arrive like messages |

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

### The Infinite Canvas (n8n-style)

The canvas is an **infinite, zoomable 2D workspace** — not a dashboard, not a flowchart. Maria's team lives here.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  AgentOS              My Canvas                    [Activity] [Canvas ▾] [⚙]        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ← Zoom: [−] [100%] [+]    [Fit to view]                    [🔍 Search nodes]     │
│                                                                                      │
│                                                                                      │
│        ┌──────────────────┐           ┌──────────────────┐                        │
│        │ 🔵 Lead Research │──────────▶│ 🔵 Follow-Up    │                        │
│        │ 🟢 idle          │           │ 🟢 idle          │                        │
│        │ 14 leads today   │           │ 31 drafts       │                        │
│        └──────────────────┘           └──────────────────┘                        │
│                                                                                      │
│                                                                                      │
│                                      ┌──────────────────┐                           │
│                                      │ 🔵 Research      │                           │
│                                      │ 🟠 waiting       │                           │
│                                      │ Acme Corp (1)    │                           │
│                                      └──────────────────┘                           │
│                                                                                      │
│                                                                                      │
│  ─────────────────────────────────────────────────────────────────────────────     │
│  [Prompt: "add a lead routing node" or drag from Archetypes]                       │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Key UX principles:**

- The canvas is infinite — pan in any direction, zoom in/out
- Nodes are spatially composed — Maria arranges her team visually, like sticky notes on a whiteboard
- Connections between nodes show data flow — wires, not arrows
- Status is visible at a glance — each node has a color-coded status dot
- The prompt bar is always visible at the bottom — always inviting

### The Archetype Sidebar

Maria drags archetypes from a sidebar onto the canvas:

```
┌────────────────────────────────────┐
│  Agent Archetypes                  │
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │ 🔵 Lead Research Agent       │  │
│  │ "Research leads, flag big    │  │
│  │  deals, draft follow-ups"   │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ 🔵 Customer Follow-Up Agent  │  │
│  │ "Draft follow-ups for        │  │
│  │  closed-won deals"          │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ 🔵 Research Monitor          │  │
│  │ "Monitor competitors, alert  │  │
│  │  on relevant news"           │  │
│  └──────────────────────────────┘  │
│                                    │
│  [─────── drag onto canvas ─────]  │
└────────────────────────────────────┘
```

Dragging an archetype onto the canvas creates a new node, already configured with inferred schedule, tools, and escalation rules. Maria can adjust by clicking the node or prompting.

### The Node

Each node on the canvas is a persistent AI employee. Click to open the node detail:

```
┌─────────────────────────────────────────────────────┐
│  Lead Research Agent                          [⋯] │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Status: 🟢 Idle                                     │
│  Schedule: Daily 9am UTC                             │
│  Tools: HubSpot (read), Gmail (send)               │
│  Escalation: Flag deals over $10K                   │
│  Budget: 80% used this cycle                        │
│                                                       │
│  ─────────────────────────────────────────           │
│  Last run: Today 9:01am — 14 leads processed       │
│  Next run: Tomorrow 9:00am                          │
│                                                       │
│  Reasoning trace (last run):                        │
│  ┌─────────────────────────────────────────────┐     │
│  │ 9:01:03 → Checking HubSpot for new leads  │     │
│  │ 9:01:04 → Found 14 new leads              │     │
│  │ 9:01:07 → 2 mention large contracts       │     │
│  │ 9:01:08 → Acme Corp: $50K — escalate      │     │
│  │ 9:01:12 → Drafting follow-ups...          │     │
│  │ 9:01:14 → 2 escalated. 12 auto-approved.  │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  [View full reasoning] [Edit node] [Pause]           │
└─────────────────────────────────────────────────────┘
```

### Wiring Nodes Together

Maria wires two nodes by dragging from one node's output handle to another node's input handle:

```
  Worker A (Lead Research)       Worker B (Follow-Up)
  ┌──────────────────┐           ┌──────────────────┐
  │ Lead Research    │           │ Follow-Up        │
  │          [out] ──┼──────────▶│ [in]             │
  └──────────────────┘           └──────────────────┘
                                        │
                                        ▼
                                  ┌──────────────────┐
                                  │ Maria (approval) │
                                  │ [escalation]     │
                                  └──────────────────┘
```

The wire carries the output of Node A into Node B. When Lead Research escalates, the escalation goes to Maria — not into the wire.

### The Prompt Bar

The prompt bar at the bottom of the canvas responds to natural language:

| Maria types | Canvas does |
|---|---|
| "add a lead research node" | Creates a new Lead Research node at the center of the viewport |
| "make it flag anything over $8K" | Updates the selected node's escalation rule |
| "add a routing node between lead research and follow-up" | Inserts a new routing node in the wire between those nodes |
| "show me what happened yesterday" | Opens the activity log filtered to the last 24 hours |

### The Escalation Modal

When any node escalates, Maria gets a push notification. Tapping it opens the escalation modal:

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

### The Portfolio (paperclip.ai-style) — Phase 2

Phase 2 adds a portfolio view above the canvas:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  AgentOS              [My Canvas ▾]                    [Activity] [⚙]            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   ○ HVAC Operations         ← currently viewing                                      │
│   ○ Marketing Research                                                           │
│   ○ Legal Intake                                                              │
│   ○ + New Canvas                                                              │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Each circle is a canvas. Maria switches between canvases to manage different teams. This is the paperclip.ai layer — spatial, flat, navigable.

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
│  │  infinite  │  │  intent →    │  │  traces + status updates  │  │
│  │  workspace │  │  node config │  │                           │  │
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

**Goal:** A non-technical user can compose an AI team on a visual canvas, put them to work in under 5 minutes, trust them to operate, and trace everything they did.

**Feature Delivery:**

| Feature | Description |
|---------|-------------|
| Infinite canvas | n8n-style zoomable 2D workspace; pan, zoom, drag nodes |
| Agent archetypes | 3 drag-and-drop archetypes: Lead Research, Customer Follow-Up, Research Monitor |
| NL-to-node | Canvas prompt bar responds to natural language; add, customize, wire nodes |
| Visual node wiring | Drag between node handles to wire connections; data flows along wires |
| Durable execution | BullMQ + Postgres checkpoints; server restart survival |
| Real-time reasoning traces | Streaming tool execution per node; Maria watches any node think live |
| Escalation modal | Approve / Edit / Skip / Cancel |
| Node status at a glance | Color-coded status dot per node; whole-team status visible on canvas |
| Activity log | Every action across all nodes; searchable, filterable, **exportable**, 90-day retention |
| Immutable audit trail | Append-only step log; SHA-256 hashes; no UPDATE/DELETE |
| Magic link auth | Password-free email auth |
| Push notifications | Escalations reach Maria immediately |
| Tool integrations | Gmail, Calendar, HubSpot, Slack OAuth |

**Success condition:** Maria opens the app, sees an empty canvas, and creates a working team in under 5 minutes. She drags a Lead Research archetype onto the canvas, wires it to a Follow-Up archetype — the Team Lead coordinates both. On Day 2, she wakes up to "Team Lead coordinated 14 leads while you slept." She can trace every node's reasoning and every escalation.

**What we are NOT shipping:** Template gallery (beyond 3 agent archetypes), long-term memory, PROACTIVE, Calendar, HubSpot, governance board, auto-pause, skills directory, permission auto-approval, memory integrity verification.

---

### Phase 2 — Differentiate (Days 90–180): Make It Unstoppable

**Goal:** AgentOS has durable competitive moats that Anthropic cannot replicate because they are a model company.

**Features:**

| Feature | Description | Competitive Moat |
|---------|-------------|------------------|
| **Multi-canvas portfolio** | paperclip.ai-style flat spatial view of all canvases. Each canvas = one team = one domain of work. Navigate between canvases. | The organizational layer above the canvas. Competitors have single-canvas products. |
| **Permission auto-approval** | AI classifier. Routine actions auto-execute. Only unusual ones escalate. **Outputs reasoning** for every decision. | Anthropic's classifier trains on code. Ours trains on business workflow patterns. Domain-specific. |
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
| **Plan: Canvas UI** | React component specs for infinite canvas, node rendering, wiring, sidebar, and reasoning trace panel. | PRD v5, Design System |
| **Plan: Gmail Integration** | OAuth flow, token storage, read/compose/send tools, rate limiting. Approved contact list enforcement. | PRD v5, Harness Architecture Reference |
| **Plan: Audit Trail API** | Immutable step log schema, SHA-256 hashing, append-only enforcement, export endpoints. | PRD v5, Harness Architecture Reference |
| **Plan: Connector Implementation** | Google Drive, Slack, HubSpot connectors via MCP client. OAuth flows, capability wiring, connector card UI. See `docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md`. | PRD v5, ARCHITECTURE-01, ARCHITECTURE-02 |
| **ARCHITECTURE-06: Escalation Suggestions** | Agent self-proposal pattern. Post-run reflection, on-demand queries, suggestion types (schedule recurring, follow-on task, connector gap, approval bump). See `docs/ARCHITECTURE-06-escalation-suggestions.md`. | PRD v5, ARCHITECTURE-01 |

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
| **Plan: Escalation Suggestions (Mode B)** | On-demand NL query: "any suggestions for my team?" Full suggestion types (schedule recurring, follow-on task, connector gap, approval bump, budget increase). Requires Canvas UI. | PRD v5, Phase 1, ARCHITECTURE-06 |
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
