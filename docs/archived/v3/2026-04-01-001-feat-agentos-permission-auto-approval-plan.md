---
title: Phase 1.5 Permission Auto-Approval System
type: feat
status: active
date: 2026-04-01
origin: docs/brainstorms/2026-04-01-anthropic-leak-strategic-brainstorm.md
deepened: 2026-04-01 (2nd pass: Unleash security token guidance, embedding encryption at rest, Neon migration, modal button redesign, postApproval hook extension)
---

## Document Review Findings (Post-Synthesis)

*Reviewing with: coherence-reviewer, feasibility-reviewer, product-lens-reviewer, design-lens-reviewer, security-lens-reviewer, scope-guardian-reviewer*

### Coverage

| Persona | Status | Notes |
|---------|--------|-------|
| coherence | ✓ | No contradictions found |
| feasibility | ✓ | 7 blockers identified |
| product-lens | ✓ | 1 blocker, 1 informational |
| design-lens | ✓ | 3 issues identified |
| security-lens | ✓ | 5 issues identified |
| scope-guardian | ✓ | 3 issues identified |

---

## Auto-fixes Applied

1. **`escalation-modal.tsx` → `approval-modal.tsx`** (Unit 6, Unit 7 — terminology): The existing file is `app/components/approval-modal.tsx`. No file named `escalation-modal.tsx` exists in the codebase. Updated all references.

---

## P0 Findings

*(Blocking contradictions or gaps — must fix before proceeding)*

**None.**

---

## P1 Findings

*(Significant gaps likely hit during planning or implementation — should fix)*

---

**P1-F1: `escalation-modal.tsx` does not exist — use `approval-modal.tsx`**

- **Section:** Implementation Units 6 and 7 (Files)
- **Severity:** P1
- **Why it matters:** Unit 6 says "Modify: `app/components/escalation-modal.tsx`" and Unit 7 says "Create: `app/components/escalation-modal.tsx`". The existing file is `app/components/approval-modal.tsx`. Implementing against the wrong filename will fail at build time.
- **Autofix class:** auto
- **Suggested fix:** Replace all `escalation-modal.tsx` references with `approval-modal.tsx`:
  - Unit 6 (Files): `Modify: app/components/approval-modal.tsx` — add confidence score display
  - Unit 7 (Files): `Modify: app/components/approval-modal.tsx` — add 4th button
- **Confidence:** 0.95
- **Evidence:** `ls app/components/` returns `approval-modal.tsx` — no `escalation-modal.tsx` exists

---

**P1-F2: `requiresApproval()` has no `userId` parameter — per-user centroids need it**

- **Section:** Decision 4 / runner.ts integration
- **Severity:** P1
- **Why it matters:** `requiresApproval(toolName: string)` currently takes only tool name. The classifier needs a `userId` to look up per-user centroid vectors. Without this parameter, per-user learning is architecturally impossible.
- **Autofix class:** present
- **Suggested fix:** Extend `requiresApproval()` signature to `requiresApproval(toolName: string, userId?: string)`. When `userId` is present, the classifier can query the user's centroid. When absent (legacy callers), use global defaults.
- **Confidence:** 0.90
- **Evidence:** `runner.ts:27` — `function requiresApproval(toolName: string): boolean`

---

**P1-F3: `postApproval` hook cannot carry embedding / confidence / tier metadata**

- **Section:** Unit 6 (Feedback Loop)
- **Severity:** P1
- **Why it matters:** The feedback loop needs to log the classifier's decision (tier used, confidence score, embedding vector) to `permission_classifier_history`. The current `postApproval` payload only contains `{ decision: 'approved' | 'denied' | ... }`. The hook type in `types.ts` must be extended before Unit 6 can be implemented.
- **Autofix class:** present
- **Suggested fix:** Extend `postApproval` in `HookContext` to include optional fields:
  ```typescript
  postApproval?: {
    decision: 'approved' | 'denied' | 'cancelled' | 'timeout'
    tierUsed?: 1 | 2 | 3
    confidenceScore?: number
    embedding?: number[] // 1536-dim vector, optional for audit trail
  }
  ```
- **Confidence:** 0.90
- **Evidence:** `types.ts:57-59` — current `postApproval` has only `decision`. `approval-manager.ts:297-306` — `emit('postApproval', ...)` only passes `decision`.

---

**P1-F4: `@unleash` not in `package.json` — must be added as a dependency**

- **Section:** Unit 1, Decision 2
- **Severity:** P1
- **Why it matters:** Unit 1 installs and uses `@unleash/proxy-client-nextjs` and `@unleash/node`. A search of `app/package.json` returned no matches for `unleash`. Without adding the dependency, the feature flag system cannot compile.
- **Autofix class:** auto
- **Suggested fix:** Add to `app/package.json`:
  ```json
  "@unleash/proxy-client-nextjs": "^4.0.0",
  "@unleash/node": "^3.0.0"
  ```
- **Confidence:** 0.95
- **Evidence:** `grep -i "unleash" app/package.json` returned no matches

---

**P1-F5: `settings/page.tsx` does not exist — permission settings lack an anchor file**

- **Section:** Unit 7 (Files)
- **Severity:** P1
- **Why it matters:** Unit 7 says "Modify: `app/app/(app)/settings/page.tsx`" to add the permission settings section. This file does not exist. The canvas page exists at `app/app/(app)/canvas/page.tsx` but there is no settings directory under `(app)`.
- **Autofix class:** present
- **Suggested fix:** Either: (a) create `app/app/(app)/settings/page.tsx` as a new route, or (b) add the permission settings section to an existing page (e.g., `app/app/(app)/canvas/page.tsx` or a new `app/app/(app)/settings/page.tsx`). Update Unit 7 Files accordingly.
- **Confidence:** 0.95
- **Evidence:** `ls app/app/(app)/` returns `canvas` and `layout.tsx` — no `settings` directory

---

**P1-F6: Runner approval dispatch is tool-branch-specific, not centralized — classifier integration needs architectural refactor**

