# Phase 2 — Differentiate: AgentOS

**Date:** 2026-04-05
**Type:** feat
**Status:** active
**Origin:** PRD.md Section 12 (Phase 2 — Differentiate, Days 90–180)
**Execution order:** PROACTIVE → Permission Auto-Approval → Multi-Canvas → Memory → Auto-Pause → Governance → Skills

---

## Overview

Phase 2 transforms AgentOS from a durable execution harness into an **always-on, memory-aware, autonomous agent platform**. The MVP proved Maria can hire an agent. Phase 2 proves the agent works like an employee — proactively, with context, within budget, and without constant hand-holding.

---

## Problem Frame

Maria's agents in MVP are reactive: they wake on cron, process work, and wait for the next heartbeat. She still babysits them too much (every escalation requires attention). Phase 2 fixes this through three shifts:

1. **Proactive** — agents wake immediately when work arrives (Gmail push), not on the next cron tick
2. **Autonomous** — a permission classifier auto-approves routine tool calls; Maria only sees unusual ones
3. **Memory-aware** — agents remember Maria's preferences across sessions; hallucinated facts are flagged for correction

---

## Requirements Trace

From PRD.md Section 12:

- **R1.** 80%+ of tool calls are auto-approved by the classifier
- **R2.** PROACTIVE latency < 2 min from new lead/inquiry to agent acted or escalated
- **R3.** Agent remembers Maria's preferences across sessions (mem0 + Qdrant)
- **R4.** Extracted facts are confirmed or denied by Maria; denied facts feed back to mem0 tuning
- **R5.** Agent pauses when budget exceeded; Maria resumes when ready
- **R6.** Structural governance changes (new tools, new agents) require approval before activation
- **R7.** Multi-canvas portfolio: paperclip.ai-style flat spatial view of all canvases
- **R8.** Skills directory with `SKILL.md` YAML frontmatter, parser, and DB registry

---

## Scope Boundaries

**Explicit exclusions from Phase 2:**
- Multi-agent orchestration (fork/join, coordinator → workers) — Phase 3
- Team collaboration / multi-user auth — Phase 3
- HubSpot + Calendar OAuth — Phase 3
- Slack integration — Phase 3
- Agent marketplace — Phase 3
- Remote bridge / enterprise isolation — Phase 3

---

## Key Technical Decisions

### PROACTIVE: Cloudflare Worker over Vercel Edge

**Decision:** Gmail push webhooks land on a Cloudflare Worker, not the Next.js app.

**Why:** Next.js API routes are long-poll synchronous. Gmail push needs a durable receiver that queues work into BullMQ without blocking. Cloudflare Workers are globally distributed, cheap, and handle the webhook immediately. Vercel serverless functions cold-start慢 and aren't built for this.

**Implementation:** Worker receives Gmail pub/sub push → validates JWT → calls BullMQ wake endpoint → returns 200 immediately. BullMQ handles the actual job queue.

### Permission Classifier: Small LLM over Rules Engine

**Decision:** Use a small fine-tuned model (Claude Haiku or GPT-4o-mini) as the TRANSCRIPT_CLASSIFIER, not a rules engine.

**Why:** Business workflow patterns are too nuanced for static rules. The classifier must learn Maria's patterns over time. A small model with retrieval-augmented classification (RAG over past approval decisions) is more maintainable than a growing rules engine.

**Output contract:** `{ decision: 'auto_approve' | 'execute_and_notify' | 'escalate'; reasoning: string; confidence: number; }`

### Memory: mem0 Cloud over Self-Hosted

**Decision:** Use mem0's hosted API (api.mem0.ai) for extraction, Qdrant Cloud for vector storage.

**Why:** Self-hosting mem0 + Qdrant (as shown in docs/PRD.md architecture diagram) adds operational burden incompatible with a startup timeline. mem0's managed tier + Qdrant Cloud gives the same capability with zero infra management.

