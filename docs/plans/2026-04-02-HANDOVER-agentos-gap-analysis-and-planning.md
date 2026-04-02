# Handover Prompt — AgentOS Gap Analysis and Planning

**Date:** 2026-04-02
**Handover from:** Gap analysis against Perplexity Computer (Damian Player tweet)
**Status:** Two new specs written, PRD updated, ready to commit and push

---

## What Was Done

### 1. Competitive Gap Analysis

A full parity table was built comparing Perplexity Computer to AgentOS across 15 dimensions.

**Perplexity Computer advantages (gaps AgentOS must close):**
- Google Drive, Slack, HubSpot connectors (400+ total)
- Escalation suggestions / agent self-proposal ("set this on a schedule", "is there something I'm not asking about?")
- Non-technical UX (connectors UI) — built and working

**AgentOS structural advantages (Perplexity cannot easily close):**
- Durable execution (checkpoint/resume — Perplexity has none)
- Immutable audit trail (HMAC-signed append-only logs)
- Idempotency (ULID-based — no duplicate tool calls)
- Escalation model (Approve/Edit/Skip/Cancel — Perplexity has none)
- Cross-session memory (Phase 2 — Perplexity is session-only)

**Both missing:**
- Visual canvas / team dashboard
- NL-to-node composition
- Multi-agent orchestration

---

### 2. Three Real Gaps Identified

**Gap 1 — Connector Gap**
Perplexity has 400+ connectors. AgentOS has Gmail only. Maria's Monday CSV automation loop (read from Drive → process → write to Drive) requires Google Drive. This is P0.

**Gap 2 — Canvas UI**
The most visible unbuilt surface. PRD describes it comprehensively. 7 implementation units, nothing started. 8-12 weeks of frontend work. Blocks everything: NL-to-node, reasoning traces, escalation UI, suggestion cards.

**Gap 3 — Escalation Suggestions (Agent Self-Proposal)**
The most "agent-like" moment Damian describes. After completing a task, the agent asks "is there something I'm not asking about?" and proposes: schedule it recurring, add a follow-on step, connect a missing app. **This was not documented anywhere in the existing codebase.** All three gaps are now addressed.

---

### 3. New Documents Written

#### `docs/ARCHITECTURE-06-escalation-suggestions.md`

**Status:** Fully written. Not started in code.

A complete architecture spec for the agent self-proposal pattern covering:

- **Two modes:** Post-run reflection (automatic, silent) and on-demand query ("any suggestions for my team?")
- **Five suggestion types:**
  - `schedule_recurring` — task ran 3+ times with similar inputs
  - `follow_on_task` — natural next step from output schema
  - `connector_gap` — agent tried tool without connector
  - `approval_bump` — 10+ consecutive auto-approved runs
  - `budget_increase` — consistently hits budget limit
- **Schema:** `EscalationSuggestion` type with trigger evidence, proposal action, confidence, lifecycle (`pending → accepted/dismissed/expired`)
- **UX:** Dismissible canvas cards, on-demand NL query panel, suggestion in escalation modal
- **Database:** `escalation_suggestions` table (ULID, agent_id, run_id, type, confidence, proposal payload, status)
- **Open questions:** Frequency capping, clustering threshold (Jaccard similarity > 0.8), suggestion fatigue (quiet after 5 dismissals), long-term memory integration

**Start here for code implementation:** Run `PostRunReflection` function after every completed run in `durable-runner.ts`. The `schedule_recurring` trigger is the highest-value, lowest-complexity place to start.

---

#### `docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md`

**Status:** Fully written. Not started in code.

A comprehensive connector build plan covering:

- **Connector priority:**
  - P0 (MVP): Google Drive — enables the Monday CSV automation loop
  - P1 (Phase 2): Slack, HubSpot
- **Architecture:** MCP client already exists (`app/lib/mcp/mcp-client.ts`). Each connector needs: OAuth flow, tool definitions, capability registration, connector card UI
- **What already exists:** MCP client, token refresh, manifest cache, Gmail OAuth, capability schema for all three connectors in ARCHITECTURE-01
- **What needs building:** Per-connector OAuth handlers, tool definition files (`app/lib/connectors/{drive,slack,hubspot}/tools.ts`), connector card components
- **Reference implementation:** `app/lib/gmail/oauth.ts` is the pattern to follow for Google Drive OAuth
- **MCP server question open:** Zapier MCP (6,000+ connectors) vs. n8n MCP (400+) — decision needed before C1 begins
- **Test scenarios:** End-to-end OAuth + tool invocation for each connector