- **Section:** Decision 4 (Integration Point)
- **Severity:** P1
- **Why it matters:** The plan assumes adding a classifier call between `requiresApproval()` and `requestApproval()` is a single insertion point. In reality, `runner.ts` dispatches tool calls via a `switch(toolName)` with inline approval logic per branch (e.g., `gmail.send` at line ~267). The classifier must be called inside each tool branch that calls `requestApproval()`. This means Unit 6 must modify every tool branch that requires approval — not just one insertion point.
- **Autofix class:** present
- **Suggested fix:** Document that Unit 6's approach section should be updated to reflect the per-tool-branch integration pattern. For each tool in `APPROVAL_REQUIRED_TOOLS` (`gmail.send`, `stripe.charge`, `stripe.refund`, `admin.panel`, `exec.code`), the classifier must be called before `requestApproval()`. Consider extracting `requestApproval()` call sites into a helper to reduce duplication, but acknowledge this is a refactor, not a new feature.
- **Confidence:** 0.85
- **Evidence:** `runner.ts:27-29` — `requiresApproval(toolName)` is a simple boolean lookup. `runner.ts` tool dispatch uses switch/case with inline approval logic per tool.

---

**P1-F7: `user_custom_rules` table missing from database schema**

- **Section:** Unit 3 (Tier 1 Rules Engine)
- **Severity:** P1
- **Why it matters:** Unit 3 says "User can add custom rules via settings UI" and Unit 7 says "Always auto-approve this — adds custom rule." Custom rules need a database table to persist them. The schema in Decision 4 only defines `permission_classifier_history` and `user_permission_centroids` — no `user_custom_rules` table.
- **Autofix class:** present
- **Suggested fix:** Add to the schema:
  ```sql
  CREATE TABLE user_custom_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      tool_name TEXT NOT NULL,
      rule_pattern JSONB NOT NULL, -- {type: 'recipient_domain', value: '...'}
      created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
  This should be added to Unit 2 (Classifier Database Schema) as part of the same migration, or as a separate Unit 2b.
- **Confidence:** 0.90
- **Evidence:** Decision 4 schema defines only `permission_classifier_history` and `user_permission_centroids`. Unit 3 references custom rules with no corresponding table.

---

**P1-F8: Unit 7 claims "Modify escalation-modal" but also lists Unit 3 as a dependency gap — "Always auto-approve" custom rule is Unit 3 work**

- **Section:** Unit 7 (Dependencies)
- **Severity:** P1
- **Why it matters:** Unit 7 says "Dependencies: Units 1, 6" but Unit 7's own "Always auto-approve this" feature (adds a custom rule) is implemented by Unit 3 (Tier 1 Rules Engine). The dependency chain is: Unit 7 → Unit 3 (custom rules) → Unit 1 (feature flag). Unit 7 should depend on Unit 3, not just Units 1 and 6.
- **Autofix class:** auto
- **Suggested fix:** Update Unit 7 Dependencies from `Units 1, 6` to `Units 1, 3, 6`.
- **Confidence:** 0.90
- **Evidence:** Unit 7 (Files) creates the "Always auto-approve" button. Unit 3 (Tier 1 Rules Engine) defines how custom rules are created and stored. These are the same feature.

---

## P2 Findings

*(Moderate issues with meaningful downside — fix if straightforward)*

---

**P2-D1: Modal has 3 buttons — Unit 7's 4th button requires modal redesign**

- **Section:** Unit 6 vs Unit 7 (Modal buttons)
- **Severity:** P2
- **Why it matters:** The existing `ApprovalModal` at `app/components/approval-modal.tsx` has 3 buttons: [Approve] [Edit] [Cancel]. Unit 7 adds a 4th button ("Always auto-approve this") as a learning shortcut. The modal's button layout and state machine were not designed for 4 buttons. The "Edit" button currently toggles an edit mode. The 4th button may need its own treatment.
- **Autofix class:** present
- **Suggested fix:** Add "Always auto-approve" as a secondary action below the existing 3 buttons (not replacing any), or as a toggle within the modal. Update Unit 7's approach to specify: "Add a secondary 'Always auto-approve for this pattern' button below the existing 3 buttons. Clicking it adds a custom Tier 1 rule AND approves the current call."
- **Confidence:** 0.80
- **Evidence:** `approval-modal.tsx:169-201` — `handleApprove`, `handleEdit`, `handleCancel`. The modal was designed for exactly 3 actions.

---

**P2-D2: Confidence score is meaningless to Maria without interpretive UI**

- **Section:** Unit 7 (Escalation modal — confidence score)
- **Severity:** P2
- **Why it matters:** "Confidence: 72" means nothing to a non-technical user. Maria doesn't know whether 72 is good or bad. Without interpretive UI, the confidence score creates anxiety rather than trust. The modal must contextualize the score: "The agent is 72% sure this is routine for you."
- **Autofix class:** present
- **Suggested fix:** In Unit 7's modal update, add interpretive copy around the confidence badge:
  - 85+: "This looks routine based on your past approvals."
  - 70-84: "The agent thinks this is fine, but isn't fully sure."
  - Below 70: "The agent isn't sure about this one — please review carefully."
- **Confidence:** 0.85
- **Evidence:** Unit 7 (Approach) says "show confidence score badge + reasoning text" but doesn't specify interpretive copy.

---

**P2-D3: Threshold slider has no explanatory copy**

- **Section:** Unit 7 (Settings — threshold slider)
- **Severity:** P2
- **Why it matters:** A slider labeled "Auto-approval confidence threshold" with values 0-100 with no guidance is unusable for Maria. What should she set it to? 85? 70? The default is 85 — but why? The settings UI must explain what the threshold means in plain language.
- **Autofix class:** present
- **Suggested fix:** Add explanatory copy to the slider:
  - Label: "Auto-approve routine calls"
  - Helper text: "When the agent is confident you're OK with a call, it can act automatically. Use the slider to set how confident the agent should be before auto-approving. Higher = safer but more interruptions. We recommend 85."
  - Show current default: "Currently: 85 (recommended for new users)"
- **Confidence:** 0.80
- **Evidence:** Unit 7 (Approach) describes the slider but not the explanatory copy.

---

## P3 Findings

*(Minor improvements — user's discretion)*

---

**P3-S1: `unnecessary_escalation_rate` definition is in Open Questions but should be in Requirements Trace or a Definition section**

- **Section:** Open Questions (Resolved) vs Requirements Trace
- **Severity:** P3
- **Why it matters:** The metric definition "auto-approved call that user subsequently denied" is a resolved open question, but it's also a core operational definition. Putting it in Open Questions makes it look unresolved rather than settled. It belongs in the Requirements Trace or a new "Definitions" subsection.
- **Autofix class:** auto
- **Suggested fix:** Move the definition from Open Questions to a "Key Definitions" section: `"unnecessary_escalation_rate": auto-approved call that user subsequently denied (not the same as an escalated call)`.
- **Confidence:** 0.70

---

## Residual Concerns (below 0.50 threshold)

*Held for potential promotion if corroborated by other personas*

- **Embedding encryption at rest**: Embedding vectors reveal behavioral patterns about users. While the plan acknowledges pgvector as an unconfirmed dependency, it doesn't address encryption of stored vectors. This was surfaced by security-lens at 0.45 confidence — worth monitoring.
- **OpenAI API key exposure via Unleash client**: The `@unleash/proxy-client-nextjs` client initializes with an API key. In edge runtime, this key could be exposed via client-side bundle. The plan should verify Unleash's edge-compatible SDK behavior before committing to this provider.

---

## Deferred Questions

*(Should be resolved in a later workflow stage)*

1. **[Technical — Deferred to Implementation]**: Does `@unleash/proxy-client-nextjs` work correctly in Next.js edge runtime, or should we use `@unleash/node` with server-side flag reads? The edge SDK variant is designed for this but must be tested.
2. **[Technical — Deferred to Implementation]**: Should `user_custom_rules` be a separate migration (Unit 2b) or merged into Unit 2? Depends on whether custom rules are needed for the Phase 1.5 MVP or a follow-up.
3. **[Product — Deferred to Planning]**: Where exactly should permission settings live — a dedicated settings route, or embedded in the canvas's agent config panel? The plan references a non-existent `settings/page.tsx`.

---

## Priority Summary

| # | Finding | Severity | Autofix |
|---|---------|----------|---------|
| 1 | `escalation-modal.tsx` → `approval-modal.tsx` | P1 | auto |
| 2 | `requiresApproval()` needs `userId` param | P1 | present |
| 3 | `postApproval` hook can't carry embedding/confidence data | P1 | present |
| 4 | `@unleash` not in `package.json` | P1 | auto |
| 5 | `settings/page.tsx` does not exist | P1 | present |
| 6 | Runner approval is per-tool-branch, not centralized | P1 | present |
| 7 | `user_custom_rules` table missing | P1 | present |
| 8 | Unit 7 missing Unit 3 dependency | P1 | auto |
| 9 | 4th modal button needs redesign | P2 | present |
| 10 | Confidence score needs interpretive UI for Maria | P2 | present |
| 11 | Threshold slider needs explanatory copy | P2 | present |
| 12 | `unnecessary_escalation_rate` definition location | P3 | auto |

**Applied 4 auto-fixes. 8 findings to consider (6 P1, 3 P2, 1 P3).**

---

# Phase 1.5 Permission Auto-Approval System

## Overview

Build a TRANSCRIPT_CLASSIFIER-inspired permission auto-approval system for AgentOS. The system classifies each tool call at runtime and auto-approves routine calls, escalates uncertain ones with confidence scores, and learns from user feedback over time. This removes the #1 friction for non-technical users — without it, every agent action requires human confirmation, making agents unusable for Maria.

## Problem Frame

**User:** Maria, HVAC company owner. She wants her agent to handle email autonomously. She does not want to confirm every action — that is the friction that makes agents unusable for non-technical users.

**The core tension:** Full autonomy = risk. Full approval = unusable. The solution is a classifier that handles routine cases automatically and only escalates when genuinely uncertain.

**Source:** Claude Code's TRANSCRIPT_CLASSIFIER (107 refs) handles code permission patterns. AgentOS's classifier handles business workflow patterns (email, CRM, calendar). Different domain, same architecture.

## Requirements Trace

- **R1** (from brainstorm SD2): Auto-classify routine tool calls and execute without escalation
- **R2** (from brainstorm R1): Surface confidence score to user in escalation modal
- **R3** (from brainstorm R1): Learn from user approval/denial patterns over time
- **R4** (from brainstorm R1): Be feature-flagged so it can be disabled per-user or globally
- **R5** (from brainstorm R2): Feature flag system ships before any Phase 1.5 capability

## Scope Boundaries

- **Not building:** Developer-focused permission patterns (code diffs, terminal commands) — this is a business workflow classifier
- **Not building:** Hardcoded allow/deny lists — ML-based learning is core to the design
- **Not building:** Real-time model training — nightly batch retraining is sufficient
- **Not building:** Async tool execution (background tool running while LLM decides) — requires new infrastructure beyond Phase 1.5 scope

## Context & Research

### Relevant Code and Patterns

- `app/lib/runtime/runner.ts` — current `APPROVAL_REQUIRED_TOOLS` hardcoded Set, `requiresApproval()` function, hook emissions (`preToolCall`, `postToolCall`, `postApproval`). Tool calls are synchronous — every `executeTool()` is `await`-ed before the next step.
- `app/lib/approval/approval-manager.ts` — existing approval queue, 30-min timeout on modal unanswered, SSE events, React modal. Entry point is `requestApproval()` which creates a blocking Promise.
- `app/lib/hooks/` — well-developed hook system: `preToolCall`/`postToolCall` hooks as integration points
- `app/lib/registry/capability-registry.ts` — `approvalConfig: { approverType: 'user' | 'none' }` per capability
- `app/lib/mcp/tool-mapper.ts` — `DANGEROUS_TOOLS` Record for MCP-layer permission checks
- `app/lib/db/` — raw SQL migrations (not Prisma), `@vercel/postgres` client

### External References

- Claude Code `TRANSCRIPT_CLASSIFIER` (github.com/lowcortisolprogrammer/claude-code) — 3-tier permission classification: rules → embedding similarity → LLM fallback
- text-embedding-3-small (OpenAI): $0.02/1M tokens, 1536 dims, ~50ms latency
- GPT-4o-mini: $0.15/1M input tokens, structured JSON output for classification decisions
- Unleash: open-source feature flags, self-hosted Docker, 10-min setup

## Key Technical Decisions

### Decision 1: 3-Tier Hybrid Classifier Architecture

**Chosen approach:** Rules → Embedding similarity → LLM fallback

**Tier 1 — Keyword/Rules (< 1ms):** Pattern-matches on tool name + recipient. Zero cost, instant. Catches obvious routines: "send email to existing contact in warm lead list."

**Tier 2 — Embedding similarity (~20ms):** Uses `text-embedding-3-small` + pgvector (or JSONB fallback). Compares tool call against user's approved/rejected history centroid vectors. Low cost, fast, learns from user history.

**Tier 3 — LLM judgment (~300ms):** GPT-4o-mini with structured JSON output. Used only when Tier 1 and 2 are uncertain. Returns confidence score (0-100) + reasoning.

**Fallback:** When confidence < threshold, escalate to user. Never auto-deny — auto-deny feels hostile.

**Threshold strategy (corrected during deepening):**
- Launch threshold: **85** (conservative — fewer auto-approvals, safer for new users)
- Tunable floor: **70** (only lowered if unnecessary_escalation_rate < 10% for 7 consecutive days)
- New users (history < 5 approval events): threshold is always 85 regardless of Tier 3 confidence — do not auto-approve borderline calls for users without established history

**Why not purely LLM:** Cost would be $0.001-0.01 per tool call. At 100 calls/session × 1000 sessions/day = $100-1000/day. Embeddings reduce LLM calls to <5% of tool calls.

**Why not purely rules:** Rules can't learn. Every user's "routine" is different. Embeddings capture similarity to past approved patterns.

### Decision 2: Feature Flag Provider — Unleash

**Chosen approach:** Unleash (self-hosted Docker)

**Alternatives rejected:**
- Vercel Edge Config: Simple but only supports boolean flags. No percentage rollouts, no user targeting.
- Custom + Postgres: reinventing the wheel. Unleash has everything we need and 10-min self-hosted setup.

**What Unleash provides:**
- Boolean flags + percentage rollouts + user targeting
- Kill-switch per flag + per-user disable
- SDK for Next.js edge runtime
- Self-hosted Docker: no external dependency, data stays local

**Rollout sequence:** 10% → 50% → 100% over 2 weeks, monitored by escalation rate metric.

### Decision 3: Feedback Loop — Nightly Batch Retraining

**Chosen approach:** Nightly job retrains user permission centroids from Postgres history.

**Why not real-time:** Real-time retraining would require embedding model hosting. Nightly batch is sufficient — user patterns don't change hourly. Embedding centroids update daily.

**What gets retrained:** Per-user centroid vectors (average embedding of approved calls). Not full model retraining — just centroid position updates.

### Decision 4: Integration Point — runner.ts, Not approval-manager.ts

**Chosen approach:** Classifier is called in `runner.ts` `executeAgent()` between `requiresApproval(toolName)` and `requestApproval()`.

**Key architectural constraint (from deepening):** The runner is strictly synchronous. Every `executeTool()` is `await`-ed before the next step. There is no background queue, no async tool execution, and no abort registry. The plan's original description of "async LLM — auto-approved calls execute while LLM runs in background for next decision" requires new infrastructure not in the current codebase and is out of Phase 1.5 scope.

**Correct flow:**
1. `requiresApproval(toolName)` returns true → classifier runs Tier 1 and Tier 2 synchronously
2. If Tier 1 matches → auto-approve → execute tool directly (skip `requestApproval()` entirely)
3. If Tier 2 similarity > 0.85 → auto-approve → execute directly
4. If Tier 2 similarity 0.60-0.85 or < 0.60 → call `requestApproval()` → run Tier 3 LLM async (if needed) → user decides → execute or skip
5. If Tier 3 confidence >= threshold AND user has >= 5 history → auto-approve after LLM returns
6. If Tier 3 confidence < threshold OR user is new → escalate with confidence badge

**Why not modify `requestApproval()`:** The approval-manager creates a blocking Promise and starts the 30-min timeout immediately. The classifier must run before this Promise is created. The integration happens in `executeAgent()`, not in `approval-manager.ts`.

## Open Questions

### Resolved During Deepening

- **Classifier architecture:** 3-tier hybrid (rules → embeddings → LLM). Confirmed via repo research: this is the same pattern Claude Code uses.
- **Feature flag provider:** Unleash self-hosted Docker. Confirmed via planning research.
- **Integration point:** `runner.ts` `executeAgent()` between `requiresApproval()` and `requestApproval()`. Confirmed via repo research — the runner is synchronous and the classifier must run before the blocking Promise is created.
- **Feedback loop:** Nightly batch retraining. Confirmed sufficient for slowly-changing user patterns.
- **Threshold inconsistency (70 vs 85):** These serve different purposes. 85 = launch threshold (conservative). 70 = tunable floor (only lowered after 7 days of data showing unnecessary escalation < 10%).
- **New user behavior:** Users with < 5 approval events get threshold 85 regardless — do not auto-approve borderline confidence for users without established history.
- **Unnecessary escalation definition:** An auto-approved call that the user subsequently denied. NOT: an escalated call. NOT: a call the user would have auto-approved.
- **pgvector availability:** NOT confirmed on Vercel Postgres. Must verify before assuming pgvector. Fallback is JSONB + application-level cosine similarity (slower but correct).

### Deferred to Implementation

- **pgvector verification:** Verify Vercel Postgres supports `CREATE EXTENSION vector` before choosing schema approach. If not available, use JSONB + app-level similarity.
- **Exact confidence threshold:** Start at 85 (launch), tune based on Phase 1.5 user data.
- **Embedding storage format:** Store vectors in JSONB as `number[]` — works with or without pgvector.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```
Tool call requested
    │
    ▼