**Fallback:** Localdocker compose option documented for enterprise customers who require self-hosting.

### Multi-Canvas: One DB Table, Not a New Architecture

**Decision:** `canvases(id, user_id, name, domain, agents_json, connections_json, created_at)` — agents and connections stored as JSON initially, migrated to wire tables later.

**Why:** Delaying full normalization of agents/connections avoids a complex migration during Phase 2. The canvas switcher UI is the immediate deliverable; the wire normalization is a Phase 2.5 task.

### Skills Directory: File-Based, Not DB-First

**Decision:** Skills are `/skills/<name>/SKILL.md` files on disk (or S3), not a database registry.

**Why:** SKILL.md files are portable, version-controllable, and can be shared as gists or repos. A DB registry can be layered on top in Phase 3. This also avoids the schema migration cost in Phase 2.

---

## Implementation Units

```
Execution order: PROACTIVE → Permission Auto-Approval → Multi-Canvas
               → Long-Term Memory → Memory Integrity → Auto-Pause
               → Governance → Skills Directory
```

---

- [ ] **Unit 1: PROACTIVE Mode — Gmail Push Webhook**

**Goal:** Agent wakes immediately when new Gmail arrives, not on next cron tick. Latency target: < 2 min from push to agent acted/escalated.

**Requirements:** R2

**Dependencies:** None (green field)

**Files:**
- Create: `app/lib/runtime/proactive-webhook.ts` — BullMQ job enqueue from webhook payload
- Create: `app/app/api/webhooks/gmail/route.ts` — Cloudflare Worker calls this; enqueues BullMQ job and returns 200 fast
- Create: `workers/gmail-push/index.js` — Cloudflare Worker (JavaScript, deployed separately)
- Modify: `app/lib/runtime/durable-runner.ts` — add `enqueueImmediate(id, agentId)` method
- Create: `app/lib/runtime/proactive-queue.ts` — BullMQ queue definition for immediate jobs

**Approach:**
1. Gmail push notifications (pub/sub) land on the Cloudflare Worker
2. Worker validates the JWT from Google, extracts message metadata (sender, subject, threadId)
3. Worker POSTs to `/api/webhooks/gmail` with the event payload — does NOT wait for processing
4. `/api/webhooks/gmail` enqueues a BullMQ job with `{ type: 'gmail_push', payload }` and returns 200 immediately (< 100ms)
5. BullMQ worker dequeues and runs the agent immediately (not on cron)
6. Agent processes the new email → escalates or auto-acts

**Patterns to follow:** BullMQ queue pattern from existing `durable-runner.ts` startup-recovery flow.

**Test scenarios:**
- Gmail push arrives → BullMQ job enqueued → agent runs within 2 min
- Gmail push while agent is already running same agent → job queued, not dropped
- Cloudflare Worker unreachable → Gmail retries with exponential backoff (standard pub/sub behavior)
- Webhook payload tampered → signature validation fails, 401 returned

**Verification:**
- End-to-end: send test email to Gmail → verify agent was woken within 2 min
- Worker health check returns 200 when reachable

---

- [ ] **Unit 2: Permission Auto-Approval — TRANSCRIPT_CLASSIFIER**

**Goal:** AI classifier between LLM tool call output and tool execution. Routine actions auto-execute. Only unusual ones escalate to Maria. 80%+ auto-approval rate is the success target.

**Requirements:** R1

**Dependencies:** Unit 1 (PROACTIVE) unblocks it but they are independent features; can run in parallel.

