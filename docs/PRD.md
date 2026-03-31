# AgentOS v3 — Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-31
**Status:** Living Document
**Classification:** Product — Source of Truth

---

## Table of Contents

1. [Vision & Principles](#1-vision--principles)
2. [Target User](#2-target-user)
3. [Core Product Concept](#3-core-product-concept)
4. [Product Architecture](#4-product-architecture)
5. [Feature Specifications](#5-feature-specifications)
6. [UX Specifications](#6-ux-specifications)
7. [Technical Architecture](#7-technical-architecture)
8. [Edge Cases & Error States](#8-edge-cases--error-states)
9. [Phased Scope](#9-phased-scope)
10. [Success Metrics](#10-success-metrics)
11. [Glossary](#11-glossary)

---

## 1. Vision & Principles

### 1.1 The One-Line Pitch

**"Hire an AI employee. It works while you sleep."**

### 1.2 The AHA Moment

The AHA moment is the first time a user realizes their agent has been working for them without being asked. It happens when:

1. User hires an agent ("handle my inbound emails")
2. User wakes up the next morning
3. User sees: "12 emails processed. 2 escalated. See results →"

The AHA moment is not about the canvas or the NL interface. It is about waking up to accomplished work.

### 1.3 Design Principles

| Principle | What It Means |
|-----------|--------------|
| **Agents are workers** | Not pipelines. Not workflows. Employees who have a job to do. |
| **The canvas is a team dashboard** | Not a flowchart. Not a configuration screen. A living org chart. |
| **Less input, more output** | The user describes outcomes. The agent figures out the steps. |
| **Visible without reading** | Non-technical users understand what's happening without documentation. |
| **Escalation is a feature** | The agent asking for help is not failure. It's trust-building. |
| **Trust is earned** | Start with low-stakes. Let the agent prove itself. |

### 1.4 Anti-Principles (What We Won't Do)

- Won't require users to understand agent architecture
- Won't expose cron expressions, JSON configs, or code
- Won't design for "run once" workflows
- Won't compete on runtime quality (commodity)
- Won't build CLI or developer-focused interfaces

---

## 2. Target User

### 2.1 Primary Persona

**Name:** Maria
**Age:** 44
**Role:** Owns a 12-person HVAC company
**Tech comfort:** Uses QuickBooks, Gmail, LinkedIn. Has never built an automation. Used Zapier once, got confused, gave up.
**Pain points:** 6 hours/week spent on email triage. Misses leads because she can't respond fast enough. Pays a virtual assistant $2,000/month for work that could be automated.
**What she wants:** "I want someone to handle the emails I don't have time for. I want to approve the important ones and let the rest go."

### 2.2 Secondary Persona

**Name:** James
**Age:** 31
**Role:** Marketing manager at a 50-person e-commerce brand
**Tech comfort:** Uses HubSpot, Slack, Notion. Has tried Make.com and Zapier. Has shipped one AgentGPT workflow that didn't stick.
**Pain points:** Competitive analysis takes 4 hours every Monday. Social media monitoring is manual. Can't afford a full-time marketing hire for everything he needs.
**What he wants:** "I want a marketing team that never sleeps. Research on competitors every week. Content drafts daily. I review and approve."

### 2.3 User Quote

> "I don't want to learn what an agent is. I want to hire one, tell it what I want, and have it work. If it needs me, it should ask. Otherwise, I trust it to do its job."

---

## 3. Core Product Concept

### 3.1 What You Hire

A **hireable agent** is a persistent AI worker with:

- A **role** (what it does)
- A **heartbeat schedule** (when it wakes up)
- A **toolset** (what it can do)
- A **resource budget** (how much it can spend)
- An **escalation policy** (when it asks for help)
- A **memory** (what it remembers about past work)

### 3.2 What You Say vs. What the System Infers

| User Says | System Infers |
|-----------|--------------|
| "Handle my inbound emails" | Agent role, Gmail read/write tools, daily heartbeat, escalation policy |
| "Run every morning at 9am" | Heartbeat schedule: daily 9am UTC |
| "Let me know if anything goes to executives" | Escalation rule: emails to exec domain → approval required |
| "Keep it conservative" | Low resource budget; fewer actions per run |
| "I want to see everything before it sends" | Layer 4: per-action approval |

### 3.3 The Hire-to-Work Flow

```
1. Open app → Canvas shows "Your team" (empty or with existing agents)
2. Click "Hire an agent"
3. Type: "I want an agent that handles my inbound customer emails"
4. NL layer parses → shows agent preview: role, tools, schedule, budget
5. User adjusts if needed (or accepts defaults)
6. Click "Activate" (not "Run" — this is a hire, not a task)
7. Agent card appears on canvas: idle, next wake: tomorrow 9am
8. Next morning → Agent wakes, checks email, acts or escalates
9. User gets ping: "3 emails escalated. Review →"
```

### 3.4 The Escalation Flow

```
1. Agent encounters situation requiring judgment
2. Agent pauses at checkpoint
3. User gets pinged (in-app notification + optional email)
4. User opens escalation modal
5. Modal shows: what happened, what the agent wants to do, reasoning trace
6. User: Approve / Edit and Approve / Skip / Cancel
7. Agent resumes with decision
8. Agent updates memory with context from the decision
```

---

## 4. Product Architecture

### 4.1 Two-Mode Interface

**Mode A — Team Dashboard (default)**
Full canvas view. User sees their agent team, status, recent activity. Chat is a floating input at the bottom for hiring new agents or asking questions.

**Mode B — Activity**
Activity log focused. Timeline view of all agent actions across all agents. Filterable by agent, date, action type, status.

### 4.2 Canvas Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  AgentOS          Your Team (3 agents)           [Activity] [⚙]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│     ┌──────────┐                                                   │
│     │ Maria    │  ← User (top of org chart)                      │
│     │ (you)    │                                                   │
│     └────┬─────┘                                                   │
│          │                                                         │
│    ┌─────┴──────┬────────────┐                                    │
│    ▼            ▼            ▼                                    │
│ ┌──────┐  ┌────────┐  ┌───────────┐                              │
│ │Email  │  │Research│  │Support    │  ← Agent cards              │
│ │Agent  │  │Agent   │  │Agent      │     (org chart layout)       │
│ │✓ idle │  │◐ running│ │⚠ waiting │                              │
│ │wake:9a│  │doing: X │  │1 pending  │                              │
│ └──────┘  └────────┘  └───────────┘                              │
│                                                                     │
│  ──────────────────────────────────────────────────────────────    │
│  [Type to hire: "I want an agent that..."]                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Agent Card Anatomy

```
┌─────────────────────────────┐
│ 🟢 Email Handler     [⋯]    │  ← Role + status dot
│ Runs: Daily 9am            │  ← Heartbeat schedule
│ Last: Today 9:01am — ✓      │  ← Last wake result
│ Next: Tomorrow 9:00am       │  ← Countdown
│ ─────────────────────────── │
│ [████████░░] 80% budget     │  ← Resource budget bar
│ 12 actions today             │
└─────────────────────────────┘
```

### 4.4 Escalation Modal

```
┌─────────────────────────────────────────────────────┐
│ ✋ Email Agent needs your input              [×]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  The agent wants to send this email:               │
│                                                     │
│  To:    john@acme.com                              │
│  Subject: Re: Your proposal                        │
│                                                     │
│  Body:                                               │
│  "Hi John, Thanks for reaching out. I'd be         │
│   happy to discuss a partnership. Can we            │
│   schedule a call next week?..."                   │
│                                                     │
│  ─────────────────────────────────────────         │
│  Reasoning: The sender is a warm lead (opened       │
│  3 previous emails). The subject matches "partner" │
│  keyword. No red flags. Recommend sending.          │
│  ─────────────────────────────────────────         │
│                                                     │
│  [Approve]  [Edit & Send]  [Skip]  [Cancel]      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 5. Feature Specifications

### 5.1 Agent Hiring (NL → Agent)

**How it works:**
1. User types goal in the canvas input
2. NL layer parses → generates agent config: role, tools, heartbeat, escalation policy, resource budget
3. Preview shown as agent card
4. User can adjust any inferred setting
5. User clicks "Activate"

**NL interpretation rules:**
- "handle my emails" → Gmail read + compose tools
- "daily at 9am" → heartbeat: daily 9am UTC
- "CC me on anything to executives" → escalation rule: emails to *@*exec* → approval
- "be conservative" → low resource budget, prefer escalation
- "surprise me" → medium budget, standard escalation

**Constraints:**
- Max 5 agents per user (Phase 1)
- Each agent has max 5 tools
- Tool access requires OAuth connection

### 5.2 Heartbeat Scheduler

**How it works:**
1. Each agent has a heartbeat schedule: every N minutes/hours/days, or at specific times
2. BullMQ enqueues a wake-up job at each heartbeat
3. On wake: agent checks for new work (inbox, webhook, scheduled time)
4. If work exists: agent executes a bounded task
5. If work is complete or requires escalation: agent sleeps until next heartbeat
6. State is checkpointed after each step

**Schedule options:**
- Every 15/30/60 minutes
- Every N hours (2, 4, 6, 8, 12)
- Daily at specific time
- Weekly on specific days
- On-demand (webhook trigger)

**Concurrency:**
- An agent can only run one task at a time
- If a heartbeat fires while agent is running: skip this cycle, wait for next heartbeat
- Atomic execution prevents double-work

### 5.3 Escalation System

**Two tiers:**

**Tier 1 — Action Approval (modal)**
For specific dangerous actions. Shown inline.
- Email send to new recipients
- Payment operations
- Admin panel access
- Custom user-defined triggers

**Tier 2 — Agent Governance (board page)**
For structural changes to the agent team.
- Hiring a new agent
- Changing an agent's tool access
- Adjusting resource budgets significantly
- Deleting an agent

**Escalation rules (configurable per agent):**
- "Always ask before sending" — per-action approval for all emails
- "Ask for emails to executives" — rule-based: to addresses matching pattern
- "Ask if subject contains [keyword]" — keyword-triggered
- "Never ask, handle everything" — fully autonomous

**Memory integration:**
When user approves/escalates, the agent logs the decision in long-term memory. Over time, the agent learns the user's preferences and requires fewer escalations.

### 5.4 Resource Budgets

**What it controls:**
- Compute budget (token spend per heartbeat cycle)
- Action count (max tool calls per task)
- Email volume (max emails sent per day)

**Visual representation:**
Bar indicator on agent card (green → yellow → red)
Notification when budget is 80% consumed
Auto-pause when budget is exceeded

**Presets:**
- Conservative: 50 actions/cycle, $0.10/cycle, 5 emails/day
- Standard: 200 actions/cycle, $0.50/cycle, 25 emails/day
- High: 1000 actions/cycle, $2.00/cycle, unlimited emails
- Unlimited: no limits (requires confirmation)

### 5.5 Activity Log

**Structure:**
Each agent action generates a **ticket**:
- Ticket ID, agent ID, timestamp
- Action type (email_sent, email_read, web_search, etc.)
- Status (completed, escalated, failed, skipped)
- Input/output summary
- Escalation decision (if applicable)
- Compute cost

**Views:**
- **Timeline:** Vertical feed, newest first. Grouped by day.
- **Filterable:** By agent, action type, date range, status
- **Searchable:** Full-text search across all ticket content
- **Detail:** Click any ticket → full reasoning trace + tool call logs

**Retention:**
- Standard: 90 days
- Flagged (escalations): 1 year
- Export: CSV/JSON

### 5.6 Tool Integrations

**Phase 1:**
- Gmail (read, compose, send)
- Web search (read-only)

**Phase 2:**
- Google Calendar (read, create events)
- HubSpot (read contacts, create tasks)
- Slack (send messages)

**Phase 3:**
- Salesforce, QuickBooks, Notion, and via MCP

### 5.7 Template Gallery

**Pre-built agents available at launch:**

| Template | Role | Schedule | Tools | Escalation |
|---------|------|----------|-------|-----------|
| Customer Email Handler | Reads inbound, drafts replies | Daily 9am | Gmail | Approval for external send |
| Lead Researcher | Enriches lead list weekly | Weekly Monday | Web search, Gmail | Summary only |
| Support Drafter | Drafts support responses | On ticket | Gmail | Approval before send |
| Competitive Monitor | Weekly research sweep | Weekly Friday | Web search | Weekly digest email |

**Template customization:**
User picks a template → NL layer customizes it to their specific domain ("notion" → "Notion" tools, "acme.com emails" → filtered Gmail search)

---

## 6. UX Specifications

### 6.1 Visual Design System

**Color Palette:**
| Token | Value | Usage |
|-------|-------|-------|
| Background | `#09090b` | Page background (zinc-950) |
| Surface | `#18181b` | Cards, panels (zinc-900) |
| Border | `#27272a` | Dividers, panel edges (zinc-800) |
| Border hover | `#3f3f46` | Interactive borders (zinc-700) |
| Text primary | `#fafafa` | Main text (zinc-50) |
| Text muted | `#71717a` | Secondary labels (zinc-500) |
| Text dim | `#52525b` | Placeholders (zinc-600) |
| Accent | `#8b5cf6` | Logo, highlights, CTAs (violet-500) |
| Success | `#22c55e` | Running status, approval (green-500) |
| Warning | `#f59e0b` | Escalation pending, budget warning (amber-500) |
| Error | `#ef4444` | Failed, error states (red-500) |
| Info | `#3b82f6` | Informational (blue-500) |

**Agent Role Colors:**
| Role | Color |
|------|-------|
| Email Handler | `#3b82f6` (blue) |
| Researcher | `#8b5cf6` (violet) |
| Writer/Drafter | `#f59e0b` (amber) |
| Sender | `#ec4899` (pink) |
| Monitor | `#14b8a6` (teal) |
| Custom | `#6b7280` (gray) |

**Typography:**
- Font: Inter (Google Fonts)
- Logo: 16px, semibold, violet
- Headings: 18-24px, semibold
- Body: 14px, regular
- Labels: 12px, medium
- Micro: 11px, regular, muted

**Spacing:**
- Base unit: 4px
- Component padding: 12-16px
- Card gap: 16px
- Section gap: 24-32px
- Canvas padding: 32px

**Border radius:**
- Cards: 12px
- Buttons: 8px
- Inputs: 8px
- Modals: 16px
- Pills/badges: 9999px (full round)

### 6.2 Agent Card Component

**States:**
| State | Visual |
|-------|--------|
| Idle | Gray dot, "Next wake: [time]" |
| Running | Green pulsing dot, "Working..." |
| Waiting | Amber pulsing dot, "Waiting for approval" |
| Paused | Gray static dot, "Paused by you" |
| Failed | Red dot, "Failed — Retry" |
| Budget warning | Amber bar, "80% budget used" |

**Hover behavior:**
Slight elevation (+2px shadow), border brightens to `#3f3f46`

**Click behavior:**
Opens agent detail panel (slide-in from right, 400px wide)

### 6.3 Escalation Modal Component

**Layout:**
Full-screen overlay with centered modal (max 640px wide)

**Sections:**
1. Header: Agent avatar + name + "needs your input"
2. What the agent wants to do: action summary
3. Reasoning: 2-3 sentence explanation from the agent
4. Details: specific fields (recipient, subject, body for email)
5. Action buttons: 4 buttons in row

**Button hierarchy:**
- Primary: "Approve" — solid violet background
- Secondary: "Edit & Send" — outlined
- Tertiary: "Skip" — ghost/text only
- Destructive: "Cancel" — ghost/text only, red on hover

### 6.4 Activity Log Component

**Timeline item:**
```
┌─────────────────────────────────────────────────────┐
│ [Agent Avatar] Email Handler          [completed]  │
│ john@acme.com — "Re: Your proposal"   9:01am today │
│ 3 tool calls · $0.002 · 4s                          │
└─────────────────────────────────────────────────────┘
```

**Expanded (on click):**
Shows full reasoning trace, all tool call inputs/outputs, escalation decision if applicable.

### 6.5 Onboarding Flow

**First-time user (no agents yet):**
```
1. Landing → "Get started" → Magic link sent
2. Email link → App opens
3. Empty canvas: "Your team is empty. Hire your first agent."
4. [Prompt: "What should this agent do?"]
5. User types: "handle my inbound customer emails"
6. NL preview → Agent card appears
7. User clicks "Activate"
8. OAuth: "Connect Gmail to power this agent" → browser popup
9. Gmail connected → "Email Agent is ready. First wake: tomorrow 9am."
10. Canvas shows agent card (idle, next wake: tomorrow 9am)
```

**Second-time user (returning):**
```
1. App opens → Canvas shows team with agent status
2. User sees: "Last wake: Today 9:01am — 12 emails processed ✓"
3. If any escalations pending: notification badge on Activity tab
```

---

## 7. Technical Architecture

### 7.1 System Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Canvas     │────▶│  NL Layer    │────▶│  Agent       │
│   (React)    │     │  (GPT-4o)    │     │  Config      │
└──────┬───────┘     └──────────────┘     └──────┬───────┘
       │                                          │
       │ SSE/WebSocket                             ▼
       │                                   ┌──────────────┐
       │                                   │  BullMQ     │
       │                                   │  (Scheduler) │
       │                                   └──────┬───────┘
       │                                          │
       ▼                                          ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Event       │◀────│  Durable     │◀────│  Postgres    │
│  Buffer/SSE  │     │  Runner      │     │  (State)     │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Tool Layer  │
                    │  Gmail/Search│
                    └──────────────┘
```

### 7.2 Durable Execution

**State machine states:**
`idle | running | waiting_for_approval | paused | completed | failed`

**Checkpoint log:**
Every state transition + every tool call is logged to Postgres with:
- `checkpoint_id` (ULID)
- `agent_id`
- `run_id`
- `state_before`
- `state_after`
- `tool_call_id` (if applicable)
- `timestamp`

**Resume logic:**
On restart, agent reads last checkpoint → replays from there.

**Idempotency:**
Every mutating tool call generates a ULID-based idempotency key before execution. On retry, if the key exists, return cached result instead of re-executing.

### 7.3 Heartbeat Scheduler

**BullMQ job structure:**
```typescript
{
  name: `heartbeat:${agentId}`,
  data: { agentId, runId, heartbeatId },
  opts: {
    repeat: {
      pattern: agent.heartbeatSchedule  // cron expression
    },
    removeOnComplete: false,
    removeOnFail: false
  }
}
```

**Wake-up flow:**
1. BullMQ fires heartbeat job
2. Runner picks up job → creates new `run_id`
3. Runner checks for new work (inbox query, webhook, etc.)
4. If work: execute bounded task → checkpoint → sleep
5. If no work: log "no work found" → sleep until next heartbeat

### 7.4 Event System (Hooks → SSE → Canvas)

**Hook types:**
- `preAgentRun` — agent starting
- `postAgentRun` — agent completed
- `preToolCall` — tool call starting
- `postToolCall` — tool call completed
- `preApproval` — escalation requested
- `postApproval` — escalation resolved
- `runComplete` — all agents done
- `runError` — run failed

**Flow:**
1. Runner emits hook event
2. HookRegistry distributes to all registered handlers
3. Canvas handler updates local React state
4. SSE emitter pushes event to connected clients
5. Canvas re-renders affected agent cards

### 7.5 NL Interpretation

**Input:** Plain English goal description
**Output:** AgentConfig object

```typescript
interface AgentConfig {
  role: string
  description: string
  tools: Tool[]
  heartbeatSchedule: HeartbeatSchedule
  escalationRules: EscalationRule[]
  resourceBudget: ResourceBudget
  memoryEnabled: boolean
}
```

**NL → Config rules:**
- Intent classification: hire_agent | adjust_agent | pause_agent | delete_agent | ask_question
- Tool selection: based on keywords (email → Gmail, research → web search, calendar → Google Calendar)
- Schedule extraction: parse "daily at 9am", "every hour", "weekdays at 7am"
- Escalation rules: keyword matching + explicit statements

---

## 8. Edge Cases & Error States

### 8.1 Agent Failure Modes

| Failure | System Response | User Notification |
|---------|----------------|-------------------|
| Tool call fails (transient) | Retry with backoff (3 attempts) | None (handled automatically) |
| Tool call fails (permanent) | Mark run as failed, checkpoint | "Email Agent failed at step 2. [Retry]" |
| Rate limit hit | Pause 60s, retry | None (handled automatically) |
| Budget exceeded | Pause agent, stop scheduling | "Email Agent paused: monthly budget exceeded" |
| LLM timeout | Retry once, then fail | "Email Agent failed: AI was unavailable. [Retry]" |
| No new work at heartbeat | Log "no work", sleep | None |
| Escalation timeout (30 min) | Auto-skip with warning | "Escalation auto-skipped after 30 min" |

### 8.2 NL Parsing Failures

| Situation | System Response | User Experience |
|-----------|----------------|-----------------|
| Ambiguous goal | Ask clarifying question with 2-3 options | "Did you mean: [A] Handle emails, [B] Send a newsletter, [C] Something else?" |
| Goal too vague | Prompt for specifics | "What kind of emails? Inbound customer emails or outbound campaigns?" |
| Tool not available | Offer alternatives | "I can't access Notion yet. Want to use Gmail + Web Search instead?" |
| Goal exceeds agent limit | Show limit reached | "You've hired 5 agents (maximum). Pause one to hire a new one." |

### 8.3 OAuth Connection Issues

| Situation | System Response |
|-----------|----------------|
| Gmail disconnected | Agent pauses, banner: "Email Agent needs attention: Gmail disconnected. [Reconnect]" |
| Token expired | Auto-refresh if possible, otherwise prompt re-auth |
| User revokes access | Pause agent, notify: "[Tool] access was removed. [Reconnect] to resume." |

### 8.4 Canvas Edge Cases

| Situation | Behavior |
|-----------|----------|
| Agent card overflow (10+ agents) | Horizontal scroll, pagination at 12 |
| Heartbeat fires while editing | Queue the wake, execute after user stops interacting |
| User deletes agent mid-run | Complete current task, then stop. Don't interrupt in-flight work. |
| Concurrent edits to same agent | Last-write-wins. No collaborative editing on agents. |

---

## 9. Phased Scope

### Phase 1 — MVP (0–90 days)

**Must have:**
- Durable execution (BullMQ + Postgres)
- Heartbeat scheduler (daily/hourly schedules)
- 1 agent type (Email Agent template)
- Gmail read/write tools
- Action approval escalation (modal)
- Agent card with status, last ran, next wake
- Activity log (timeline view)
- Magic link auth
- Canvas team dashboard layout

**Nice to have:**
- Web search tool
- Escalation governance board (Tier 2)
- Resource budget bars
- 2nd/3rd agent templates

**Out of scope:**
- Working memory
- Long-term memory
- Template gallery UI
- Calendar/CRM integrations
- Agent marketplace

### Phase 2 — Memory + Gallery (90–180 days)

- Working memory (per-session)
- Long-term memory (mem0.ai + Qdrant)
- Template gallery (6–10 templates)
- Multi-agent delegation
- Approval UX hardening
- Calendar OAuth

### Phase 3 — Scale (180+ days)

- CRM integrations (HubSpot, Salesforce)
- Slack integration
- Agent marketplace
- Team collaboration (multi-user)
- Mobile experience

---

## 10. Success Metrics

### 10.1 Product Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first agent | < 5 min from signup | Session timestamp: signup → first agent activated |
| Activation rate | > 60% of signups hire an agent | Count: signups with ≥1 activated agent / total signups |
| AHA moment rate | > 40% experience it by day 3 | Survey: "Did your agent complete work before you checked it?" |
| Escalation resolution time | < 5 min from ping to decision | Timestamps: escalation created → decision recorded |
| Escalation rate | < 20% of runs require escalation | Count: escalations / total runs |
| Agent autonomy rate | > 80% runs complete without escalation | Count: runs with 0 escalations / total runs |
| Agent completion rate | > 90% of scheduled runs complete | Count: completed runs / scheduled runs |

### 10.2 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Waitlist conversion | > 30% convert to active user | Waitlist → first agent activated |
| Agent retention | > 70% active after 30 days | Weekly active agents / total agents created |
| NPS | > 40 | "How likely to recommend?" (0-10) |
| Support ticket rate | < 5% of users file a ticket/week | Support tickets / MAU |

### 10.3 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent survival rate | > 95% of scheduled wakes execute | Count: successful wakes / scheduled wakes |
| Resume success rate | > 99% of interruptions resume correctly | Count: resumed runs / interrupted runs |
| Checkpoint completeness | 100% of state transitions logged | Audit: checkpoint log vs. expected transitions |
| Idempotency correctness | 0 duplicate executions | Count: duplicate tool calls with same idempotency key |

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **ADE** | Agent Distribution Environment — infrastructure making agents accessible to non-technical users |
| **Activate** | To deploy an agent on a schedule (not run once — persistent) |
| **Agent** | A persistent AI worker with a role, heartbeat schedule, tools, and escalation policy |
| **AHA moment** | The moment a user realizes their agent has been working for them without being asked |
| **Checkpoint** | A logged state transition that enables resume after process death |
| **Durable execution** | Execution that survives server restarts — state persisted to Postgres, not memory |
| **Escalation** | When an agent pauses execution and requests human input before proceeding |
| **Heartbeat** | A scheduled wake-up event where an agent checks for work and acts |
| **Hire** | To create and activate a persistent agent (not run a task) |
| **Layer** | Abstraction level the user operates at (1=pure intent, 4=per-action control) |
| **NL** | Natural Language — plain English interface for configuring agents |
| **Ticket** | A unit of work in the activity log — one agent action with full audit trail |

---

## Appendix A: Color Tokens Reference

```
--color-bg:          #09090b   (zinc-950)
--color-surface:      #18181b   (zinc-900)
--color-border:       #27272a   (zinc-800)
--color-border-hover: #3f3f46  (zinc-700)
--color-text:         #fafafa   (zinc-50)
--color-text-muted:   #71717a   (zinc-500)
--color-text-dim:     #52525b   (zinc-600)
--color-accent:       #8b5cf6  (violet-500)
--color-success:      #22c55e  (green-500)
--color-warning:      #f59e0b  (amber-500)
--color-error:        #ef4444  (red-500)
--color-info:         #3b82f6  (blue-500)
--color-agent-email:  #3b82f6  (blue-500)
--color-agent-research:#8b5cf6 (violet-500)
--color-agent-writer: #f59e0b  (amber-500)
--color-agent-sender: #ec4899  (pink-500)
--color-agent-monitor:#14b8a6  (teal-500)
```

## Appendix B: Agent State Reference

```
┌────────────┬────────────────────────────────────────────┬──────────────────┐
│ State      │ Meaning                                    │ Visible To User  │
├────────────┼────────────────────────────────────────────┼──────────────────┤
│ idle       │ Scheduled, waiting for next heartbeat      │ Yes — card shows │
│            │                                            │ "Next wake: 9am" │
├────────────┼────────────────────────────────────────────┼──────────────────┤
│ running    │ Executing a bounded task                    │ Yes — pulsing    │
│            │                                            │ green dot        │
├────────────┼────────────────────────────────────────────┼──────────────────┤
│ waiting_   │ Paused at escalation checkpoint, human     │ Yes — pulsing    │
│ approval   │ decision required                           │ amber dot + ping │
├────────────┼────────────────────────────────────────────┼──────────────────┤
│ paused     │ User-paused or budget-exceeded              │ Yes — gray dot, │
│            │                                            │ "Paused" label   │
├────────────┼────────────────────────────────────────────┼──────────────────┤
│ completed  │ Task done successfully                     │ Yes — green dot, │
│            │                                            │ log entry        │
├────────────┼────────────────────────────────────────────┼──────────────────┤
│ failed     │ Task failed after retries                   │ Yes — red dot,   │
│            │                                            │ error message    │
└────────────┴────────────────────────────────────────────┴──────────────────┘
```

---

*Last updated: 2026-03-31*
*Owner: Product*
*Status: Living document — update with each major release*