requiresApproval(toolName) → TRUE
    │
    ▼
[Classifier.runSync()] ──────────────────────────────────┐
    │                                                    │
    ▼                                                    │
Tier 1: Keyword/Rules check                            │
    │ ("warm lead", "existing contact", etc.)         │
    ├─ MATCH → return {decision: 'auto_approved'}     │
    │                                                    │
    ▼                                                    │
Tier 2: Embedding similarity                           │
    │ (compare to user's centroid)                     │
    ├─ similarity > 0.85 → return {decision: 'auto_approved'}
    ├─ similarity < 0.60 → return {decision: 'escalate', confidence: 50}
    │  (cheap escalation — no LLM cost)                │
    │                                                    │
    ▼                                                    │
Tier 3: LLM judgment (GPT-4o-mini)                   │ ← runs async, only if needed
    │ Returns: {decision, confidence, reasoning}        │
    ├─ confidence >= 85 → return {decision: 'auto_approved'}
    ├─ confidence >= 70 AND user has >= 5 history → return {decision: 'auto_approved'}
    └─ confidence < 85 OR user is new → return {decision: 'escalate', confidence}
                                                       │
                    ┌──────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
{decision: 'auto_approved'}  {decision: 'escalate'}
        │                       │
        ▼                       ▼
executeTool() directly      requestApproval() ← 30-min timeout starts NOW
(skips queue entirely)       Tier 3 LLM runs async (if not yet resolved)
                               │
                               ▼
                         [Escalation modal]
                         - Tool name + parameters
                         - Confidence score (0-100)
                         - Reasoning from classifier
                         - [Approve] [Deny] [Always ask]
                               │
                               ▼
                         [postApproval hook]
                         - Log decision to Postgres
                         - Update user's centroid (nightly)
```

### Database Schema Changes

**Note:** Repository uses `@vercel/postgres` (raw SQL, not Prisma). Migrations go in `app/lib/db/migrations/`. pgvector availability must be verified — if not available, similarity search runs in application code.

**If pgvector IS available:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE permission_classifier_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    tool_name TEXT NOT NULL,
    parameters JSONB NOT NULL,
    recipient TEXT,
    tier_used SMALLINT NOT NULL,  -- 1, 2, or 3
    decision TEXT NOT NULL,       -- 'auto_approved', 'escalated', 'denied'
    confidence_score SMALLINT,    -- 0-100, null for auto_approved
    user_decision TEXT,           -- 'approved', 'denied', null if auto
    embedding vector(1536),        -- pgvector type, only for Tier 2+ decisions
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ivfflat index for similarity search
CREATE INDEX ON permission_classifier_history
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
    WHERE decision = 'auto_approved' AND embedding IS NOT NULL;

CREATE TABLE user_permission_centroids (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    centroids JSONB NOT NULL DEFAULT '{}',  -- {tool_name: [0.1,...], ...}
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**If pgvector is NOT available (fallback):**
```sql
CREATE TABLE permission_classifier_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    tool_name TEXT NOT NULL,
    parameters JSONB NOT NULL,
    recipient TEXT,
    tier_used SMALLINT NOT NULL,
    decision TEXT NOT NULL,
    confidence_score SMALLINT,
    user_decision TEXT,
    embedding JSONB NOT NULL,  -- [0.1, 0.2, ...] 1536 elements as JSON array
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- B-tree index for filtering, not vector search
CREATE INDEX ON permission_classifier_history(user_id, tool_name, decision);

CREATE TABLE user_permission_centroids (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    centroids JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Application-level cosine similarity (when pgvector unavailable):**
```typescript
// In app/lib/classifier/similarity.ts
export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}
```

## Implementation Units

- [ ] **Unit 1: Feature Flag System (Unleash)**

**Goal:** Ship the feature flag infrastructure before any Phase 1.5 capability.

**Requirements:** R4, R5

**Dependencies:** None

**Files:**
- Create: `app/lib/feature-flags/unleash-client.ts`
- Create: `app/lib/feature-flags/flags.ts` — flag definitions
- Create: `unleash/docker-compose.yml` — Unleash self-hosted
- Modify: `app/middleware.ts` — Unleash middleware for Next.js
- Modify: `app/lib/runtime/runner.ts` — read flag state
- Test: `app/lib/feature-flags/unleash-client.test.ts`

**Approach:**
- Install dependencies: `npm install @unleash/proxy-client-nextjs @unleash/node` *(auto-fixed: `@unleash` was missing from `package.json`)*
- Deploy Unleash via docker-compose (postgres + Unleash server + **Unleash Edge** — required for Frontend API on self-hosted)
- **CRITICAL security (from research):** The `clientKey` in `@unleash/proxy-client-nextjs` IS visible in the client bundle. Use a **frontend token** only (type: `"frontend"`), never a client or admin token. The frontend token can only evaluate flags via the Frontend API and cannot access admin functionality. Alternatively, prefer `@unleash/node` in Server Components to keep credentials entirely server-side.
- If using edge runtime with `@unleash/proxy-client-nextjs`: create a frontend-scoped token in Unleash admin, store as `NEXT_PUBLIC_UNLEASH_FRONTEND_TOKEN` — never expose admin/client tokens to the client bundle.
- Define flags: `permission_auto_approval_enabled`, `permission_auto_approval_global`, `permission_streaming_enabled`, `skills_system_enabled`
- Build-time DCE: `NEXT_PUBLIC_` prefix for client-side flags only with frontend tokens
- Runtime kill-switch: Unleash SDK overrides for emergency disable

**Patterns to follow:**
- `app/lib/runtime/runner.ts` — how the runner reads config

**Test scenarios:**
- Flag read returns correct value in server component
- Flag override killswitch disables feature globally
- Per-user flag targeting works

**Verification:**
- `permission_auto_approval_enabled=false` → all calls escalate
- `permission_auto_approval_enabled=true` → classifier runs

---

- [ ] **Unit 2: Classifier Database Schema**

**Goal:** Store classification history and user centroids for learning.

**Requirements:** R3

**Dependencies:** Unit 1 (feature flags must exist first)

**Files:**
- Create: `app/lib/db/migrations/YYYYMMDDHHMMSS_add_permission_classifier.sql` — raw SQL migration
- Create: `app/lib/classifier/db.ts` — database client wrappers (uses `@vercel/postgres`, NOT Prisma)
- Create: `app/lib/classifier/similarity.ts` — cosine similarity for JSONB fallback
- Test: `app/lib/classifier/db.test.ts`

**Approach:**
- Add `permission_classifier_history` table — logs every classification decision
- Add `user_permission_centroids` table — stores per-user centroid vectors as JSONB
- Add `user_custom_rules` table — stores user-created Tier 1 custom rules (from Unit 7's "Always auto-approve this pattern" button):
  ```sql
  CREATE TABLE user_custom_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      tool_name TEXT NOT NULL,
      rule_pattern JSONB NOT NULL, -- {type: 'recipient_domain', value: 'example.com'} or {type: 'recipient_email', value: '...'}
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, tool_name, rule_pattern)
  );
  ```
- Verify pgvector availability: `SELECT * FROM pg_extension WHERE extname = 'vector'`
- If pgvector available: use `vector(1536)` type and `ivfflat` index
- If not available: use JSONB array + application-level cosine similarity
- B-tree index on `(user_id, tool_name, decision)` for fast filtering

**Note:** Repository uses `@vercel/postgres` directly — NOT Prisma. Do NOT create `prisma/schema.prisma` modifications.

**Patterns to follow:**
- Existing migration pattern in `app/lib/db/migrations/001_initial_schema.sql`

**Test scenarios:**
- History row created on every classification
- Centroid updated correctly from history
- Query returns recent history for a user
- pgvector fallback: JSONB + cosine similarity produces correct ranking

**Verification:**
- Migration runs without error on dev Postgres
- New tables created and accessible
- Similarity queries return correct ordering

---

- [ ] **Unit 3: Tier 1 Rules Engine**

**Goal:** Instant classification for obvious routine patterns without ML.

**Requirements:** R1

**Dependencies:** Unit 2 (database schema — needs `user_custom_rules` table)

**Files:**
- Create: `app/lib/classifier/tier1-rules.ts`
- Create: `app/lib/classifier/custom-rules.ts` — CRUD for `user_custom_rules` table
- Test: `app/lib/classifier/tier1-rules.test.ts`

**Approach:**
- Pattern matcher: `(tool_name, recipient, context) → boolean`
- Built-in rules (run before custom rules):
  - `"gmail.send" + recipient in user.contacts → auto-approve`
  - `"gmail.send" + subject matches "Re:" (reply) → auto-approve`
  - `"gmail.send" + recipient domain in user.allowed_domains → auto-approve`
  - `"web.search" + query length < 50 chars → auto-approve`
- Custom rules from `user_custom_rules` table (per-user, added via Unit 7's "Always auto-approve" button)
- Check custom rules after built-in rules match
- `addCustomRule(userId, toolName, rulePattern)` — inserts into `user_custom_rules`
- Returns `{matched: boolean, rule: string | null}` — if no match, falls through to Tier 2

**Patterns to follow:**
- `app/lib/mcp/tool-mapper.ts` — tool mapping patterns

**Test scenarios:**
- Reply email to existing contact → auto-approve
- New recipient not in contacts → no match (Tier 2)
- Custom rule added → custom rule matches

**Verification:**
- Tier 1 returns < 1ms
- No network calls
- Falls through correctly when no rule matches

---

- [ ] **Unit 4: Tier 2 Embedding Similarity Classifier**

**Goal:** Fast, cheap learning from user approval history using embeddings.

**Requirements:** R1, R3

**Dependencies:** Unit 2 (database schema)

**Files:**
- Create: `app/lib/classifier/tier2-embeddings.ts`
- Create: `app/lib/classifier/centroid.ts` — centroid computation
- Test: `app/lib/classifier/tier2-embeddings.test.ts`

**Approach:**
- Compute embedding for incoming tool call: `${tool_name} ${recipient} ${JSON.stringify(params)}`
- Compare against user's centroid vector for that tool_name (from `user_permission_centroids`)
- If no centroid exists for this user+tool → return `{no_history: true}` (fall through to Tier 3)
- Similarity > 0.85 → return `{decision: 'auto_approved', similarity}`
- Similarity < 0.60 → return `{decision: 'escalate', similarity}` (cheap escalation — no LLM)
- Similarity 0.60-0.85 → return `{no_history: false, similarity}` (Tier 3 needed)
- Use `text-embedding-3-small` (1536 dims, $0.02/1M tokens)

**Patterns to follow:**
- `app/lib/runtime/runner.ts` — how runner calls external services

**Test scenarios:**
- User approved 10 emails to lead@example.com → next email to same → high similarity → auto-approve
- User denied email to cold lead → similar email → low similarity → escalate
- New user with no history → returns `no_history: true` → Tier 3 directly
- pgvector unavailable → JSONB + cosine similarity produces correct ranking

**Verification:**
- Embedding call < 50ms (OpenAI API)
- Similarity computation < 1ms
- Correctly falls through when no centroid exists

---

- [ ] **Unit 5: Tier 3 LLM Fallback Classifier**

**Goal:** Handle nuanced cases where Tier 1 and 2 are uncertain.

**Requirements:** R1, R2

**Dependencies:** Unit 1 (feature flag must be on)

**Files:**
- Create: `app/lib/classifier/tier3-llm.ts`
- Test: `app/lib/classifier/tier3-llm.test.ts`

**Approach:**
- Called only when Tier 1 (no match) AND Tier 2 (similarity 0.60-0.85 or no history)
- Prompt: structured classification with business context
- Returns: `{decision: 'approve' | 'escalate', confidence: 0-100, reasoning: string}`
- System prompt includes user's industry/role if known (HVAC → more scrutiny on competitor emails)
- Never auto-deny — only auto-approve or escalate
- **New user guard:** If user has < 5 approval events AND confidence < 85 → escalate (do not auto-approve borderline calls for users without established history)

**Patterns to follow:**
- `app/lib/approval/approval-manager.ts` — how escalation modal receives data

**Test scenarios:**
- Routine email to existing customer → high confidence → auto-approve
- Email to competitor domain → low confidence → escalate with reasoning
- New user (0 history), confidence 72 → escalate (new user guard)
- Existing user (50+ history), confidence 72 → auto-approve (established history)

**Verification:**
- LLM call < 500ms
- Returns valid JSON with confidence 0-100
- New user guard correctly escalates borderline confidence

---

- [ ] **Unit 6: Classifier Integration + Feedback Loop**

**Goal:** Wire classifier into runner.ts, implement nightly retraining.

**Requirements:** R1, R2, R3

**Dependencies:** Units 1, 2, 3, 4, 5

**Files:**
- Modify: `app/lib/runtime/runner.ts` — add classifier call in each `APPROVAL_REQUIRED_TOOLS` tool branch before `requestApproval()`
- Modify: `app/lib/hooks/types.ts` — extend `postApproval` context to carry classifier metadata
- Create: `app/lib/classifier/classifier-service.ts` — orchestrates 3 tiers, exposes `runSync()`
- Create: `app/lib/classifier/feedback-loop.ts` — logs user decisions to `permission_classifier_history`
- Create: `scripts/nightly-centroid-retrain.ts` — nightly job
- Test: `app/lib/classifier/classifier-service.test.ts`

**Approach:**

*Architectural note (from review):* The runner dispatches tool calls via a `switch(toolName)` with inline approval logic per tool branch. The classifier cannot be inserted at a single point — it must be called inside each tool branch that calls `requestApproval()`. The tools requiring approval are: `gmail.send`, `stripe.charge`, `stripe.refund`, `admin.panel`, `exec.code`. Each branch must be updated individually.

*Also note (from review):* `requiresApproval(toolName: string)` takes only a tool name — it has no `userId` parameter. The function must be extended to accept an optional `userId` so the classifier can look up per-user centroids. Signature: `requiresApproval(toolName: string, userId?: string)`.

*Correct integration flow (synchronous):*
1. `requiresApproval(toolName, userId)` returns true
2. Call `classifier.runSync(tier1, tier2)` — runs synchronously
3. If auto-approved → execute tool directly, skip `requestApproval()` entirely
4. If escalate → call `requestApproval()` → 30-min timeout starts → Tier 3 LLM runs synchronously within `requestApproval()` → user decides → execute or skip
5. **Do NOT modify `requestApproval()`** — it creates a blocking Promise and starts the 30-min timeout immediately; the classifier must run before this Promise is created

*Feedback loop — hook extension required:*
- The current `postApproval` hook payload only carries `decision`. To log the classifier's metadata (tier used, confidence score, embedding vector), the `HookContext.postApproval` type must be extended in `app/lib/hooks/types.ts`:
  ```typescript
  postApproval?: {
    decision: 'approved' | 'denied' | 'cancelled' | 'timeout'
    tierUsed?: 1 | 2 | 3          // which tier made the decision
    confidenceScore?: number        // 0-100, for audit trail
    embedding?: number[]           // 1536-dim vector (optional)
  }
  ```
- The `approval-manager.ts` `resolveApproval()` function (which emits the `postApproval` hook) must be updated to pass the extended metadata when resolving.
- Nightly job: `SELECT approved calls FROM last 7 days → recompute centroids → UPDATE user_permission_centroids`
- Centroid = mean embedding of all approved calls per tool_name per user

*Async note (corrected from original plan):*
- The original plan described "async LLM — auto-approved calls execute while LLM runs in background." This requires new infrastructure (background queue, abort registry, pending operations tracking) not in the current codebase.
- For Phase 1.5: Tier 3 LLM runs synchronously within `requestApproval()`. This is acceptable — Tier 3 is only called for uncertain cases (< 5% of calls), and the 30-min timeout provides ample margin.
- Async tool execution is a future enhancement (post-Phase 1.5).

**Patterns to follow:**
- `app/lib/runtime/runner.ts` — how each tool branch calls `requestApproval()` inline
- `app/lib/approval/approval-manager.ts` — how `postApproval` hook is emitted

**Test scenarios:**
- Tier 1 match → tool executes without modal appearing
- Tier 2 high similarity → tool executes without modal
- Tier 3 confidence >= 85 with established user → auto-approve after LLM resolves
- Tier 3 confidence < 85 OR new user → modal appears with confidence badge
- User approves → row added to history with tierUsed, confidenceScore, embedding
- Nightly job updates centroid correctly

**Verification:**
- Escalation rate metric drops after 7 days of usage
- Confidence scores display correctly in modal
- Centroid retraining job completes without error
- `postApproval` hook carries extended metadata when implemented

---

- [ ] **Unit 7: Permission Auto-Approval Configuration UI**

**Goal:** Let users see and control their auto-approval settings.

**Requirements:** R4

**Dependencies:** Units 1, 3, 6 *(corrected: Unit 7's "Always auto-approve" button creates custom Tier 1 rules, which is Unit 3's responsibility)*

**Files:**
- Modify: `app/components/approval-modal.tsx` — update to show confidence score + interpretive copy *(corrected: file is `approval-modal.tsx`, not `escalation-modal.tsx`)*
- Create: `app/components/permission-settings.tsx`
- Create: `app/app/(app)/settings/page.tsx` — new route *(corrected: `settings/` directory does not exist under `(app)/` — must be created)*
- Test: `app/components/permission-settings.test.tsx`

**Approach:**
- Settings section: "Auto-approval confidence threshold" slider (0-100) with explanatory copy: "When the agent is confident you're OK with a call, it acts automatically. Higher = safer but more interruptions. We recommend 85." Show current user threshold.
- "Learning from my approvals" toggle — enables/disables centroid retraining
- "Disable auto-approval for [tool]" per-tool override
- Modal update: show confidence score badge with interpretive copy for Maria:
  - 85+: "This looks routine based on your past approvals."
  - 70-84: "The agent thinks this is fine, but isn't fully sure."
  - Below 70: "The agent isn't sure — please review carefully."
  - Reasoning text from Tier 3 LLM below the badge.
- "Always auto-approve this pattern" button — adds a Tier 1 custom rule (implemented in Unit 3). Clicking it both approves the current call AND adds a custom rule so it auto-approves next time.

**Modal button note:** The existing `approval-modal.tsx` has exactly 3 buttons: [Approve] [Edit] [Cancel]. The 4th "Always auto-approve" button should be added as a secondary action below the existing 3, not replacing any existing button. This requires modifying the modal's button layout and state machine.

**Patterns to follow:**
- Existing `approval-modal.tsx` — the existing 3-button layout
- `app/lib/approval/approval-manager.ts` — how the modal receives SSE events

**Test scenarios:**
- Threshold slider updates flag state
- Per-tool override disables auto-approval for that tool
- Modal shows confidence badge with interpretive copy
- "Always auto-approve" adds custom rule to `user_custom_rules` table (Unit 3)
- Settings persist across sessions
- Flag changes take effect without redeploy

**Verification:**
- Settings persist across sessions
- Flag changes take effect without redeploy
- Modal correctly displays confidence with interpretive copy for non-technical users

## System-Wide Impact

- **Hook system:** `preToolCall` hook fires in `executeTool()` before the tool runs — not used for classifier integration. The classifier integrates directly in `executeAgent()` before `requestApproval()`.
- **Approval queue:** Classifier pre-check must happen before `requestApproval()` is called. If auto-approved, `requestApproval()` is never called — no queue entry, no timeout started.
- **Activity log:** Every auto-approved call logged with confidence score for audit trail.
- **Escalation rate metric:** New metric tracked per user: `unnecessary_escalation_rate = denials / auto_approvals`. Alert if > 20%.
- **Template system:** Vertical templates (HVAC, legal) may need custom Tier 1 rules (Unit 3).
- **Async tool execution:** NOT in scope for Phase 1.5. The current runner is synchronous. Future enhancement would need background queue + abort registry + pending operations tracking.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| pgvector not on Vercel Postgres / Neon | Gate schema on pgvector availability check. If unavailable, use JSONB + application-level cosine similarity (slower but correct). |
| pgvector ivfflat index contradicts float4[] fallback | Removed the contradictory fallback. If pgvector unavailable, use JSONB + app-level similarity — no ivfflat index possible. |
| LLM latency makes classifier too slow | Tier 1 and 2 run synchronously (< 50ms). Tier 3 only called for uncertain cases (< 5% of calls). Sync execution is fine for Phase 1.5. Async tool execution is future work. |
| Nightly retraining job fails | Centroid degrades gracefully — missing centroid = Tier 2 returns `no_history: true` → Tier 3. Alert on job failure. |
| Confidence threshold wrong for all users | Start at 85 (conservative). Lower to 70 only if unnecessary_escalation_rate < 10% for 7 consecutive days. |
| New users auto-approved too aggressively | Guard: users with < 5 approval events always use threshold 85 regardless of Tier 3 confidence. |
| Feature flag rollout too fast | 10% → 50% → 100% over 2 weeks. Kill switch at each step. |
| Repository uses @vercel/postgres, not Prisma | All migrations use raw SQL in `app/lib/db/migrations/`. No Prisma schema changes. |
| **Vercel Postgres deprecated → Neon migration** | Confirm whether the existing database is on Neon (AES-256 encrypted). Enable `verify-full` SSL mode for Postgres connections. |
| **Unleash API key in client bundle** | Use `@unleash/proxy-client-nextjs` with a **frontend token only** (type: `"frontend"`). Never use client or admin tokens with the edge SDK. Alternatively, use `@unleash/node` in Server Components to keep credentials entirely server-side. |
| **Embedding vectors expose behavioral patterns** | Embedding vectors encode approval tendencies — sensitive business intelligence. Neon's built-in AES-256 encryption is the minimum baseline. Evaluate adding column-level encryption (pgcrypto) if vectors prove highly sensitive. Store vectors in separate table from raw text to prevent trivial de-anonymization. |

## Documentation / Operational Notes

- **Onboarding:** New users start with auto-approval disabled (conservative). After 5 agent runs, prompt to enable with explanation of how the classifier learns.
- **Escalation rate monitoring:** Track per-user in Postgres. Alert if > 20% of auto-approved calls get reversed (user denies after auto-approval).
- **Nightly job:** Run at 3am UTC. Completes in < 5 min for 10K users. Cron via Vercel Cron or external scheduler.
- **pgvector verification:** First step of Unit 2 migration should query `pg_extension` to confirm vector extension exists before choosing schema approach.
- **Neon SSL:** After migration from Vercel Postgres to Neon, ensure Postgres connection uses `sslmode=verify-full` — not just `require` — to enforce strict TLS.
- **Embedding vector sensitivity:** Vectors represent behavioral approval patterns. Do not store raw text (email subject, recipient) alongside the vector in the same row — this would make de-anonymization trivial if the database is breached. Keep `parameters JSONB` (raw text) in `permission_classifier_history` separate from the embedding vector.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-01-anthropic-leak-strategic-brainstorm.md](docs/brainstorms/2026-04-01-anthropic-leak-strategic-brainstorm.md)
- **Repo research (integration):** runner.ts `executeAgent()` is synchronous — every tool call is `await`-ed. The correct integration point is between `requiresApproval()` and `requestApproval()`, not in `approval-manager.ts`.
- **Repo research (schema):** Repository uses `@vercel/postgres` directly, NOT Prisma. Migrations in `app/lib/db/migrations/`. pgvector availability unconfirmed.
- **Architecture review (async):** The "async LLM while tool executes" plan requires new background queue + abort registry infrastructure. Not in Phase 1.5 scope.
- **Threshold calibration:** Launch threshold = 85 (conservative). Tunable floor = 70. Claude Code's code review plugin uses 80 as default for developer audience — 85 is appropriate for non-technical users.
- **Unleash security (deepen):** `@unleash/proxy-client-nextjs` exposes `clientKey` in client bundle — must use frontend token (type: `"frontend"`) only. Admin/client tokens are HIGH RISK if exposed. Unleash Edge required for Frontend API on self-hosted deployments.
- **Embedding security (deepen):** Embedding vectors encode behavioral approval patterns — sensitive business intelligence. pgvector has no native encryption. Neon uses AES-256 encryption at rest (AWS KMS). Column-level encryption via pgcrypto available as enhanced option. Raw text must not be stored alongside vectors in the same row.