**Files:**
- Create: `app/lib/classifier/transcript-classifier.ts` — LLM-based classifier: `{ toolCall, userHistory, approvedContactList } → { decision, reasoning, confidence }`
- Create: `app/lib/classifier/classifier-prompt.ts` — system prompt for the classifier
- Modify: `app/lib/runtime/streaming-tool-executor.ts` — insert classifier between tool_call partition and tool dispatch for `needs_approval` permission-level tools
- Create: `app/lib/classifier/approval-history.ts` — retrieve recent approval decisions for RAG context
- Modify: `app/lib/middleware/execute-tool.ts` — call classifier for `needs_approval` tools instead of always escalating
- Create: `app/app/api/classifier/decisions/route.ts` — log classifier decisions to DB for audit trail
- Create: `app/lib/db/migrations/009_classifier_decisions.sql`

**Approach:**
1. `streaming-tool-executor.ts` partitions tool calls → read tools (parallel) → write tools (serial)
2. For each write tool, check `toolDef.permissionLevel`: if `'needs_approval'`, call the classifier before escalating
3. Classifier receives: `{ toolName, args, agentRole, userId, recentApprovalHistory }`
4. Classifier outputs: `{ decision: 'auto_approve' | 'execute_and_notify' | 'escalate', reasoning: string, confidence: number }`
5. If `confidence >= 0.90` → auto-execute, log to `classifier_decisions` table
6. If `confidence >= 0.70 AND decision == 'execute_and_notify'` → execute, notify Maria after
7. If `confidence < 0.70` → pause, emit `approval_required` event (current behavior)
8. Maria's final decision (approve/deny) is stored and fed back into the classifier context for next similar call

**Classifier prompt design:**
```
You are a business workflow classifier. Given a tool call and the user's approval history,
determine if this action is routine for this user's patterns.

RULE: Actions to known contacts, within normal business hours, matching past approved patterns
are ROUTINE. Unusual recipients, new tools, high-value amounts, or irregular patterns ESCALATE.

Output JSON:
{
  "decision": "auto_approve" | "execute_and_notify" | "escalate",
  "reasoning": "why this decision was made (Maria can read this)",
  "confidence": 0.0-1.0
}
```

**Patterns to follow:** `streaming-tool-executor.ts` tool dispatch pattern. Middleware chain from `execute-tool.ts`.

**Test scenarios:**
- Tool call to known contact within normal pattern → auto-approved with confidence > 0.90
- Tool call to new contact with high-value amount → escalated
- Repeated approved pattern → confidence increases on each approval
- Classifier decision logged to DB with full reasoning for Maria's review

**Verification:**
- 80%+ of `needs_approval` tools are auto-approved in production
- Every classifier decision has reasoning Maria can read in the activity log
- Classifier decisions are stored and retrievable for audit

---

- [ ] **Unit 3: Multi-Canvas Portfolio**

**Goal:** Maria manages multiple canvases, each representing a team/domain of work. paperclip.ai-style flat spatial view for navigation.

**Requirements:** R7

**Dependencies:** None (green field)

**Files:**
- Create: `app/lib/db/migrations/010_canvases.sql` — `canvases(id, user_id, name, domain, agents_json, connections_json, is_default, created_at, updated_at)`
- Modify: `app/lib/db/queries.ts` — add canvas CRUD queries
- Create: `app/app/api/canvases/route.ts` — `GET /api/canvases` (list), `POST /api/canvases` (create)
- Create: `app/app/api/canvases/[canvasId]/route.ts` — `GET`, `PUT`, `DELETE`
- Create: `app/app/api/canvas/wires/route.ts` — extend existing wire route to accept `canvasId`
- Modify: `app/app/(app)/canvas/page.tsx` — add canvas switcher in top nav
- Modify: `app/app/components/canvas/CanvasProvider.tsx` — multi-canvas state context
- Create: `app/app/(app)/portfolios/page.tsx` — the paperclip-style flat spatial view (Phase 2 canvas switcher UI)

**Approach:**
1. `canvases` table: one row per canvas, stores `agents_json` and `connections_json` as JSON initially
2. Canvas switcher UI: dropdown in top nav showing all canvases for current user
3. On switch: load selected canvas from DB, hydrate CanvasProvider with agents/connections from JSON
4. Portfolio view: flat grid of canvas cards, each showing canvas name, agent count, last active
5. `POST /api/canvases` creates a new canvas (empty or cloned from existing)
6. Wire persistence: existing `POST /api/canvas/wires` extended to accept `canvasId`

