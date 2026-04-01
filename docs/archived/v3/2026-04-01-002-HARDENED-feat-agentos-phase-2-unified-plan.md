# HARDENING REVIEW: AgentOS Phase 2 Unified Plan

**Reviewer:** Deep Hardening Pass
**Date:** 2026-04-01
**Plan reviewed:** `2026-04-01-002-feat-agentos-phase-2-unified-plan.md`
**Dependencies reviewed:** Plan 003 (Working Memory), Plan 004 (LT Memory), Plan 001 (A2A), PRD.md

---

## Executive Summary

The Phase 2 plan is structurally sound and has the right architectural instincts. However, this hardening pass surfaces **11 critical gaps**, **8 high-priority gaps**, and **27 medium-priority gaps** that need to be addressed before this plan is production-ready. The most urgent gaps are:

1. **Governance board security model is internally inconsistent** — it says server-side verification but the implementation units don't implement it
2. **Webhook scaling has a plan but no plan for who implements it** — Unit 5 says "Vercel Edge + Cloudflare Workers + Pub/Sub" but this infrastructure is nowhere in the implementation units
3. **BullMQ reliability story is absent** — what happens when the scheduler itself fails
4. **Memory unbounded growth** — no TTL, no eviction policy, no storage sizing
5. **Notification fatigue controls are acknowledged but not implemented**

---

## Category 1: Security & Trust (Critical)

### H-1: Governance Board — Server-Side Verification Not Implemented

**Risk:** Critical. The plan explicitly calls out (Risks table, row 12) that "Governance events must be signed server payloads — agent submits change request; server independently verifies against current state before applying." But Unit 8 (Governance Board) implementation units do not include any server-side verification logic. The agent self-reports its own structural change request. A compromised or misbehaving agent could submit fraudulent governance requests.

**Current Unit 8 files listed:**
- `app/governance/page.tsx`
- `components/governance-card.tsx`
- `lib/governance/governance-api.ts`
- `lib/governance/governance-store.ts`

None of these implement independent verification. The governance-api.ts only receives and stores agent requests.

