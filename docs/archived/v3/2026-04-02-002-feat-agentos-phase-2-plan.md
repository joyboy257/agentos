# Plan: Phase 2 — Differentiate

**Date:** 2026-04-02
**Type:** feat
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v4 — Phase 2 Differentiate (Days 90–180)

---

## Goal

Build the competitive moat that Anthropic cannot replicate. Phase 1 proved Maria can hire an agent. Phase 2 proves AgentOS agents are worth paying for because they get smarter, faster, and more autonomous over time.

> **Success condition:** 80%+ of tool calls are auto-approved. Maria's agents have been working for 3 months without constant attention. NPS > 40.

---

## What We Are Shipping

| # | Feature | Competitive Moat | PRD v4 Line |
|---|---------|-----------------|-------------|
| 1 | Permission auto-approval | Domain-specific classifier Anthropic won't build | Phase 2 |
| 2 | Long-term memory | Always-on learning; competitors start fresh | Phase 2 |
| 3 | PROACTIVE mode | 2-minute latency; event-driven, not polling | Phase 2 |
| 4 | Template gallery | Vertical expertise; not generic | Phase 2 |
| 5 | Skills directory | Templates upgradeable without re-hire | Phase 2 |
| 6 | Auto-pause on budget | Trust feature; agent doesn't overspend | Phase 2 |
| 7 | Governance board | Safety for business owners | Phase 2 |

**Not in Phase 2:** Multi-agent (Phase 3), HubSpot/Calendar (Phase 3), team collaboration (Phase 3), marketplace (Phase 3).

---

## Prerequisites

Phase 2 ships on top of Phase 1. The following Phase 1 systems must be stable before Phase 2 work begins:

1. Agent runs complete with `escalated` exit reason
2. `escalations` table records all escalations with resolution
3. `permission_classifier_history` table exists (new in Phase 2 Unit 2)
4. Agents wake on BullMQ heartbeat schedule
5. Gmail OAuth is stable

---

## Phase 2 Sequencing

### Months 1–2 (Days 90–120): Intelligence Layer

**The agent gets smarter. Maria teaches it once; it knows forever.**

| Unit | Name | Depends |
|------|------|---------|
| 2-1 | Permission auto-approval (TRANSCRIPT_CLASSIFIER) | Phase 1 |
| 2-2 | Long-term memory (mem0.ai + Qdrant) | Phase 1 |
| 2-3 | Permission classifier UI (per-agent settings) | 2-1 |

### Months 2–3 (Days 120–150): Always-On

**The agent works when work arrives — not on a timer.**

| Unit | Name | Depends |
|------|------|---------|
| 2-4 | PROACTIVE webhook receiver | 2-1, 2-2 |
| 2-5 | Auto-pause on budget | Phase 1 |
| 2-6 | Governance board | 2-1 |

### Months 3 (Days 150–180): Surface

**Maria can hire in 30 seconds from a gallery. Templates are upgradeable.**

| Unit | Name | Depends |
|------|------|---------|
| 2-7 | Template gallery (8 vertical templates) | 2-1, 2-3 |
| 2-8 | Skills directory (skills/<name>/SKILL.md) | 2-7 |

---

## Unit 2-1: Permission Auto-Approval

**Goal:** The agent handles 80%+ of tool calls autonomously. Maria only sees the 20% that genuinely need her.

**The insight from Claude Code:** Anthropic's TRANSCRIPT_CLASSIFIER uses LLM embeddings to classify whether a tool call is "routine" for a given user. We replicate this with a domain-specific twist: our classifier trains on *email patterns, approval history, and CRM context* — not code. Maria's agent learns from every approval she gives.

**Architecture:**

```
Tool call requested
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  TRANSCRIPT_CLASSIFIER                                  │
│  ─────────────────────────────────────────────────────  │
│  Input: {                                               │
│    tool_name: "gmail_send",                            │
│    user_id: "maria-uuid",                              │
│    context: {                                            │
│      recipient: "lead@hitech.com",                      │
│      subject: "Re: Enterprise Pricing",                 │
│      history: ["maria approved lead@hitech.com 3x"],   │
│      time_of_day: "10:32am",                           │
│      day_of_week: "Tuesday"                             │
│    }                                                     │
│  }                                                       │
│                                                          │
│  Output: {                                               │
│    tier: 1 | 2 | 3,                                     │
│    confidence: 0.0-1.0,                                 │
│    reasoning: "..."                                     │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
    │
    ▼
Tier 1 (confidence ≥ 0.90): Auto-execute. No notification.
Tier 2 (confidence 0.70–0.90): Execute + notify after.
Tier 3 (confidence < 0.70): Pause. Show escalation modal.
```