**Patterns to follow:** Existing `teams` table pattern in `queries.ts`. `CanvasProvider` context pattern.

**Test scenarios:**
- User with 3 canvases can switch between them; state is isolated per canvas
- New canvas created → empty canvas shown, not the old canvas
- Canvas deleted → agents and wires are cascade-deleted
- Existing canvas loads agents and wires correctly on switch

**Verification:**
- Canvas switcher shows all user's canvases
- Switching canvases preserves state of each independently
- New canvas created and appears in switcher immediately

---

- [ ] **Unit 4: Long-Term Memory — mem0 + Qdrant Integration**

**Goal:** Agent remembers Maria's preferences across sessions. Preferences surface in future runs as context, reducing repeated clarifications.

**Requirements:** R3

**Dependencies:** None (green field, but benefits from Unit 2 classifier context)

**Files:**
- Create: `app/lib/memory/memory-client.ts` — mem0 client initialization with Qdrant Cloud + OpenAI extraction
- Create: `app/lib/memory/memory-operations.ts` — `storePreference(userId, memory)`, `searchMemory(userId, query)`, `getAgentContext(userId, limit)`
- Create: `app/lib/db/migrations/011_memory_facts.sql` — `memory_facts(id, user_id, fact_text, source_run_id, confirmed_at, denied_at, created_at)` + `memory_embeddings` table (Qdrant reference)
- Modify: `app/lib/runtime/runner.ts` — inject `getAgentContext(userId)` into agent system prompt at start of each run
- Create: `app/app/api/memory/facts/route.ts` — `GET /api/memory/facts` (list confirmed facts), `POST` (manually add fact)
- Modify: `app/lib/nl/prompts.ts` — inject memory context into system prompt

**Approach:**
1. After each completed run, call `memory.add()` with a summary of facts extracted from the run's tool calls
2. mem0 infers structured facts: preferences, constraints, contact patterns, business rules
3. On next run start: call `memory.search()` with the current goal → inject top-K relevant memories as system prompt context
4. mem0 → Qdrant Cloud for vector storage; OpenAI for extraction
5. `memory_facts` Postgres table stores confirmed/denied facts for audit and Maria's review
6. Configuration via env: `MEM0_API_KEY`, `QDRANT_CLOUD_URL`, `QDRANT_API_KEY`

**Patterns to follow:** Existing `trace-emitter.ts` event emission pattern (fire-and-forget, non-blocking).

**Test scenarios:**
- Fact extracted from run A → retrieved as context in run B
- Confirmed fact persists across sessions
- Denied fact is not retrieved in future context

**Verification:**
- mem0 dashboard shows facts being extracted after each run
- Agent system prompt includes relevant prior facts when starting a new run
- Memory API returns facts for a given user

---

- [ ] **Unit 5: Memory Integrity — Maria's Fact Confirmation**

**Goal:** Every extracted fact is confirmed or denied by Maria. Denied facts are flagged for mem0 prompt tuning (feedback loop that improves over time).

**Requirements:** R4

**Dependencies:** Unit 4 (memory_facts table and facts API must exist)

**Files:**
- Create: `app/app/api/memory/facts/[factId]/route.ts` — `PATCH` to confirm or deny a fact
- Modify: `app/app/(app)/activity/page.tsx` — add "Learned Facts" tab showing unconfirmed facts
- Create: `app/app/(app)/memory/page.tsx` — dedicated memory review UI: list of confirmed + denied facts, confirm/deny buttons
- Create: `app/components/memory-fact-card.tsx` — fact card with confirm/deny and source run link
- Modify: `app/lib/memory/memory-client.ts` — call mem0 feedback API when Maria denies a fact
- Create: `app/lib/db/migrations/012_denied_facts_feedback.sql` — add `feedback_sent_to_mem0_at` column

