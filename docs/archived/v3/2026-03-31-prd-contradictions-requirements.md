---
date: 2026-03-31
topic: agentos-v3-prd-contradictions-resolution
---

# AgentOS v3 PRD Contradictions — Resolution

## Problem Frame

The document-review skill identified 6 blocking contradictions in the PRD. These were resolved through structured dialogue. This document captures the decisions for updating the PRD.

## Decisions

### D1. Memory in Phase 1
**Resolved:** Add working memory to Phase 1 must-have.

Working memory (per-session, ephemeral within a heartbeat cycle) is added to Phase 1 scope. This enables the escalation learning loop described in Section 5.3 — the agent logs approval decisions and reduces repeat escalations within a session.

Long-term memory (cross-session, persistent) remains Phase 2 (mem0.ai + Qdrant).

**Changes:**
- Section 3.1: Qualify "memory" as "(per-session — Phase 1; long-term — Phase 2)"
- Section 5.3: Remove "long-term memory" reference; keep working memory in escalation loop
- Phase 1 scope: Add "Working memory (per-session)"
- Phase 1 out-of-scope: Remove "Working memory"

---

### D2. Template Gallery in Phase 1
**Resolved:** Add minimal template picker to Phase 1 as a simple list.

A pre-agent template picker (2-3 template cards: Email Agent, Research Agent, Support Agent) ships in Phase 1 as a simple list — not a full searchable gallery. Users see templates before or instead of typing a goal.

Section 5.7 and Section 6.5 onboarding are updated to reflect Phase 1 availability.

**Changes:**
- Section 5.7: Update "Pre-built agents available at launch" to note Phase 1 picker, Phase 2 full gallery
- Section 6.5: Update onboarding step 3-5 to reflect template picker UX
- Phase 1 scope: Add "Template picker (2-3 templates)"
- Phase 1 out-of-scope: Remove "Template gallery UI"

---

### D3. AHA Moment Framing
**Resolved:** Reframe AHA moment around ongoing demonstrated competence.

The AHA moment is redefined: not a single first-morning reveal, but the moment a user realizes they forgot to check on their agent because it kept working correctly. Trust built incrementally, not a single dramatic event.

Section 1.2 is rewritten. The anti-principle about run-once workflows (1.4) remains — it's correct and should not change.

**Changes:**
- Section 1.2: Rewrite AHA moment description to reflect ongoing competence framing

---

### D4. Escalation Rate Metric
**Resolved:** Reframe escalation rate as "unnecessary escalations."

The metric changes from "escalation rate <20% of all runs" to "unnecessary escalation rate <20%." An unnecessary escalation is one where the agent escalated when it could and should have handled autonomously.

Separate metric added: "Important escalation capture rate" — tracks whether agents correctly identify items needing human judgment. Maria's goal ("approve the important ones") is served by this metric, not by minimizing all escalations.

Section 10.1 updates the metric definition. Section 1.3 "Escalation is a feature" principle remains unchanged.

**Changes:**
- Section 10.1: Rename "Escalation rate" to "Unnecessary escalation rate (<20%)" with definition
- Section 10.1: Add "Important escalation capture rate" as new metric
- Section 1.3: Add note linking escalation metric to the design principle

---

### D5. Phase 1 Scope Size
**Resolved:** Keep all 9 original must-have items + working memory = 10 must-have items.

The Phase 1 scope is intentionally a full product, not a stripped-down MVP. The 9 items (durable execution, heartbeat, Email Agent template, Gmail tools, action approval, agent card, activity log, magic link auth, canvas dashboard) are all required for an end-to-end working system. Adding working memory makes 10.

The label "MVP" is replaced with "Phase 1" or "Foundation" to avoid the misleading "minimum" connotation.

**Changes:**
- Section 9 Phase 1: Update heading to "Phase 1 — Foundation" or keep "MVP" with explicit note that scope is full end-to-end product
- Phase 1 scope: Add "Working memory (per-session)"
- Total must-have count: 10 items

---

### D6. Resource Budget Bars in Phase 1
**Resolved:** Move resource budget bars to Phase 1 must-have.

Budget bars (visual bar on agent card + 80% warning notification) are a core trust-building feature for Maria. She needs to see her agent isn't spending失控. Auto-pause behavior (budget exceeded → agent pauses) remains Phase 2.

Section 4.3 agent card, Section 5.4 resource budgets, and Phase 1 scope are aligned: bars are in.

**Changes:**
- Section 4.3: Keep budget bar in agent card anatomy (already there)
- Section 5.4: Note visual bars are Phase 1; auto-pause is Phase 2
- Phase 1 scope: Move "Resource budget bars" from Nice-to-have to Must-have
- Phase 1 Nice-to-have: Remove "Resource budget bars"

---

## Updated Phase 1 Scope

**Must have (10 items):**
1. Durable execution (BullMQ + Postgres)
2. Heartbeat scheduler
3. Email Agent template (via template picker)
4. Gmail read/write tools
5. Action approval escalation (modal)
6. Agent card with status, last ran, next wake, budget bar
7. Activity log (timeline view)
8. Magic link auth
9. Canvas team dashboard layout
10. Working memory (per-session)

**Nice to have (4 items):**
1. Web search tool
2. Escalation governance board (Tier 2)
3. Auto-pause on budget exceeded
4. 2nd/3rd agent templates

**Out of scope:**
- Long-term memory
- Template gallery UI (replaced by Phase 1 template picker)
- Calendar/CRM integrations
- Agent marketplace

---

## Cross-Cutting Notes

### Metric Updates (Section 10.1)
- "Escalation rate <20%" → "Unnecessary escalation rate <20%"
- Add: "Important escalation capture rate" (does agent correctly identify important vs. routine escalations)

### AHA Moment (Section 1.2)
- Rewrite from single-morning reveal to ongoing demonstrated competence framing
- Example: "You were about to handle an email yourself when you noticed your agent already handled it."

### PRD Section Updates Required
| Section | Change |
|---------|--------|
| 1.2 AHA Moment | Rewrite with ongoing competence framing |
| 3.1 What You Hire | Qualify memory as per-session (Phase 1), long-term (Phase 2) |
| 4.3 Agent Card | Keep budget bar (Phase 1 must-have) |
| 5.3 Escalation System | Remove long-term memory from learning loop; working memory only |
| 5.4 Resource Budgets | Note bars are Phase 1, auto-pause is Phase 2 |
| 5.7 Template Gallery | Update to Phase 1 picker + Phase 2 full gallery |
| 6.5 Onboarding | Reflect template picker in steps 3-6 |
| 9 Phase 1 | Add working memory; update heading; move budget bars to must-have |
| 10.1 Success Metrics | Reframe escalation rate metric; add important escalation capture rate |
| Phase 1 out-of-scope | Remove working memory, template gallery UI |

---

## Next Steps
→ Apply these decisions to /Users/deon/agentos/docs/PRD.md
→ Then: `/ce:plan` for structured implementation planning