**Database schema additions:**

```sql
-- Classifier history: every tool call logged for learning
CREATE TABLE permission_classifier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  tool_name TEXT NOT NULL,
  input_hash TEXT NOT NULL,     -- SHA-256 of tool input (for deduplication)
  output_hash TEXT,             -- SHA-256 of tool output
  tier_used INTEGER,            -- 1, 2, or 3
  confidence_score REAL,        -- 0.0-1.0
  resolution TEXT,               -- approved|denied|auto_approved|auto_denied
  embedding_id TEXT,             -- mem0 vector ID for this call
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_classifier_user ON permission_classifier_history(user_id, created_at DESC);

-- User permission centroids: per-user "routine" patterns
CREATE TABLE user_permission_centroids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  pattern_type TEXT NOT NULL,   -- 'recipient_domain' | 'subject_keyword' | 'time_bucket'
  centroid_vector_id TEXT,       -- mem0 vector ID for this centroid
  examples_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tool_name, pattern_type)
);

-- Custom rules: Maria's explicit "always auto-approve" rules
CREATE TABLE user_custom_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  rule_pattern JSONB NOT NULL, -- {type: 'recipient_domain', value: 'gmail.com'}
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Combined: custom_rules + centroids → active ruleset for classifier
```

**Classifier training pipeline:**

1. **Maria approves a tool call** (Tier 3 → Tier 1)
   → Log to `permission_classifier_history` with `resolution: approved`
   → Upsert centroid for `pattern_type` in `user_permission_centroids`

2. **Maria denies a tool call** (Tier 3)
   → Log with `resolution: denied`
   → Downweight matching centroid

3. **Maria clicks "Always auto-approve this"** (custom rule)
   → Insert into `user_custom_rules`
   → Next call matching this rule → Tier 1 automatically

**Tier decision logic:**

```typescript
async function classifyToolCall(
  toolName: string,
  userId: string,
  toolInput: object
): Promise<{ tier: 1 | 2 | 3; confidence: number; reasoning: string }> {
  // 1. Check custom rules first (fastest path)
  const customRule = await findMatchingCustomRule(userId, toolName, toolInput);
  if (customRule) {
    return { tier: 1, confidence: 1.0, reasoning: "Custom rule matched" };
  }

  // 2. Compute embedding via mem0
  const embedding = await mem0.computeEmbedding({
    input: JSON.stringify({ toolName, ...toolInput }),
    userId
  });

  // 3. Retrieve user's centroid vectors for this tool
  const centroids = await getCentroids(userId, toolName);

  // 4. Cosine similarity between tool call embedding and centroids
  if (centroids.length === 0) {
    // Cold start: no history → use conservative defaults
    return { tier: 3, confidence: 0.0, reasoning: "No history for this user+tool" };
  }

  const similarities = centroids.map(c => cosineSimilarity(embedding, c.vector));
  const bestSimilarity = Math.max(...similarities);

  // 5. Confidence threshold
  if (bestSimilarity >= 0.90) return { tier: 1, confidence: bestSimilarity, reasoning: "..." };
  if (bestSimilarity >= 0.70) return { tier: 2, confidence: bestSimilarity, reasoning: "..." };
  return { tier: 3, confidence: bestSimilarity, reasoning: "..." };
}
```

**Integration point:** `DurableRunner` calls `classifyToolCall()` before every tool execution. Based on tier:
- Tier 1: execute immediately, log as `auto_approved`
- Tier 2: execute + send post-hoc notification, log as `auto_approved_notify`
- Tier 3: pause, emit `escalate` step, wait for Maria's decision