**Hardening requirement:**
- Add `lib/governance/change-verifier.ts` — server-side independent verification that compares requested change against current stored agent state
- Governance API must fetch current agent config from Postgres and verify the change delta independently (not trust agent's self-reported delta)
- Agent submits: `{ agentId, requestedChange: { type: 'TOOLS_CHANGED', added: ['gmail.label'] } }`
- Verifier fetches current agent config from DB, confirms `gmail.label` is NOT currently in tools, confirms user has valid OAuth for gmail.label, then creates pending governance event
- Governance approval must be a **server-side state transition**, not an agent-driven payload
- Add `governance_events` table: `id, user_id, agent_id, requested_change_json, server_verified_state_json, status, created_at, resolved_at, resolver_id`

**Status:** Not addressed in current plan.

---

### H-2: OAuth Token Storage Without Encryption At Rest

**Risk:** Critical (noted in plan as Low/Critical due to likelihood/reputational impact). The plan says tokens are "stored in Postgres (same as Gmail tokens)" and the mitigation references "AWS KMS or Vercel Vault." But neither the implementation units for Calendar OAuth (Unit 6) nor any infrastructure spec specifies:
- Which encryption mechanism (AES-256-GCM is mentioned but not specified)
- Who holds the key (which service/account)
- Key rotation policy
- How decryption happens on read (token refresh vs. on-demand decryption)

**Hardening requirement:**
- Before Unit 6 ships, document encryption design: `docs/security/oauth-token-encryption.md`
- Define: token_at_rest column type (encrypted blob, not varchar)
- Define: key management (Vercel Vault is preferred — document this as the chosen path)
- Never log token values — add `StructuredLog` wrapper that redacts known token patterns
- Add `token_refresh_count` and `token_last_refreshed_at` to audit table for token lifecycle visibility

**Status:** Acknowledged in Risks table, not specified in implementation.

---

### H-3: Webhook Signature Verification Silent Failure

**The plan shows this code in Unit 5:**

```typescript
if (!token || !verifyGmailJwtToken(token, event.userEmail)) {
  console.error('Gmail webhook: invalid or missing JWT token')
  return // reject silently — 401 triggers retry spam
}
```

**Problem 1:** The comment says "reject silently" but the function returns `void`. If this webhook is called by a malicious actor, the 200 response (default) tells them the endpoint exists and accepts requests, enabling reconnaissance.

**Problem 2:** The plan doesn't specify the Gmail Pub/Sub JWT token verification flow. Gmail push notifications use a `X-Goog-Channel-Token` header which is an **opaque string** — not a JWT. The code shows `verifyGmailJwtToken` but Gmail Pub/Sub doesn't use JWT tokens. The token is the `pushEndpoint` you registered. Real Gmail push verification requires **resolving the `pushEndpoint`** via `POST https://gmail.googleapis.com/gmail/v1/users/{userId}/watch`.

**Hardening requirement:**
- Change return type to `Promise<{ status: 200 | 401 | 400 }>` and return `401` with a generic error message, not just console.error
- Actually implement Gmail push verification: the channel token returned when registering a Pub/Sub push subscription is not a JWT — it's an opaque token stored at registration time. Verification is "did this notification come from the right channel?" by checking the channel ID in headers.
- Add HMAC verification for GitHub (already correct in plan)
- Add timestamp validation: webhooks must include a `X-Goog-Message-Id` and you should verify you haven't seen it before (replay protection via Redis SET NX with TTL)

**Status:** Partially addressed, incorrect in details.

---

### H-4: No PII Handling in Memory Pipeline

**Risk:** High. The memory microservice (Plan 004) stores conversation messages in Qdrant vectors and Postgres facts. The plan has no PII redaction, no consent tracking, and no right-to-erasure (forget endpoint exists per Plan 004 but is not tested or integrated into the agent lifecycle).

**Hardening requirements:**
- All messages before `remember()` must pass through a PII redaction layer (should exist in Phase 1 — verify before Unit 1)
- `forget()` must also call Qdrant delete by user_id filter — verify Qdrant supports per-user deletion efficiently
- Add memory retention metadata: `last_consent_at`, `jurisdiction` (GDPR applies if EU users)
- Consent withdrawal = immediate `forget()` call + no new remember until re-consent

**Status:** Only mentioned as out-of-scope in Plan 004. Must be addressed before Phase 2 ships.

---

## Category 2: Concurrency & Race Conditions (Critical)

### H-5: BullMQ Scheduler + Agent State Race

**Risk:** High. The plan states: "BullMQ scheduler checks agent state before firing — skips if paused." But there is no mutex between "scheduler decides to fire" and "agent finishes previous run." If an agent takes longer than expected:

```
T=0: BullMQ fires heartbeat for agent
T=0: Agent starts run, state=running
T=5min: Run exceeds budget, BudgetEnforcer pauses agent, state=paused
T=5min: BullMQ (scheduled tick for T=5min) fires — sees state=paused, skips ✓
```

This works. But consider:

```
T=0: BullMQ fires heartbeat for agent
T=0: Agent starts run, state=running
T=5min: Run completes normally, state=idle
T=5min + 1sec: BullMQ fires next tick immediately (if interval=5min) — but what if next tick was already queued at T=0?
```

BullMQ jobs can be scheduled with `removeOnComplete` and `removeOnFail`. If a new job was queued before the old one completed, you now have **two simultaneous runs** for the same agent.

**Hardening requirement:**
- Before firing a heartbeat job, query agent state in Postgres with `SELECT FOR UPDATE` (row-level lock) to atomically verify state=idle AND schedule next job as a single transaction
- Alternatively: use BullMQ's `concurrency: 1` per queue + job deduplication by `agentId` so only one job per agent exists at a time
- Add idempotency key to heartbeat job: `heartbeat:{agentId}:{scheduledTime}` — if job with same key exists, do not enqueue another
- In `BudgetEnforcer`: when pausing an agent, explicitly cancel any pending (not yet running) BullMQ jobs for that agent via `queue.getRepeatableJobs()` + `queue.removeRepeatableByKey()`

**Status:** Not addressed.

---

### H-6: Fork Worker Orphaning

**Risk:** High. When a parent agent forks a worker (Unit 2), the worker runs with its own timeout (`timeoutMs`). If the parent agent crashes or is killed before the worker completes:

- Worker's `sidechain` transcript is orphaned — parent never reads the result
- Worker may continue running, consuming budget, until its timeout fires
- Worker's results are never consolidated into parent's WorkingMemory

**Hardening requirement:**
- Workers must register themselves in a `fork_workers` table: `worker_id, parent_session_id, status (running|completed|orphaned), started_at, heartbeat`
- Parent registers expected workers before forking: `INSERT INTO fork_workers (worker_id, parent_session_id, status) VALUES (...)`
- On worker completion: worker calls back to `POST /fork-worker/complete` which updates status and writes summary to parent's WorkingMemory
- If parent session ends and worker is still `running`: mark worker as `orphaned`, fire alert to on-call
- Orphaned workers should self-terminate after a grace period (worker checks `fork_workers.parent_session_id` status before doing expensive work)
- Add `orphaned_worker_timeout_minutes: 5` — if orphan detected and worker runs > 5 minutes past parent death, kill worker

**Status:** Not addressed.

---

### H-7: PROACTIVE Tick + Dream Consolidation Concurrent State

**Risk:** High. The plan defines three agent states: `awake`, `idle`, `dreaming`. But there is no locking or state machine enforcement preventing:
- A PROACTIVE tick firing while the agent is in `dreaming` state
- A governance event waking an agent while `dreaming`
- A user-initiated ad-hoc run while `dreaming`

**Hardening requirement:**
- Implement agent state as an enum with transitions enforced in the runner (not just a string field that anyone writes):
  ```
  AWAKING -> ACTIVE -> IDLE -> DREAMING
                          ^         |
                          |_________|  (dream completes)
  ```
- State stored in Postgres with `SELECT FOR UPDATE` on state transitions
- All wake triggers (tick, webhook, user ad-hoc, governance) go through a single `wakeAgent(agentId, wakeReason)` function that validates state transition is legal
- If `wakeAgent` is called while `dreaming`: queue the wake for after dream completes (don't interrupt mid-consolidation)
- Add `last_state_transition_at` timestamp — if state hasn't changed in expected time, fire an alert

**Status:** Not addressed.

---

### H-8: Multi-Agent Write Conflicts (No Optimistic locking on shared resources)

**Risk:** High for multi-agent scenarios. In Unit 3, multiple workers (research, writer, reviewer) may call `memory.remember()` simultaneously. The current design calls `remember()` as fire-and-forget, but:

- Two workers writing to the same Qdrant collection simultaneously could have vector consistency issues
- Writer worker might call `memory.update()` to refine research worker's entries (Plan 004 mentions delete+re-add pattern) — if both workers try to update the same entry simultaneously, last-write-wins could corrupt memory

**Hardening requirement:**
- All memory operations for a given user session must be serialized through a per-user mutex (in-memory or Redis-based)
- `memory.update()` (delete+re-add) must be a single atomic transaction: fetch current entries, generate refined content, DELETE old entries, ADD new entries — all in one DB transaction
- Add optimistic locking to Qdrant: each memory entry has a `version` field; update checks version hasn't changed since read

**Status:** Partially acknowledged (delete+re-add noted), transaction atomicity not specified.

---

## Category 3: Infrastructure & Scalability (Critical)

### H-9: Webhook Scaling Plan Has No Owner

**Risk:** High-High (explicitly noted in the plan's own risk table). The mitigation says "Vercel Edge + Cloudflare Workers receiver + Pub/Sub fan-out" — but **none of the implementation units for Unit 5 actually include this infrastructure**. The webhook receiver is listed as one file: `lib/kairos/webhook-receiver.ts`. That's not a scalable architecture for 1000 concurrent users.

**What's missing:**
- Cloudflare Worker script (where does it live? `workers/gmail-push-receiver/index.ts`?)
- Vercel Edge Function configuration
- Pub/Sub topic setup per user (how do you create N topics?)
- The fan-out pattern (one Gmail push notification → N AgentOS users who watch that email) — this isn't one-to-one. Gmail push is per-user. So for 1000 users, you need 1000 Pub/Sub subscriptions.
- Dead letter queue for failed webhook processing
- Idempotency: Gmail push retry behavior (Gmail retries for up to 24 hours if 500 response)

**Hardening requirement:**
- Create a separate infrastructure spec: `docs/plans/2026-04-01-006-feat-agentos-webhook-scaling-plan.md`
- Evaluate alternatives: Gmail push → Cloudflare Worker → Vercel Edge → BullMQ (already have this) vs. Gmail push → Cloudflare Worker → Durable Object → agent
- Specify Pub/Sub subscription management: who creates subscriptions when a new AgentOS user authenticates Gmail? Must be automated (Terraform? Cloudflare Pages Functions?).
- Add webhook replay protection: store `X-Goog-Message-Number` in Redis with 24h TTL
- Document Gmail push retry behavior and how it interacts with idempotency

**Status:** Acknowledged as risk, no implementation plan exists.

---

### H-10: Memory Service Single Point of Failure

**Risk:** High. Unit 1 says "Runner calls memory recall on startup (injects into WorkingMemory)." If the memory microservice (Plan 004) is unavailable:

- Agent starts **without memory context** — this is "graceful degradation" per the plan
- But if this happens on every PROACTIVE tick (every 30 min), the agent continuously runs without memory. KAIROS dream consolidation also fails.
- No alert is fired when memory service is down — degradation is silent.

**Hardening requirement:**
- Add health check: `memoryClient.health()` — calls `GET /health` on memory microservice
- If `health()` fails, increment `memory_service_errors` counter in agent run metadata
- After N consecutive failures (e.g., 3), fire an alert to on-call AND surface warning in the canvas UI ("Agent running with limited memory — [Retry]")
- Document RTO (Recovery Time Objective) for memory service — if it goes down, what's the SLA to bring it back?
- Add circuit breaker pattern: after 50% error rate in 1 minute, open circuit for 30 seconds (don't keep calling a failing service)

**Status:** Acknowledged as graceful degradation, monitoring/alerting not specified.

---

### H-11: mem0.ai Cost Scaling Has No Monitoring

**Risk:** High (acknowledged in plan). The mitigation says "Start with small user base; monitor API costs per user" but there's no implementation plan for the monitoring, no cost alert thresholds, and no per-user quotas in the memory service.

**Hardening requirement:**
- In Plan 004 memory microservice, add `mem0_cost_per_user` tracking: log each mem0 API call with cost estimate (mem0 pricing is per-call based on input tokens)
- Store in Postgres: `api_costs(user_id, date, calls, estimated_cost)`
- Alert threshold: if estimated_cost per user per day exceeds $X, pause new `remember()` calls for that user and notify them
- Implement per-user monthly cap in memory microservice: `if (currentMonthCost > user.limit) { return { error: 'limit_exceeded' } }`

**Status:** Acknowledged as mitigation, no implementation.

---

## Category 4: Missing Operational Procedures (High)

### H-12: No Rollback Procedures for Any Unit

**Risk:** High. If Unit 3 (Coordinator) introduces a bug that corrupts agent state, there is no rollback story. If Unit 7 (Template Gallery) pushes a bad skill template that causes all agents to behave incorrectly, there's no mechanism to revert.

**Hardening requirement — add a Rollback Procedures section to each unit:**

For each unit, specify:
1. What is the rollback trigger? (error rate > X%, specific failure mode)
2. What is the rollback action? (feature flag off, revert migration, redeploy previous version)
3. Who approves rollback? (on-call, team lead)
4. What is the verification after rollback?

Example for Unit 3:
> **Rollback:** If multi-agent tasks have >5% failure rate (vs. <1% baseline), disable `coordinatorMode` feature flag. This stops coordinator spawning but does not affect single-agent runs. Redeploy previous runner version if flag disable is insufficient.

**Status:** Not present in plan.

---

### H-13: No Distributed Tracing Across Memory Service

**Risk:** High. When an agent runs for 30 PROACTIVE ticks with degraded memory, debugging which tick failed and why requires tracing across:
- AgentOS app → memory microservice (HTTP)
- Memory microservice → mem0.ai (HTTP)
- Memory microservice → Qdrant (gRPC or HTTP)
- Memory microservice → Postgres (SQL)

Currently there is no mention of distributed tracing. If memory recall takes 800ms (exceeds 500ms p95 gate), you can't tell if it's mem0.ai or Qdrant or the network.

**Hardening requirement:**
- Add OpenTelemetry instrumentation to memory microservice: trace from `POST /memory/remember` through mem0 call and Qdrant insert
- Add correlation IDs: every `recall()` and `remember()` call from the runner includes a `X-Correlation-ID` header that propagates through all sub-calls
- Store correlation ID in all log lines and Qdrant metadata
- Document the 500ms p95 latency gate as a **Service Level Objective** with alerting when breached

**Status:** Not mentioned.

---

### H-14: BullMQ Itself Has No Failure Story

**Risk:** Medium-High. The entire Phase 2 architecture depends on BullMQ scheduling heartbeats. If BullMQ Redis goes down:
- No new heartbeats fire
- PROACTIVE ticks don't fire
- Agents appear "idle" but are actually just not being woken
- Users get no notifications

The plan has no story for BullMQ Redis reliability, no mention of Redis Sentinel/Cluster for HA, and no health check for the BullMQ scheduler itself.

**Hardening requirement:**
- Redis HA setup required for production: Redis Sentinel (minimum 3 nodes) for automatic failover
- Add BullMQ scheduler health check: a separate lightweight process that monitors "are heartbeats firing on schedule?" and alerts if they're >N minutes late
- Document: if Redis goes down, what is the recovery procedure? (Redis restore from RDB, BullMQ rebuilds queue from Postgres agent state)
- Consider: for critical agents (PROACTIVE), add a fallback "direct wake" via the webhook receiver — if BullMQ is down but Gmail push arrives, the agent still wakes

**Status:** Not mentioned.

---

## Category 5: Edge Cases & Error Handling (High)

### H-15: Dream Consolidation > 30s Limit / >25KB Cap — What Actually Happens?

**Risk:** Medium. The plan says "Dream consolidation runs as a bounded background task (max 30–60 seconds)" and "Dream output capped at <25KB." But:

- If the Orient + Gather phases take 28 seconds and Consolidate starts producing output that exceeds 25KB at 29 seconds, what happens? The plan shows `if (totalBytes + entryBytes > maxBytes) break` — this breaks the loop but doesn't guarantee the output is <25KB (you already accumulated up to 25KB).
- If the LLM call in Consolidate takes 55 seconds (exceeds 30s limit), does the whole dream abort or just the Consolidate phase?
- What happens to the Prune phase if Consolidate was truncated? Do you still prune?

**Hardening requirement:**
- Clarify: 30s wall-clock timeout starts at dream start, not phase start. All 4 phases share the budget.
- Clarify: if Consolidate exceeds 25KB, the Prune phase must still run (you can't have partial consolidation without cleanup of stale entries — that defeats the purpose)
- Add a `dream_session_log` entry: `{ id, agentId, started_at, phases_completed: ['orient','gather'], ended_at, output_bytes, entries_processed, reason_ended: 'timeout'|'size_cap'|'complete' }` — this is the only way to verify dream quality
- If Prune doesn't run due to timeout, surface this in the next agent notification: "Dream consolidation incomplete — [Retry]"

**Status:** Partially specified, ambiguity on phase failure handling.

---

### H-16: Governance Pending + User On Vacation

**Risk:** Medium. The plan says: "Agent **waits** — does not apply change until user approves." If Maria (the persona) puts in a request to add HubSpot integration (a Tier 2 governance event) and then goes on vacation for 2 weeks:

- The agent that needs HubSpot to function is frozen
- The governance board shows "pending" indefinitely
- No escalation path to anyone else

**Hardening requirement:**
- Add governance timeout: if a Tier 2 event is pending > N days (configurable, default 7), send a reminder notification. After 14 days, auto-expire the governance request and notify the agent.
- Add "delegate" option: Maria can designate a backup approver for governance events while she's away
- In governance card UI: show "Pending since [date]" prominently with days counter
- Agent behavior when governance is stale: agent can continue operating with its current tools (no change applied, no new tool added), just notify the user that the pending request expired

**Status:** Not addressed.

---

### H-17: Template Skill Auto-Update Destabilizes Deployed Agents

**Risk:** Medium. The plan notes in Open Questions: "How are templates versioned? If a skill is updated, do deployed agents auto-update?" This is unresolved. But the SKILL.md schema shows fields like `allowed-tools` and `heartbeat` that directly control agent behavior. If a skill is updated:

- `allowed-tools` change: agent suddenly has new tool access (governance issue)
- `heartbeat` change: agent schedule changes without user input
- `escalation` change: agent behavior changes silently

**Hardening requirement:**
- Every skill version must be immutable: `skills/email-handler/v1/SKILL.md`, `skills/email-handler/v2/SKILL.md`
- When a skill is updated, the gallery shows "Update available" badge but does NOT auto-apply
- User-initiated skill update requires re-confirmation of tool access (same as activating a new agent)
- Store `agent_skill_version` in agent config — allows rollback to specific skill version

**Status:** Open question, no resolution.

---

### H-18: PROACTIVE Tick Interval — Who Enforces It?

**Risk:** Medium. The plan says "Tick interval: configurable per agent (default: every 30 minutes for PROACTIVE agents)" but:
- BullMQ scheduler fires the tick (per-unit 4)
- But what enforces that the agent can't configure a tick interval of "every 1 second"? That would create a denial-of-service on the user's own account
- What if 1000 users all set 1-minute ticks? The memory service, LLM API, and email integrations all get hammered.

**Hardening requirement:**
- Enforce tick interval minimum server-side: reject agent configs with tick interval < 15 minutes
- Add per-user rate limiting on total PROACTIVE ticks per hour across all agents (e.g., max 10 ticks/user/hour)
- Make 30-minute default hard: not configurable below 15 minutes in the UI
- Add user-facing explanation: "Your agent checks for work every [X]. More frequent checks use more of your agent's budget."

**Status:** Not enforced.

---

## Category 6: Memory & Storage (High)

### H-19: Memory Unbounded Growth — No TTL, No Eviction Policy

**Risk:** High. Plan 004 explicitly marks "Memory TTL/expiration" as out-of-scope. But Phase 2's PROACTIVE agents will call `memory.remember()` after every session. For a year:

- 5 agents × 2 sessions/day × 365 days = 3,650 remember() calls/year
- Each call might store 5–20 facts (vector entries)
- 18,250–73,000 vector entries per user per year
- Qdrant collection grows unbounded

At scale (1000 users × 73,000 entries = 73M vectors), Qdrant RAM requirements become significant. More importantly, recall quality degrades when too many irrelevant old entries exist for a query.

**Hardening requirement:**
- Re-evaluate TTL/expiration as Phase 2 in-scope — this cannot stay out-of-scope indefinitely
- Minimum: add `last_accessed_at` to each memory entry (update on recall), and run a nightly job that soft-deletes entries not accessed in N days (recommend 90 days for casual users, 30 days for inactive)
- Add memory hygiene score per user: `total_entries / avg_recency` — alert if score degrades (indicates stale memory accumulating)
- Document storage sizing: for N users with M sessions/day, expected Qdrant storage = N × M × avg_facts × vector_dim × 4 bytes (float32)

**Status:** Known out-of-scope, but needs explicit deferral with timeline.

---

### H-20: Qdrant Recall Quality Degradation — No Re-Indexing

**Risk:** Medium. Qdrant vector quality degrades over time (noted in Risk table). Vector databases accumulate "stale" points — deleted entries leave gaps, and HNSW graph quality degrades with many insertions. The plan says "Periodic re-indexing job; monitor recall accuracy" but this job is not in any implementation unit.

**Hardening requirement:**
- Add `POST /admin/reindex` endpoint to memory microservice: runs Qdrant's `update_collection` to recreate the HNSW index with updated parameters
- Schedule this quarterly as a manual operation, not automated
- Add recall quality monitoring: store a `recall_quality_score` — after each `recall()`, run a synthetic "did you find relevant info?" check and log the result
- Document: when to run re-indexing (recall quality score drops >20%)

**Status:** Acknowledged in risks, no implementation.

---

## Category 7: Integration Gaps (High)

### H-21: A2A Protocol Dependency Missing in Unit 3

**Risk:** High. The plan says Unit 3 (Coordinator) depends on Plan 001 (A2A) for "full integration testing." But A2A is specified as **client-only in Plan 001** ("AgentOS is not an A2A server"). The Coordinator pattern in Unit 3 uses **in-process fork + sidechain** (not HTTP-based A2A). The A2A dependency is mislabeled.

**What Unit 3 actually needs from A2A:**
- A2A is for **external** agent communication (AgentOS agent calls an external A2A agent)
- The coordinator pattern (research → write → verify) is **internal** — all workers are spawned by the same runner, share the same process, and communicate via WorkingMemory + `SendMessage`

**The actual dependency chain for Unit 3:**
- Unit 2 (fork + sidechain) — must exist first
- Unit 3 does NOT need A2A unless external agents are in the workflow

**The A2A dependency in Unit 3's risk table says:** "A2A must ship before Unit 3 integration tests; add explicit test dependency; prototype A2A stub in Unit 2 if plan 001 slips"

**Clarify:** The A2A dependency applies to the A2A Node feature in the canvas (connecting to external agents), NOT to the internal Coordinator pattern. Rename the dependency in the plan.

**Status:** Dependency is mislabeled, not a blocker for Unit 3.

---

### H-22: mem0.ai `update()` API Doesn't Exist — The Plan Documents This Correctly But Needs Confirmation

The plan correctly notes in Unit 5: "mem0.ai real API: search → delete → add (update pattern) — No consolidateMemories() exists — refinement via delete+re-add."

This is correct. But it needs confirmation: does mem0.ai's REST API actually support delete? The `delete()` method may be user-level (delete all memories for a user) not entry-level (delete specific memory by ID).

**Action required:**
- Verify mem0.ai API docs for entry-level deletion: `DELETE /memories/{memory_id}` vs. `DELETE /memories?user_id=xxx` (user-level only)
- If mem0.ai only supports user-level deletion, the consolidate → delete + re-add pattern doesn't work for refinement — you can only add new memories, not refine old ones
- Alternative: store refined versions with a `parent_memory_id` reference and filter by `parent_memory_id=null` at recall time (don't delete old entries, just supersede them)

**Status:** Plan correctly documents the uncertainty but defers resolution to Unit 5 without a concrete fallback.

---

### H-23: No Phase 1.5 Skills System Dependency Clarity

**Risk:** Medium. Unit 7 (Template Gallery) depends on "Phase 1.5 (Skills) — Skills loader must exist." The plan says "if Phase 1.5 is delayed, Unit 7 must be adjusted to not depend on the skill loader."

But there is no Phase 1.5 plan in the plans directory. There's no committed timeline. The plan acknowledges this as a risk but has no fallback.

**Hardening requirement:**
- Phase 1.5 plan must be created before Phase 2 begins — it gates Unit 7
- Fallback for Unit 7: if skills loader isn't ready, templates are hardcoded React components instead of SKILL.md files (temporary shim, not production-ready)
- Mark Phase 1.5 as a hard dependency gate on the Phase 2 project board

**Status:** Acknowledged but unresolved.

---

## Category 8: Monitoring & Observability (Medium-High)

### H-24: No Alerting Spec for Any Phase 2 System

**Risk:** Medium. The plan has no alerting specification. For a production always-on system, you need alerts for:

| Alert | Trigger | Severity |
|-------|---------|----------|
| Memory service down | /health returns 500 for >2 min | P1 |
| Memory recall latency >1s | p95 over 5 min window | P2 |
| Agent stuck in dreaming | dream state >60s | P1 |
| Governance queue depth >10 | pending governance events >10 for >1h | P2 |
| Budget warning | any agent at 80% | P3 |
| PROACTIVE tick missed | scheduled tick not fired within interval × 1.2 | P2 |
| BullMQ queue depth >100 | pending jobs >100 | P2 |
| mem0.ai error rate >5% | 5xx responses >5% over 10 min | P1 |
| Gmail push webhook failing | 4xx rate >1% | P2 |

**Hardening requirement:**
- Add `docs/ops/phase2-alerting.md` with all alerts, thresholds, and Runbooks
- Integrate with existing on-call stack (PagerDuty? Slack alerts?)
- Every Go/No-Go gate in the milestones should have a corresponding metric that is checked

**Status:** Not present.

---

### H-25: No Canvas/UI Error States for PROACTIVE/KAIROS Failure Modes

**Risk:** Medium. The plan specifies PROACTIVE and KAIROS behaviors in the runner, but doesn't specify what the user sees when:
- PROACTIVE agent can't wake (BullMQ down)
- KAIROS dream fails repeatedly (mem0.ai errors)
- Agent is paused due to budget
- Memory recall returns empty (first time user)

**Hardening requirement:**
- Add error state cards to the canvas agent card UI:
  - `⚠ PROACTIVE: Check failed — [View logs]`
  - `💤 KAIROS: Dream incomplete — [Retry]`
  - `⏸ Paused: Budget exceeded — [Resume]`
- When memory recall returns empty for a PROACTIVE agent, show "First run — agent is learning your patterns"

**Status:** Not specified.

---

## Category 9: Ambiguous Specifications (Medium)

### H-26: MAX_FORK_DEPTH = 2 Is Defined But Fork Count Is Unbounded

**Risk:** Medium. The plan says "Max 2 levels of fork delegation (parent → worker → sub-worker)" but doesn't address:
- At level 2, can the parent spawn **multiple** workers simultaneously? Yes, per Unit 3's `parallel: true` in coordinator workflow
- But what prevents 10 research workers from being spawned at level 1? The plan shows `parallel: true` but no upper bound
- A misconfigured coordinator could fork 100 workers at once, each consuming LLM tokens

**Hardening requirement:**
- Add `MAX_PARALLEL_WORKERS = 3` constant
- If coordinator requests > 3 parallel workers, queue excess workers (execute sequentially, not in parallel)
- Add worker budget: each fork has `maxBudgetUsd` — if cumulative worker spend exceeds this, stop spawning new workers and escalate
- Document: what happens if a worker exceeds its `maxSteps`? Does it abort silently or escalate?

**Status:** Partially specified.

---

### H-27: `coordinatorMode.ts` Reference — Wrong Plan Referenced

**Risk:** Low-Medium. The plan references `coordinatorMode.ts` from Claude Code harness analysis as the source for the coordinator prompt. But the analysis document (`claude-code-harness-analysis.md`) is listed in Sources but the actual `coordinatorMode.ts` file is only referenced by name in "Claude Code Reference Files (Pattern Sources)" — not actually read or confirmed to exist in the codebase.

**Action required:**
- Confirm `forkSubagent.ts`, `runAgent.ts`, `coordinatorMode.ts`, and `sidechain transcripts` all exist in the Claude Code CLI harness
- If any reference file doesn't exist or has a different API than assumed, update the plan's implementation units to match the actual API

**Status:** Referenced but not independently verified in this plan.

---

### H-28: Template Count Mismatch

**Risk:** Low. The plan says "6–10 templates" in the header, then "8 skill-based templates" in Milestone 4B, then lists 6 templates in Decision 5's table, then says "6–10 templates" again in Unit 7 scope.

Be consistent. Pick 8 as the target and describe exactly which 8.

---

## Category 10: Missing Completeness (Medium)

### H-29: Quiet Hours Not Implemented

**Risk:** Medium. The plan acknowledges notification fatigue as a risk but says the mitigation is "User-configurable tick intervals; quiet hours." The quiet hours feature is not in any implementation unit. If Maria has a PROACTIVE agent ticking every 30 minutes and it sends a push notification every time it finds work (which could be many times per day), she'll turn off push notifications entirely.

**Hardening requirement:**
- Add quiet hours to AgentConfig: `{ quietHours: { enabled: boolean, start: '22:00', end: '08:00', timezone: 'America/New_York' } }`
- During quiet hours: PROACTIVE agent still evaluates work but queues notifications, sends a digest at 08:00 instead
- User-configurable notification frequency: "Every event" vs "Hourly digest" vs "Daily digest"
- All governance notifications are exempt from quiet hours (they require human review)

**Status:** Acknowledged in risks, not in implementation.

---

### H-30: BullMQ Job Persistence on Runner Crash

**Risk:** Medium. BullMQ jobs are persisted in Redis. If the AgentOS runner process crashes mid-execution:
- The job is marked `active` in BullMQ
- After the job's `timeout` expires, BullMQ marks it as `failed` and optionally retries
- But the agent's checkpoint (if any from Phase 1 DurableRunner) may be inconsistent with what actually executed

**Hardening requirement:**
- Document the checkpoint semantics from Phase 1 DurableRunner: after each tool call, agent state is checkpointed. If job fails, on restart the agent resumes from last checkpoint.
- BullMQ `attempts` configuration: for PROACTIVE jobs, set `attempts: 1` (don't retry — stale context makes retry counterproductive)
- For governance events triggered by crashes: if agent was in the middle of a tool call when crash occurred, emit a governance event "incomplete_action_detected" when agent restarts

**Status:** Not mentioned.

---

## Summary: Prioritized Hardening Actions

### Must Fix Before Phase 2 Begins

| # | Issue | Category | Owner |
|---|-------|----------|-------|
| H-1 | Governance server-side verification not in Unit 8 | Security | Unit 8 |
| H-2 | OAuth token encryption design required | Security | Unit 6 |
| H-3 | Webhook signature verification has API errors | Security | Unit 5 |
| H-4 | PII redaction in memory pipeline | Security | Plan 004 |
| H-5 | BullMQ + agent state race condition | Concurrency | Unit 1 |
| H-9 | Webhook scaling infrastructure plan missing | Infrastructure | Separate plan |
| H-19 | Memory TTL — re-evaluate as in-scope | Storage | Plan 004 |
| H-21 | A2A dependency mislabeled for Unit 3 | Integration | Unit 3 |

### Must Fix Before Milestone 3 (Autonomous Agents)

| # | Issue | Category |
|---|-------|----------|
| H-6 | Fork worker orphaning | Concurrency |
| H-7 | PROACTIVE + KAIROS concurrent state | Concurrency |
| H-8 | Multi-agent write conflicts on memory | Concurrency |
| H-10 | Memory service SPOF + circuit breaker | Infrastructure |
| H-11 | mem0.ai cost monitoring | Infrastructure |
| H-14 | BullMQ HA + failure story | Infrastructure |
| H-22 | mem0.ai entry-level delete API verification | Integration |

### Must Fix Before Phase 2 Ship

| # | Issue | Category |
|---|-------|----------|
| H-12 | Rollback procedures per unit | Operations |
| H-13 | Distributed tracing spec | Observability |
| H-15 | Dream consolidation phase failure handling | Error Handling |
| H-16 | Governance timeout + vacation coverage | Error Handling |
| H-17 | Template versioning + auto-update policy | Stability |
| H-18 | PROACTIVE tick interval enforcement | Security/Rate Limit |
| H-20 | Qdrant re-indexing job | Storage |
| H-24 | Alerting specification | Observability |
| H-25 | Canvas error states for Phase 2 failure modes | UX |
| H-26 | Parallel worker cap | Stability |
| H-29 | Quiet hours implementation | UX |
| H-30 | BullMQ job persistence on crash | Reliability |

---

## What This Plan Gets Right

Notably, several things in the plan are excellent and should be preserved:

1. **Graceful degradation everywhere** — MemoryClient being optional and degrading silently is the right call. Don't block agent startup on memory availability.

2. **Fire-and-forget remember()** — `remember()` being non-blocking is critical. Don't slow down agent response times for memory writes.

3. **25KB dream output cap** — A firm resource budget for dream processing prevents runaway LLM calls.

4. **Decision 1 (memory before autonomous)** — The dependency chain is correct. PROACTIVE without memory is a bad agent.

5. **Fork recursion guard (MAX_FORK_DEPTH=2)** — Correct instinct to bound recursion.

6. **Governance events stored in Postgres** — Not ephemeral. Survives server restarts.

7. **The persona-driven design** — Maria on vacation is a real scenario that should be hardened.

---

*This hardening review identified 11 critical, 8 high, and 11 medium-priority gaps. Critical items must be addressed before or during implementation; medium items should be tracked as Phase 2.5 or Q3 post-launch improvements.*