---

### 4. PRD.md Updates

Three targeted edits to `docs/PRD.md`:

**MVP Feature Set — added item 14:**
> "Escalation Suggestions — After every completed run, the agent evaluates whether suggestions apply. It may surface: recurring schedule proposals, follow-on task proposals, and connector gap alerts. Suggestions appear as dismissible cards on the canvas."

**What Is NOT in MVP — updated Google Drive row:**
> "Google Drive (MVP). HubSpot and Slack ship in Phase 2. Sufficient to prove the model and complete the Monday CSV automation loop. See `docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md`."

**Document Roadmap — Phase 1 additions:**
- `Plan: Connector Implementation` — Google Drive, Slack, HubSpot via MCP
- `ARCHITECTURE-06: Escalation Suggestions` — agent self-proposal pattern

**Document Roadmap — Phase 2 addition:**
- `Plan: Escalation Suggestions (Mode B)` — on-demand NL query, requires Canvas UI

---

## Files Changed

| File | Change |
|---|---|
| `docs/ARCHITECTURE-06-escalation-suggestions.md` | **New** — escalation suggestions architecture |
| `docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md` | **New** — connector build plan |
| `docs/PRD.md` | **Modified** — 4 targeted edits |

---

## What the Next Agent Should Know

### Priority order for implementation

1. **Canvas UI** — This is the longest critical path. The fullstack plan puts it at weeks 4-10. Frontend team should start with Unit 1 (React Flow foundation) immediately, even before backend APIs are complete — use mock data.

2. **Google Drive connector** — P0 for the MVP. The Monday CSV loop requires it. Triggers immediately after Gmail is wired. Parallelizable with Canvas work.

3. **Escalation Suggestions** — Start with Phase A (Post-Run Reflection + `schedule_recurring` trigger). Does not require Canvas UI — suggestion cards can appear in the escalation modal first. `durable-runner.ts` is the integration point.

4. **Slack + HubSpot connectors** — Phase 2. Can be planned now but not started until Drive is stable.

### Architecture dependencies

```
DurableRunner.execute()         ──► PostRunReflection()      ──► EscalationSuggestion[]
      │                                  │
      │                                  └── requires: working-memory.ts, escalation_suggestions table
      │
      └── executeTool middleware chain  ──► MCP Client ──► Zapier MCP ──► Drive/Slack/HubSpot
```

### Key existing files to read before starting

- `app/lib/runtime/durable-runner.ts` — integration point for PostRunReflection
- `app/lib/mcp/mcp-client.ts` — existing MCP infrastructure
- `app/lib/gmail/oauth.ts` — OAuth pattern to replicate for Drive
- `app/lib/working-memory.ts` — used by escalation suggestions
- `app/lib/middleware/execute-tool.ts` — tool execution pipeline

### Open questions that need decisions

1. **MCP server:** Zapier vs. n8n — before starting connector work
2. **Escalation suggestion frequency cap:** Max 2 per run? (open in ARCHITECTURE-06)
3. **Clustering threshold for recurring detection:** Jaccard similarity > 0.8 over 5 runs? (open in ARCHITECTURE-06)

---

## Handover Verification Checklist

- [ ] `docs/ARCHITECTURE-06-escalation-suggestions.md` — reviewed and accurate
- [ ] `docs/plans/2026-04-02-003-feat-agentos-connector-implementation-plan.md` — reviewed and accurate
- [ ] `docs/PRD.md` — edits verified: feature #14 added, connector row updated, roadmap updated
- [ ] All three gaps now have corresponding documents
- [ ] `git add` and commit with message: "docs: add escalation suggestions spec, connector implementation plan; update PRD gap coverage"
- [ ] Push to origin

---

*Generated from gap analysis against Perplexity Computer (Damian Player, @damianplayer, 2026-04-02). The thesis "Perplexity Computer = first time non-developers get autonomous AI agents" validates the AgentOS direction and exposes three specific gaps that are now addressed.*