**Files:**
- `app/lib/agent/permission-classifier.ts`
- `app/lib/agent/classifier/train.ts`
- `app/lib/agent/classifier/classify.ts`
- `app/lib/agent/classifier/centroids.ts`
- `app/lib/agent/classifier/custom-rules.ts`
- `app/lib/db/migrations/002_permission_classifier.sql`
- `app/app/api/classifier/classify/route.ts` (debug endpoint)
- `app/app/api/classifier/feedback/route.ts` (post-approval feedback)

**Verification:** 80%+ of tool calls on a 30-day-old agent are Tier 1. False positive rate (Tier 3 called when it shouldn't be) < 5%.

---

## Unit 2-2: Long-Term Memory

**Goal:** The agent remembers what happened last week. What Maria approved before. What she prefers.

**Architecture:** mem0.ai (extraction) + Qdrant (vector storage) + Postgres (structured facts).

```
Agent run completes
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  mem0.ai Memory Extraction                          │
│  ─────────────────────────────────────────────────  │
│  Input: Full reasoning transcript + tool results   │
│  Output: Structured memories                        │
│                                                   │
│  Example:                                          │
│  - "Maria approved emails to @acme.com 3 times"   │
│  - "Best time to send emails: Tuesday 10am"       │
│  - "Escalated @budgetkeyword in subject"          │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Qdrant Vector Store                               │
│  ─────────────────────────────────────────────────  │
│  Store: embedding + raw memory text                 │
│  Index: by user_id + memory_type                  │
│                                                   │
│  Collection: agent_memories                       │
│  Vector dim: 1536 (OpenAI text-embedding-3)       │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Postgres Structured Facts                          │
│  ─────────────────────────────────────────────────  │
│  user_facts table:                                  │
│  { user_id, fact_type, fact_value, confidence,     │
│    last_recalled_at, recall_count }               │
└─────────────────────────────────────────────────────┘
    │
    ▼
On next run start:
  → Recall relevant memories from Qdrant (semantic search)
  → Inject as context into agent prompt
  → Maria's agent "knows" what happened before
```

**Memories to extract:**

| Memory Type | What it captures | Example |
|---|---|---|
| `approval_pattern` | What Maria approves | "approves emails to existing customers" |
| `escalation_trigger` | What causes escalation | "escalates emails mentioning budget > $10K" |
| `preference` | Maria's working style | "prefers short emails before noon" |
| `relationship` | Known contacts | "lead@hitech.com is a hot prospect" |
| `schedule` | When agent should be active | "checks email every 30 minutes on weekdays" |

**Memory recall API:**

```typescript
// Before each agent run
const memories = await mem0.recall({
  userId: "maria-uuid",
  agentId: "email-agent-uuid",
  query: `Current situation: ${currentEmailSubject}. What does Maria prefer?`,
  limit: 5
});
// memories injected into agent system prompt
```

**Files:**
- `app/lib/memory/mem0-client.ts`
- `app/lib/memory/extract.ts`
- `app/lib/memory/recall.ts`
- `app/lib/memory/qdrant-client.ts`
- `app/lib/db/migrations/003_long_term_memory.sql`
- `app/app/api/memory/recall/route.ts`
- `app/app/api/memory/inject/route.ts`

**External dependencies:**
- mem0.ai SDK (`mem0ai` npm package)
- Qdrant Cloud (vector DB — free tier sufficient for MVP)
- OpenAI embeddings (text-embedding-3-small, 1536 dim)

**Verification:** Agent recalls a specific approval pattern from 2 weeks ago when relevant context appears.

---

## Unit 2-3: Permission Classifier UI

**Goal:** Maria can see what her agent has auto-approved, adjust confidence thresholds, and add custom rules.

**Files:**
- `app/app/(app)/settings/permission/page.tsx`
- `app/app/components/settings/PermissionSettings.tsx`
- `app/app/components/settings/CustomRuleBuilder.tsx`
- `app/app/components/settings/ApprovalHistory.tsx`
- `app/app/api/classifier/history/route.ts`
- `app/app/api/classifier/rules/route.ts`

**UI sections:**

1. **Auto-approval rate card:**
   ```
   ┌─────────────────────────────────────────────────┐
   │  This month: 87% auto-approved                  │
   │  [████████████████████░░░░] 87%                  │
   │  142 tool calls · 124 auto-approved             │
   └─────────────────────────────────────────────────┘
   ```

2. **Approval history (last 30 days):**
   Table: Date, Tool, Action, Was Approved?
   Filterable by tool, agent, resolution type

3. **Custom rules ("Always auto-approve"):**
   ```
   Recipient domain: @acme.com  [+ Add Rule]
   Subject contains: "order confirmation"  [+ Add Rule]
   Time: Tuesday 10am-11am  [+ Add Rule]
   ```

4. **Confidence threshold slider:**
   "Auto-approve when confidence is at least: [85%]"
   Range: 70%–100%. Default: 85%.

**Verification:** Custom rule immediately changes next matching call to Tier 1. Threshold slider takes effect within 1 run.

---

## Unit 2-4: PROACTIVE Webhook Receiver

**Goal:** Agent responds to emails in under 2 minutes — not on the next heartbeat schedule.

**Current state (Phase 1):** Agent wakes every N minutes, checks inbox, acts if urgent found. 2-minute polling is expensive; 15-minute polling has 15-minute latency.

**Phase 2 state:** Gmail pushes a notification to us the moment a new email arrives. Agent wakes immediately.

```
New email lands in Maria's Gmail
    │
    ▼
Gmail Push Notification (Gmail Pub/Sub)
    │
    ▼
Cloudflare Worker (webhook receiver)
    │
    ▼
BullMQ: Enqueue "email_wake" job { user_id, email_id }
    │
    ▼
Agent wakes NOW — not on schedule
    │
    ▼
Agent reads email, decides: handle or escalate
    │
    ▼
Result logged. Agent sleeps until next event or scheduled heartbeat.
```

**Latency target:** < 2 minutes from email arrival to agent action. (vs. 15-minute polling = 900s)

**Implementation:**

```
Gmail Pub/Sub setup:
  Topic: projects/agentos/topics/gmail-notifications
  Push endpoint: https://agentos.workers.dev/webhook/gmail
```

**Cloudflare Worker:**
- `app/workers/gmail-webhook.ts`
- Verifies Pub/Sub JWT
- Enqueues BullMQ job
- Returns 200 immediately (idempotent — Gmail retries on non-200)
- Rate limit: 1 wake per email per user per 30 seconds

**Integration with PROACTIVE agents only:** This feature is opt-in. Scheduled agents keep polling. PROACTIVE agents get the webhook.

**Files:**
- `app/workers/gmail-webhook.ts` (Cloudflare Worker)
- `app/lib/queue/proactive-handler.ts`
- `app/app/api/webhooks/gmail/route.ts` (backup HTTP webhook if Worker not used)
- `app/lib/agents/proactive-scheduler.ts`

**Verification:** New email → webhook received → BullMQ job enqueued → agent wakes → acts. < 2 min end-to-end for 90% of emails.

---

## Unit 2-5: Auto-Pause on Budget

**Goal:** Agent pauses when budget is exceeded. Maria resumes when ready.

**Files:**
- `app/app/api/billing/usage/route.ts`
- `app/app/api/billing/pause/route.ts`
- `app/lib/billing/budget-checker.ts`
- `app/app/components/billing/BudgetBar.tsx`
- `app/app/components/billing/BudgetAlertModal.tsx`

**Budget tracking:**
- `billing_usage` table: per-user, per-month tool call counts + costs
- Budget thresholds per plan: Starter $99 = $X usage, Professional $249 = $Y usage
- Check budget before every tool call (in DurableRunner)
- Hard limit: agent stops at 100% budget. Soft warning at 80%.

**Budget bar (in Agent Card):**
```
┌──────────────────────────────────────────────────┐
│  [████████░░░░░░░░░░░░░] 40% · $40 of $99 used  │
│  Resets in 12 days                               │
└──────────────────────────────────────────────────┘
```

**Pause modal (at 80%):**
```
┌──────────────────────────────────────────────────┐
│  ⚠️  Budget alert                               │
│                                                  │
│  You've used 80% of your $99 Starter plan.      │
│  12 tool calls remaining this month.             │
│                                                  │
│  Upgrade to Professional ($249) for 3 agents   │
│  and higher limits.                             │
│                                                  │
│  [Upgrade Now]  [Pause Agent]  [Ignore]         │
└──────────────────────────────────────────────────┘
```

**Pause (at 100%):**
```
┌──────────────────────────────────────────────────┐
│  ⏸  Agent paused                               │
│                                                  │
│  Budget exceeded. AgentOS paused Email Agent    │
│  to prevent overage charges.                     │
│                                                  │
│  [Resume in 12 days]  [Upgrade Plan]           │
└──────────────────────────────────────────────────┘
```

**Verification:** Agent auto-pauses at 100% budget. No tool calls execute. Maria receives notification. Resume re-activates agent.

---

## Unit 2-6: Governance Board

**Goal:** Structural changes (new tools, new agents) require explicit Maria approval before the agent touches them.

**Files:**
- `app/app/(app)/governance/page.tsx`
- `app/app/components/governance/GovernanceQueue.tsx`
- `app/app/components/governance/PendingChange.tsx`
- `app/app/api/governance/pending/route.ts`
- `app/app/api/governance/approve/route.ts`
- `app/app/api/governance/reject/route.ts`

**What requires governance approval (Tier 2):**

| Change | Approval needed? |
|---|---|
| Agent requests a new tool (e.g., wants to access Calendar) | Yes |
| Agent proposes a new escalation rule | Yes |
| Agent wants to change its own schedule | Yes |
| Agent wants to create a sub-agent | Yes (Phase 3) |

**Tier 2 vs Tier 1 escalation:**
- Tier 1: Routine action approval (e.g., "can this email be sent?")
- Tier 2: Structural change approval (e.g., "can I get access to your calendar?")

**Maria's governance board:**
```
┌──────────────────────────────────────────────────┐
│  Agent Governance                          [⚙]  │
│  ───────────────────────────────────────────     │
│                                                  │
│  Active agents: 2 running · 1 governance issue │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │ 📧 Email Agent                         │     │
│  │ Wants: Calendar access                  │     │
│  │ Reason: "To schedule follow-ups"       │     │
│  │ [Allow & Continue] [Deny] [Edit Request]│     │
│  └────────────────────────────────────────┘     │
│                                                  │
│  Past approvals (last 30 days): 4 allowed      │
└──────────────────────────────────────────────────┘
```

**Verification:** Agent requesting a new tool is blocked until Maria approves. Blocked tool calls emit a `governance_pending` step.

---

## Unit 2-7: Template Gallery

**Goal:** Maria can hire a pre-built agent in 30 seconds. 8 vertical templates.

**Templates:**

| Template | Description | Persona |
|---|---|---|
| HVAC Email Agent | Handles service contracts, emergency dispatch, lead triage | "You are a HVAC contractor's assistant..." |
| Legal Intake Agent | Screens intake calls, captures client info, routes to attorney | "You are a legal intake specialist..." |
| Real Estate Lead Agent | Monitors listings, researches comparables, drafts follow-up | "You are a real estate lead researcher..." |
| CRM Update Agent | Pulls email threads, updates HubSpot CRM records | "You are a CRM data specialist..." |
| Calendar Manager | Schedules meetings, sends invites, handles conflicts | "You are a professional executive assistant..." |
| Competitor Monitor | Tracks competitor websites, alerts on changes | "You are a competitive intelligence agent..." |
| Invoice Follow-Up | Tracks unpaid invoices, sends polite reminders | "You are a accounts receivable specialist..." |
| Onboarding Agent | Welcomes new customers, answers FAQ, gathers info | "You are a customer onboarding specialist..." |

**Gallery UI:**
```
/gallery
┌─────────────────────────────────────────────────────┐
│  Hire an Agent in 30 Seconds                    [🔍] │
│  ───────────────────────────────────────────────────│
│                                                     │
│  [HVAC]  [Legal]  [Real Estate]  [CRM]            │
│  [Calendar] [Competitor] [Finance] [Onboarding]  │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ 🏠 HVAC    │  │ ⚖️ Legal   │  │ 🏡 Real Est │ │
│  │ Email Agent │  │ Intake Agent │  │ Lead Agent  │ │
│  │ $99/mo     │  │ $199/mo    │  │ $149/mo    │ │
│  │ [Preview]  │  │ [Preview]  │  │ [Preview]  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Template = NL description + pre-configured AgentConfig + persona system prompt + tool list + escalation rules.**

**When Maria clicks "Preview":**
→ Shows the same AgentPreview component used in NL-to-agent flow
→ Fully editable before activation

**Files:**
- `app/app/(app)/gallery/page.tsx`
- `app/data/templates/index.ts` — template registry
- `app/data/templates/hvac-email-agent.ts`
- `app/data/templates/legal-intake-agent.ts`
- ... (one file per template)
- `app/app/components/gallery/TemplateCard.tsx`
- `app/app/components/gallery/TemplateGallery.tsx`

**Verification:** Template preview loads < 1s. Template activation works. Each template creates a functional agent.

---

## Unit 2-8: Skills Directory

**Goal:** Templates are upgradeable. When we improve a template, existing agents can adopt the update without being re-hired.

**Structure:**
```
skills/
  <name>/
    SKILL.md          # Agent config + persona + tool definitions
    VERSION           # Semantic version
    CHANGELOG.md      # What changed in each version
    EXAMPLES/         # Sample inputs for this skill
```

**SKILL.md schema:**
```yaml
---
name: hvac-email-agent
version: 1.2.0
display_name: HVAC Email Agent
description: Handles inbound service emails for HVAC companies
created_by: AgentOS
updated_at: 2026-04-15

config:
  intent_type: EMAIL_HANDLING
  tools:
    - gmail_read
    - gmail_send
    - gmail_search
  escalation_rules:
    keywords:
      - "emergency"
      - "refund"
      - "cancellation"
      - "manager"
      - "boss"
    confidence_threshold: 0.85
  schedule:
    type: proactive  # or "scheduled" with cron
  memory_enabled: true

persona: |
  You are a professional HVAC service dispatcher...

upgrade_from: 1.1.0  # Which version this upgrades from
```

**Upgrade flow:**
1. Maria has "HVAC Email Agent v1.1.0" hired
2. We publish "HVAC Email Agent v1.2.0"
3. Maria sees: "Update available: Better emergency triage logic"
4. Maria clicks "Apply Update"
5. Agent's config is updated to v1.2.0. Agent keeps memory, history, and approval patterns.
6. Agent name, hired date, and stats are preserved.

**Files:**
- `app/data/skills/<name>/SKILL.md`
- `app/data/skills/<name>/VERSION`
- `app/data/skills/<name>/CHANGELOG.md`
- `app/lib/skills/loader.ts`
- `app/lib/skills/upgrader.ts`
- `app/app/api/skills/[skillId]/upgrade/route.ts`

**Verification:** Skill upgrade preserves agent memory and approval history. Failing to upgrade does not break the agent.

---

## Open Questions (Deferred to Phase 2 Planning)

| Question | Why Deferred | How Resolved |
|---|---|---|
| mem0.ai vs self-hosted embedding model? | Cost/privacy tradeoff | mem0.ai cloud (free tier) for MVP; self-hosted if enterprise demand |
| Qdrant Cloud vs Pinecone? | Qdrant has better M1 Mac support for dev | Qdrant Cloud free tier for MVP |
| TRANSCRIPT_CLASSIFIER model size? | 107M params vs 7B params tradeoff | Start with fine-tuned 107M; upgrade if accuracy insufficient |
| Template pricing separate from plan pricing? | Revenue model question | Templates included in plan price; premium templates (legal) = add-on |
| PROACTIVE webhook reliability? | Cloudflare Worker uptime SLA | Worker has 99.9% uptime; BullMQ handles retries |

---

## Phase 2 Success Metrics

| Metric | Target |
|---|---|
| Auto-approval rate | ≥ 80% of tool calls |
| Agent recall accuracy | ≥ 70% on "what did Maria approve last week?" |
| PROACTIVE latency | < 2 min from email to agent action (P90) |
| Template gallery adoption | ≥ 50% of new agents use a template |
| Skill upgrade completion | ≥ 80% of Maria's with available updates |
| NPS (Phase 2 testers) | ≥ 40 |