**Approach:**
1. After run completes, extracted facts appear as "Pending Review" in Maria's Activity Log
2. Maria can open the Memory page to review: each fact shows the source run, timestamp, and confidence
3. Confirm → fact is marked `confirmed_at`, used in future context without flagging
4. Deny → fact is marked `denied_at`; `feedback_sent_to_mem0_at` is set when mem0 feedback API is called
5. Background job calls mem0's feedback endpoint: `{ fact_id, verdict: 'deny' }` — mem0 adjusts extraction prompt tuning
6. Denied facts are excluded from future context injection

**Feedback loop:**
```
mem0.extract(run_transcript) → fact
Maria.deny(fact) → mem0.feedback(fact_id, 'deny')
mem0 adjusts extraction_params → future extractions more conservative
```

**Patterns to follow:** Existing escalation suggestion accept/dismiss flow in `approval-manager.ts`.

**Test scenarios:**
- Denied fact is not retrieved in next run's context
- Confirming a fact marks it as confirmed in DB
- Denied fact sent to mem0 feedback API

**Verification:**
- Maria sees unconfirmed facts in Activity Log after each run
- Denied fact excluded from next run's injected context
- mem0 feedback API called with correct payload on deny

---

- [ ] **Unit 6: Auto-Pause on Budget**

**Goal:** Agent pauses when its `budget_ms` is exhausted. Maria sees a "Budget exceeded" state on the canvas node and resumes when ready.

**Requirements:** R5

**Dependencies:** None (only modifies existing runner behavior)

**Files:**
- Modify: `app/lib/runtime/durable-runner.ts` — add `checkBudget(agentId, elapsedMs)` at start of each tool execution step; if exceeded, emit `paused_budget` event and stop
- Modify: `app/lib/db/queries.ts` — add `updateAgentStatus(id, 'paused_budget')` query
- Modify: `app/lib/tracing/trace-emitter.ts` — add `paused_budget` event type
- Modify: `app/app/components/canvas/AgentCard.tsx` — show "Budget exceeded" state with resume button
- Create: `app/app/api/agents/[agentId]/resume/route.ts` — `POST` to resume a paused_budget agent
- Modify: `app/lib/middleware/execute-tool.ts` — check `elapsedMs >= budgetMs` before each tool call

**Approach:**
1. Each agent has `budget_ms` (milliseconds of LLM execution budget) in the DB
2. Before each tool call, durable-runner checks: `elapsedMs + estimatedToolCost >= budgetMs`
3. If budget is exhausted mid-run: emit `paused_budget` event → node status turns amber "Budget exceeded" → agent stops after current step
4. Maria sees the paused state on the canvas and clicks "Resume" → calls `POST /api/agents/:id/resume` which resets a `paused_budget` flag
5. On resume, agent continues from last checkpoint (not from start)
6. When agent is resumed, `budgetMs` can be increased or the run continues with remaining budget

**Patterns to follow:** Existing `updateAgentStatus` pattern in `queries.ts`. Checkpoint/resume pattern from `durable-runner.ts`.

**Test scenarios:**
- Agent exhausts budget mid-run → run pauses gracefully after current step
- Canvas node shows "Budget exceeded" amber badge
- Maria resumes → agent continues from last checkpoint
- Agent with zero budget cannot be started

**Verification:**
- Agent with 100ms budget running 200ms of LLM calls pauses after budget exhausted
- "Budget exceeded" badge appears on the canvas node
- Resume button restores agent to running state

---

- [ ] **Unit 7: Governance Board**

**Goal:** Structural changes (new agents, new tools) require explicit approval before activation. Governance log records all decisions for Maria's audit trail.

**Requirements:** R6

**Dependencies:** Unit 3 (multi-canvas provides the context for governance scope)

