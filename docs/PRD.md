# AgentOS v3 — Product Requirements Document

**Version:** 1.2
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
12. [Appendix: Claude Code Competitive Analysis](#12-appendix-claude-code-competitive-analysis)

---

## 1. Vision & Principles

### 1.1 The One-Line Pitch

**"Hire an AI employee. It works while you sleep."**

### 1.2 The AHA Moment

The AHA moment is not a single dramatic reveal — it is the accumulation of moments where a user realizes their agent kept working correctly without being checked. It is the moment you were about to handle an email yourself when you noticed your agent already handled it. Trust is built incrementally through demonstrated competence.

The first high-impact AHA moment typically happens within the first 3 days when:
1. User hires an agent ("handle my inbound emails")
2. User wakes up or returns to find: "12 emails processed. 2 escalated. See results →"
3. User realizes they didn't need to check — the agent just worked

### 1.3 Design Principles

| Principle | What It Means |
|-----------|--------------|
| **Agents are workers** | Not pipelines. Not workflows. Employees who have a job to do. |
| **The canvas is a team dashboard** | Not a flowchart. Not a configuration screen. A living org chart. |
| **Less input, more output** | The user describes outcomes. The agent figures out the steps. |
| **Visible without reading** | Non-technical users understand what's happening without documentation. |
| **Escalation is a feature** | The agent asking for help is not failure. It's trust-building. Maria wants to approve the important ones, not every action. |
| **Trust is earned** | Start with low-stakes. Let the agent prove itself. |
| **Personality belongs in professional tools** | Even a business dashboard should feel alive. The Buddy system taught us that personality drives engagement. |
| **Agents act on their own judgment** | Between users, the agent should act on best judgment rather than waiting for confirmation (PROACTIVE principle). |

### 1.4 Anti-Principles (What We Won't Do)

- Won't require users to understand agent architecture
- Won't expose cron expressions, JSON configs, or code
- Won't design for "run once" workflows
- Won't compete on runtime quality (commodity)
- Won't build CLI or developer-focused interfaces
- Won't ship half-tested capabilities without feature flag protection

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
- A **memory** — working memory (per-session, Phase 1) and long-term memory (cross-session, Phase 2)

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
8. Agent updates working memory with context from the decision
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
│   schedule a call next week?..."                    │
│                                                     │
│  ─────────────────────────────────────────         │
│  Reasoning: The sender is a warm lead (opened      │
│  3 previous emails). The subject matches "partner"  │
│  keyword. No red flags. Recommend sending.          │
│  ─────────────────────────────────────────         │
│                                                     │
│  [Approve]  [Edit & Send]  [Skip]  [Cancel]        │
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

**KAIROS-inspired daemon mode:**
- Agents support a "always-on" mode where they monitor continuously between heartbeats
- Lightweight background process checks for urgent work (webhooks, critical escalations)
- Dream state: between heartbeat cycles, agents consolidate learning and update memory

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

**Working memory integration (Phase 1):**
When user approves/escalates, the agent logs the decision in working memory. Over time within a session, the agent learns patterns and reduces repeat escalations.

**Long-term memory integration (Phase 2):**
Across sessions, the agent learns user preferences via mem0.ai. After enough approvals, the agent requires fewer escalations for similar situations.

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

**Phase 1.5:**
- Permission auto-approval (TRANSCRIPT_CLASSIFIER-inspired AI classifier)
- Feature flag system for gradual capability rollout

**Phase 2:**
- Google Calendar (read, create events)
- HubSpot (read contacts, create tasks)
- Slack (send messages)

**Phase 3:**
- Salesforce, QuickBooks, Notion, and via MCP

### 5.7 Template Gallery

**Phase 1 — Template picker (2-3 templates):**
Pre-built agents available at launch as a simple list — not a full searchable gallery.

| Template | Role | Schedule | Tools | Escalation |
|---------|------|----------|-------|-----------|
| Customer Email Handler | Reads inbound, drafts replies | Daily 9am | Gmail | Approval for external send |
| Lead Researcher | Enriches lead list weekly | Weekly Monday | Web search, Gmail | Summary only |
| Support Drafter | Drafts support responses | On ticket | Gmail | Approval before send |

**Phase 2 — Full gallery (6–10 templates):**
| Template | Role | Schedule | Tools | Escalation |
|---------|------|----------|-------|-----------|
| Competitive Monitor | Weekly research sweep | Weekly Friday | Web search | Weekly digest email |
| Content Curator | Finds relevant industry news | Daily 8am | Web search | Daily briefing |
| Meeting Prep | Researches agenda items before calls | 1hr before meeting | Web search, Calendar | Summary only |

**Template customization:**
User picks a template → NL layer customizes it to their specific domain ("notion" → "Notion" tools, "acme.com emails" → filtered Gmail search)

### 5.8 Skills System (Phase 1.5)

**What it is:**
A directory-based prompt library where each skill is a self-contained prompt with YAML frontmatter. Skills are conditional — they activate based on detected patterns in the conversation.

**How it works:**
- Skills live in `skills/<name>/SKILL.md` with YAML frontmatter
- Conditional activation: `when: { trigger: "email", context: "gmail" }`
- Skills can request tools, modify behavior, add context
- User-facing version: template picker maps to skills internally

**Key patterns from Claude Code:**
```
# skills/email-handler/SKILL.md
---
name: email-handler
trigger: "email"
context: "inbound|customer|support"
actions:
  - identify_leads
  - draft_response
  - escalate_important
---
You are an email handling agent...
```

**AgentOS implementation:**
- Phase 1.5: Skills as templates (pre-built agent configs)
- Phase 2: User-creatable skills with conditional activation
- Skills system replaces hardcoded NL interpretation rules

### 5.9 Feature Flags (Phase 1.5)

**What it is:**
Build-time feature flag system that enables gradual rollout and kill-switches without redeployment.

**How it works:**
- `feature('FLAG_NAME')` returns boolean — tree-shaken at build time if false
- Flags can be per-user, per-tier, or global
- Runtime kill-switch: disable a feature without rebuilding

**Use cases:**
- Ship a feature to 10% of users first
- Kill-switch a misbehaving agent template
- A/B test escalation policies
- Disable a tool integration without code change

### 5.10 Permission Auto-Approval (Phase 1.5)

**What it is:**
AI-based permission classifier (TRANSCRIPT_CLASSIFIER-inspired) that auto-approves routine tool calls and only escalates when confidence is low.

**How it works:**
1. Tool call requested
2. Classifier evaluates: is this routine for this user's established patterns?
3. If confidence > threshold: execute automatically (no modal)
4. If confidence < threshold: show escalation modal
5. User decision trains the classifier over time

**Key insight from Claude Code:**
- TRANSCRIPT_CLASSIFIER has 107 references — massive investment in friction reduction
- The classifier removes the "always ask" friction for trusted patterns
- Without this, every new tool call requires user confirmation → agents become unusable

### 5.11 Coordinator Mode (Phase 2)

**What it is:**
Manager/worker architecture where one orchestrating agent coordinates parallel sub-agents.

**How it works:**
```
Coordinator Agent
  ├── Research Worker (parallel)
  ├── Writer Worker (parallel)
  └── Reviewer Worker (after workers complete)
```

**AgentOS use cases:**
- Research + compose workflow: research agent fetches data, writer agent drafts
- Multi-tool tasks: one agent coordinates Gmail + Calendar + Web search
- Escalation governance: coordinator routes to appropriate human approver

### 5.12 PROACTIVE Agent Mode (Phase 2)

**What it is:**
Between users, the agent acts on best judgment rather than waiting for confirmation.

**How it differs from current design:**
Current: agent waits for user
PROACTIVE: agent acts, notifies user after

**Example:**
- Agent detects urgent lead email at 10pm
- User is asleep
- PROACTIVE mode: agent drafts response, sends if low-risk, escalates if high-risk
- User wakes up to "Agent handled 3 emails while you slept. 1 escalated."

### 5.13 Remote Bridge Architecture (Phase 3)

**What it is:**
Infrastructure for persistent remote agent sessions — agents that run on remote infrastructure and communicate via secure bridge.

**How it works:**
- RemoteTriggerTool: CRUD for scheduled triggers, cron, MCP connectors
- JWT heartbeat authentication
- Git worktree isolation per remote session
- Work polling with exponential backoff

**AgentOS use cases:**
- Enterprise: agents run in isolated cloud environments
- Team collaboration: shared agent workers
- Mobile: lightweight mobile client that connects to remote agent runtime

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
│ [Agent Avatar] Email Handler          [completed]    │
│ john@acme.com — "Re: Your proposal"   9:01am today  │
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
4. [Template picker: 2-3 agent cards shown]
   Or: [Prompt: "What should this agent do?"]
5. User picks template or types goal
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
│   Canvas     │────▶│  NL Layer   │────▶│  Agent      │
│   (React)    │     │  (GPT-4o)  │     │  Config     │
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

**Typed exit reasons (from Claude Code pattern):**
Every run returns a typed reason:
- `completed` — task finished successfully
- `escalated` — paused for human decision
- `budget_exceeded` — resource limit reached
- `max_steps_exceeded` — step limit hit
- `error` — unexpected failure
- `cancelled` — user cancelled

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

**KAIROS daemon mode (Phase 2):**
- Optional always-on mode for agents that need immediate response
- Separate lightweight process between heartbeat cycles
- Dream consolidation: agent processes learnings during idle periods

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

### 7.6 Concurrency Partitioning (from Claude Code)

**Pattern:** Tools are classified as read-only (parallel-safe) or write (serial-required).

```typescript
interface Tool {
  isConcurrencySafe(): boolean  // true = read-only, false = write/mutative
  isReadOnly(): boolean         // informational
  isDestructive(): boolean      // for escalation UI
}
```

**Execution rules:**
- Read-only tools: execute in parallel across agents
- Write tools: execute serially, one at a time per agent
- Gmail read: parallel-safe
- Gmail send: NOT parallel-safe (requires serial execution)

### 7.7 Streaming Tool Execution (Phase 1.5)

**Pattern from Claude Code:** Tools fire as `tool_use` blocks arrive during streaming, before response completes.

**AgentOS implementation:**
- SSE stream delivers tool calls as they execute
- Canvas shows real-time progress: "Reading inbox... Found 12 emails"
- User sees agent working, not just the final result
- Reduces perceived latency

### 7.8 Skills System Architecture (Phase 1.5)

```
skills/
├── email-handler/
│   └── SKILL.md          # YAML frontmatter + prompt
├── research-agent/
│   └── SKILL.md
└── support-drafter/
    └── SKILL.md

SkillLoader:
  - loadSkillsDir() → reads all SKILL.md files
  - parse frontmatter → extract triggers, context, actions
  - register with HookRegistry

SkillEvaluator:
  - on user input, evaluate all skill triggers
  - if match: inject skill context into agent prompt
  - skills can add tools, modify behavior, request approvals
```

### 7.9 Feature Flag System (Phase 1.5)

```typescript
// Build-time DCE — tree-shaken if false
const ENABLE_NEW_ESCALATION_UI = feature('ENABLE_NEW_ESCALATION_UI')

// Runtime kill-switch
const flags = await featureFlagsService.getFlags(userId)
if (!flags['ENABLE_PROACTIVE_MODE']) {
  // disable proactive agent mode for this user
}
```

**Flag sources:**
- Build-time constants (feature flag in code)
- Runtime config (database, per-user, per-tier)
- Remote config (update without rebuild)

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

### Phase 1 — Foundation (0–90 days)

**Must have (10 items):**
1. Durable execution (BullMQ + Postgres)
2. Heartbeat scheduler
3. Email Agent template (via template picker — 2-3 templates)
4. Gmail read/write tools
5. Action approval escalation (modal)
6. Agent card with status, last ran, next wake, budget bar
7. Activity log (timeline view)
8. Magic link auth
9. Canvas team dashboard layout
10. Working memory (per-session)

**Nice to have:**
- Web search tool
- Escalation governance board (Tier 2)
- Auto-pause on budget exceeded
- 2nd/3rd agent templates

**Out of scope:**
- Long-term memory
- Template gallery UI (replaced by Phase 1 template picker)
- Calendar/CRM integrations
- Agent marketplace

---

### Phase 1.5 — Friction Reduction (90–120 days)

*New phase added based on Claude Code competitive analysis. These are immediate wins that dramatically improve the product before Phase 2.*

**Must have:**
1. **Feature flag system** — `feature('FLAG')` build-time DCE + runtime kill-switches
2. **Permission auto-approval** — TRANSCRIPT_CLASSIFIER-inspired AI classifier for routine actions
3. **Streaming tool execution** — real-time SSE progress updates during agent runs
4. **Skills system (v1)** — directory-based prompts as templates for agent configurations

**Rationale:**
- Claude Code's TRANSCRIPT_CLASSIFIER (107 refs) shows permission friction is the #1 user experience problem
- Feature flags enable shipping half-tested capabilities safely
- Streaming execution reduces perceived latency and builds trust faster

---

### Phase 2 — Memory + Multi-Agent (120–180 days)

**Must have:**
1. Long-term memory (mem0.ai + Qdrant)
2. Template gallery (6–10 templates)
3. Multi-agent delegation (COORDINATOR_MODE-inspired)
4. PROACTIVE agent mode (between-user autonomous action)
5. KAIROS-inspired daemon mode (always-on agents with dream consolidation)
6. Calendar OAuth
7. Escalation governance board (Tier 2)
8. Auto-pause on budget exceeded

**Rationale:**
Claude Code's KAIROS + PROACTIVE + COORDINATOR_MODE collectively reveal the architecture for truly autonomous agents. Phase 2 brings AgentOS from "scheduled task runner" to "always-on intelligent agent."

---

### Phase 3 — Scale (180+ days)

**Must have:**
1. CRM integrations (HubSpot, Salesforce)
2. Slack integration
3. Agent marketplace
4. Team collaboration (multi-user)
5. Remote bridge architecture (persistent remote agent sessions)
6. Mobile experience

**Out of scope:**
- Developer tools or IDEs
- CLI tools or terminal interfaces
- Agent development frameworks
- One-off task runners

---

## 10. Success Metrics

### 10.1 Product Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first agent | < 5 min from signup | Session timestamp: signup → first agent activated |
| Activation rate | > 60% of signups hire an agent | Count: signups with ≥1 activated agent / total signups |
| AHA moment rate | > 40% experience it by day 3 | Survey: "Did your agent complete work before you checked it?" |
| Escalation resolution time | < 5 min from ping to decision | Timestamps: escalation created → decision recorded |
| **Unnecessary escalation rate** | < 20% of escalations | Escalations where agent could have handled autonomously |
| **Important escalation capture rate** | > 95% | Agent correctly identifies items needing human judgment |
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
| Permission auto-approval accuracy | > 90% | Auto-approved actions requiring no reversal |

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **ADE** | Agent Distribution Environment — infrastructure making agents accessible to non-technical users |
| **Activate** | To deploy an agent on a schedule (not run once — persistent) |
| **Agent** | A persistent AI worker with a role, heartbeat schedule, tools, and escalation policy |
| **AHA moment** | The moment a user realizes their agent has been working for them without being asked |
| **Checkpoint** | A logged state transition that enables resume after process death |
| **COORDINATOR_MODE** | Manager/worker architecture for multi-agent orchestration |
| **Durable execution** | Execution that survives server restarts — state persisted to Postgres, not memory |
| **Escalation** | When an agent pauses execution and requests human input before proceeding |
| **Feature flag** | Build-time DCE or runtime kill-switch for gradual rollout |
| **Heartbeat** | A scheduled wake-up event where an agent checks for work and acts |
| **Hire** | To create and activate a persistent agent (not run a task) |
| **KAIROS** | Claude Code's always-on daemon mode with dream consolidation |
| **Layer** | Abstraction level the user operates at (1=pure intent, 4=per-action control) |
| **NL** | Natural Language — plain English interface for configuring agents |
| **PROACTIVE** | Agent mode where the agent acts on best judgment between users, rather than waiting |
| **Skill** | A directory-based self-contained prompt with YAML frontmatter and conditional activation |
| **Ticket** | A unit of work in the activity log — one agent action with full audit trail |
| **TRANSCRIPT_CLASSIFIER** | AI-based permission auto-approval system that reduces user friction |
| **Working memory** | Per-session ephemeral memory within a heartbeat cycle |

---

## 12. Appendix: Claude Code Competitive Analysis

### Source
Leaked Claude Code source (https://github.com/lowcortisolprogrammer/claude-code)
Analyzed 2026-03-31

### Competitive Position

| Product | Target | Durable | Heartbeats | Canvas | Org Chart | Our Advantage |
|---------|--------|---------|-----------|--------|---------|---------------|
| Emdash | Developers | ❌ | ❌ | ❌ | ❌ | — |
| Glass | Developers | ❌ | ❌ | ❌ | ❌ | — |
| Collaborator | Developers | ❌ | ❌ | ✅ | ❌ | — |
| Cling Kanban | Developers | ❌ | ❌ | ✅ | ❌ | — |
| Paperclip | AI builders | ✅ | ✅ | ✅ | ✅ | Heartbeats, cost budgets, board governance |
| **AgentOS** | **Everyone else** | **✅** | **Planned** | **✅** | **Planned** | **Durable + Heartbeats + Org Chart + Canva-level UX** |

### Strategic Findings

**KAIROS (154 refs):** Always-on daemon mode with dream consolidation confirms the product direction. Claude Code — a company with far more resources — is converging on the same architecture. This validates AgentOS's core thesis and creates a 6-12 month competitive window before Anthropic ships broadly.

**PROACTIVE (37 refs):** Agents that act on best judgment between users rather than waiting for confirmation. This is exactly what Maria wants — she doesn't want to be asked every time, only for important escalations.

**COORDINATOR_MODE (32 refs):** Manager/worker architecture for orchestrating parallel sub-agents. Maps directly to AgentOS's escalation governance and multi-agent delegation.

**TRANSCRIPT_CLASSIFIER (107 refs):** AI-based permission auto-approval. The single biggest friction reducer for non-technical users. A business owner doesn't want to approve every tool call.

### Key Files Reference

| Domain | Primary Files |
|--------|--------------|
| Core Loop | `query.ts`, `QueryEngine.ts` |
| Tools | `Tool.ts`, `tools.ts`, `services/tools/toolExecution.ts` |
| Streaming | `StreamingToolExecutor.ts`, `toolOrchestration.ts` |
| Compaction | `compact.ts`, `autoCompact.ts`, `microCompact.ts` |
| Multi-Agent | `AgentTool.tsx`, `forkSubagent.ts`, `runAgent.ts`, `coordinatorMode.ts` |
| MCP | `services/mcp/client.ts`, `services/mcp/auth.ts` |
| Error Handling | `errors.ts`, `withRetry.ts` |
| Persistence | `sessionStorage.ts`, `toolResultStorage.ts` |
| Skills | `loadSkillsDir.ts`, `bundled/skillify.ts` |
| Remote Bridge | `bridge/bridgeMain.ts`, `bridge/replBridge.ts`, `remoteBridgeCore.ts` |
| Feature Flags | Scattered — `feature('FLAG')` throughout |

---

*Last updated: 2026-03-31*
*Owner: Product*
*Status: Living document — update with each major release*