**Files:**
- Create: `app/lib/db/migrations/013_governance_actions.sql` — `governance_actions(id, user_id, canvas_id, action_type, payload_json, status, resolved_at, resolved_by, created_at)`
- Modify: `app/lib/db/queries.ts` — add governance action queries
- Create: `app/app/api/governance/route.ts` — `GET` list pending governance actions, `POST` create new action
- Create: `app/app/api/governance/[actionId]/route.ts` — `PATCH` to approve/deny
- Create: `app/app/(app)/governance/page.tsx` — governance board UI: pending structural changes requiring approval
- Create: `app/components/governance-action-card.tsx` — card showing what change is proposed and why
- Modify: `app/app/api/canvas/nl-to-canvas/route.ts` — when NL creates a new agent, if governance_required, create governance_action instead of creating directly
- Modify: `app/lib/runtime/runner.ts` — when runner tries to use a new tool type not previously approved, create governance_action and pause

**Approach:**
1. Governance triggers: (a) NL prompt creates a new agent type not in the canvas; (b) runner encounters a tool not previously approved for this canvas; (c) Maria adds a new integration
2. `governance_actions` record created with `status: 'pending'`, agent pauses
3. Governance Board UI shows pending changes: "NL wants to add a new Lead Enrichment agent with gmail.send access. Approved contacts: 0. Risk: HIGH."
4. Maria approves or denies. Decision logged.
5. On approve: governance_action resolved, agent/unlock proceeds. On deny: agent remains paused, suggestion dismissed.

**Patterns to follow:** Existing escalation suggestion flow (`approval-manager.ts`).

**Test scenarios:**
- NL proposes new agent with new tool → governance action created, agent not started until approved
- Governance board shows all pending changes across all canvases
- Approving a governance action proceeds with the proposed change
- Denying removes the proposal and notifies Maria

**Verification:**
- Governance board shows pending structural changes
- Approved change executes automatically
- Denied change is logged and does not execute

---

- [ ] **Unit 8: Skills Directory**

**Goal:** Skills are portable, versioned agent configurations in `SKILL.md` files with YAML frontmatter. Maria can install a skill to her canvas with one click.

**Requirements:** R8

**Dependencies:** Unit 3 (canvas must exist to attach skills to)

**Files:**
- Create: `app/lib/skills/skill-parser.ts` — parse `SKILL.md` YAML frontmatter + markdown body → `SkillDefinition`
- Create: `app/lib/skills/skill-registry.ts` — `listSkills()`, `getSkill(name)`, `installSkill(name, canvasId)`
- Create: `app/lib/skills/types.ts` — `SkillDefinition`, `SkillManifest` interfaces
- Create: `app/lib/db/migrations/014_skills.sql` — `skills(id, name, description, manifest_json, source_url, created_at)`, `canvas_skills(canvas_id, skill_id)`
- Modify: `app/lib/db/queries.ts` — add skill CRUD queries
- Create: `app/app/api/skills/route.ts` — `GET /api/skills` (list available), `POST` (install to canvas)
- Create: `app/app/(app)/skills/page.tsx` — skills directory UI: browse available skills, install to current canvas
- Create: `app/components/skill-card.tsx` — skill card with description, install button
- Create: `skills/hvac-lead-agent/SKILL.md` — first bundled skill (HVAC vertical)

**SKILL.md schema:**
```yaml
---
name: HVAC Lead Handler
version: 1.0.0
description: Handles inbound HVAC service leads, qualifies urgency, drafts follow-up emails
archetype: lead_researcher
tools: [gmail.read, gmail.send, web.search]
escalation_threshold: $5000
auto_approve_contacts: ["@trusted-hvac-supplier.com"]
triggers:
  - "new lead"
  - "service inquiry"
  - "HVAC quote request"
---

# Skill Body

## About This Skill
This agent monitors the Gmail inbox for HVAC lead inquiries...

## Escalation Rules
- Deal value > $5,000 → escalate
- New company → escalate before sending
...
```

**Patterns to follow:** Existing NL interpretation pattern (`prompts.ts`).

**Test scenarios:**
- SKILL.md parsed correctly into `SkillDefinition` struct
- Skill installed to canvas → agents created on canvas matching skill config
- Invalid SKILL.md returns clear parse error
- Skill with unknown tool references flagged at install time

**Verification:**
- Skills directory page shows bundled skills
- Installing a skill creates agents on the current canvas
- SKILL.md with invalid frontmatter returns parse error

---

## System-Wide Impact

- **BullMQ integration:** Units 1, 2, 5, 6 all touch BullMQ job creation or worker loops. Changes must be additive (existing cron behavior preserved).
- **Streaming tool executor:** Unit 2 inserts classifier into the write-tools path — this is the most sensitive insertion point. Classifier must not block tool execution or introduce latency > 500ms.
- **Memory layer:** Units 4 and 5 add a new layer that injects context into agent system prompts. Memory must be retrieved before the LLM call, non-blocking if mem0 is slow.
- **Canvas state:** Unit 3 changes how agents/connections are stored — migration must preserve existing canvas data.
- **Auth surface:** All new API routes require session auth (BetterAuth from Phase 1).
- **Trace emitter:** Units 2, 5, 6 add new event types — canvas UI must handle new event types gracefully.

---

## Risks & Dependencies

### High Risk
- **mem0 feedback loop latency:** Denied facts must feed back to mem0 before next extraction run. If mem0 API is slow/down, the loop breaks. Mitigation: background job with retry queue.
- **Classifier confidence calibration:** 80% auto-approval target may not be met in early runs before classifier has history. Mitigation: start with conservative thresholds, lower to 0.80 after 50+ runs show stable calibration.
- **Qdrant Cloud dependency:** If Qdrant Cloud is down, memory retrieval fails. Mitigation: graceful fallback to mem0's built-in vector store.

### Medium Risk
- **Cloudflare Worker deployment:** Separate deployment pipeline for the worker adds operational complexity. Mitigation: keep worker minimal (only validates + forwards), all logic in Next.js.
- **Multi-canvas JSON migration:** Agents/connections stored as JSON initially, then normalized. Migration cost deferred to Phase 2.5. Mitigation: document the migration path now.

### Low Risk
- **Skills SKILL.md parser:** Simple YAML frontmatter parsing with zod. Very low failure surface.

---

## Documentation / Operational Notes

- `docs/skills/` directory will host all bundled skills (HVAC, Legal Intake, Real Estate Research)
- mem0 API key and Qdrant credentials required in env before Unit 4 deploy
- Cloudflare Worker URL must be configured in Gmail pub/sub push subscription in Google Cloud Console
- Governance board UI accessible from canvas nav bar

---

## Env Vars Required (Phase 2)

| Variable | Purpose | Unit |
|---|---|---|
| `MEM0_API_KEY` | mem0 extraction API | 4, 5 |
| `QDRANT_CLOUD_URL` | Qdrant vector store | 4, 5 |
| `QDRANT_API_KEY` | Qdrant auth | 4, 5 |
| `CLOUDFLARE_WORKER_URL` | Gmail push webhook receiver | 1 |
| `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | Gmail push signature validation | 1 |
| `TRANSCRIPT_CLASSIFIER_MODEL` | Classifier LLM model name | 2 |
| `TRANSCRIPT_CLASSIFIER_API_KEY` | Classifier API key | 2 |

---

## Deferred to Phase 3

- Multi-agent orchestration (coordinator → parallel workers)
- Team collaboration / multi-user auth
- HubSpot + Calendar OAuth
- Slack integration
- Remote bridge / enterprise isolation
- Agent marketplace
- Skills normalization of agents/connections JSON → proper wire tables
