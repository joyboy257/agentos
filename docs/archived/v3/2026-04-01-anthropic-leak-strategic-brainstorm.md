---
date: 2026-04-01
topic: agentos-anthropic-leak-strategic-brainstorm
---

# AgentOS Anthropic Leak — Strategic Reassessment

## Problem Frame

Anthropic's Claude Code source was leaked (2026-03). The leak revealed production-grade patterns for always-on agents, permission auto-approval, multi-agent orchestration, and remote agent bridges. AgentOS's PRD was written before this leak. This brainstorm reassesses all phases with the competitive reality.

**The core competitive insight:** Claude Code — a company with vastly more resources — is converging on the same product architecture as AgentOS. This validates our direction AND creates a 6-12 month window to establish market position before Anthropic ships broadly.

---

## Strategic Decisions

### SD1. Strategic Direction: Win SMB First

AgentOS targets non-technical business users (Maria, HVAC company owner). Anthropic targets developers. These are different markets. KAIROS is an always-on daemon for devs who live in terminals. We build the Canva of AI agents — the thing Maria opens and immediately understands.

**Moat:** Canva-level UX. Anthropic is a model company, not a product company. They will never make something this simple for this audience. UX is the moat, not the runtime.

### SD2. Phase 1.5 Priority: Permission Auto-Approval First

Phase 1.5 has 4 items. The order matters for time-to-value.

**New Phase 1.5 order:**
1. **Permission auto-approval (TRANSCRIPT_CLASSIFIER)** — first, fastest to value
2. Feature flag system — required infrastructure for safe rollout
3. Streaming tool execution — trust building via real-time visibility
4. Skills system v1 — powers the template picker

**Rationale:** Without permission auto-approval, every agent action requires human confirmation. This makes agents unusable for Maria. TRANSCRIPT_CLASSIFIER is a classifier — relatively simple to implement — with massive UX impact.

### SD3. Phase 2 Boundary: Keep PROACTIVE + KAIROS in Phase 2

PROACTIVE (agent acts between users) and KAIROS (always-on daemon with dream consolidation) require long-term memory first. Move too fast without memory and agents act stupidly — they lack context from previous sessions.

**Sequence is firm:** Memory → Learning → Autonomy. You can't have useful always-on behavior without persistent memory.

### SD4. Phase 3: Remote Bridge First

Remote bridge enables enterprise/team agent sessions. Natural progression: SMB (Phase 1-2) → Team/Enterprise (Phase 3). Mobile is a secondary concern — Maria uses her phone, but the primary canvas is desktop.

### SD5. The Bet-the-Company Move: Canva-Level UX

Anthropic cannot copy this. They are a model company with a developer-first culture. Their UX will always be "for people who understand agents." AgentOS's UX is "for people who don't."

---

## Alpha Territory

Where we can move faster than Anthropic because we have no internal constraints:

1. **Permission auto-approval for business workflows** — Anthropic's TRANSCRIPT_CLASSIFIER is trained on code permission patterns. Our classifier trains on email, CRM, calendar patterns. Different domain, faster iteration.

2. **Template marketplace for vertical industries** — HVAC, legal, real estate. Anthropic won't build these. We can own verticals before they notice.

3. **Trust UX for non-technical users** — Escalation modal + reasoning trace + budget bars + activity log. This whole trust stack is not on Anthropic's roadmap for this audience.

---

## The 6-12 Month Window

Anthropic will ship KAIROS broadly. When they do:
- They become a direct competitor in always-on agents
- Their agents will be for developers (KAIROS is CLI-first)
- The non-technical business user market stays underserved

**Window strategy:**
- Phase 1 (0-90 days): Establish product-market fit with Maria
- Phase 1.5 (90-120 days): Remove friction, ship permission auto-approval
- Phase 2 (120-180 days): Build memory and multi-agent before Anthropic ships
- Phase 3 (180+ days): Scale to enterprise/teams

The goal: When Anthropic ships KAIROS, AgentOS has 6-12 months of product momentum, real users, and vertical templates they can't easily replicate.

---

## Requirements

### R1. Phase 1.5 Ships Permission Auto-Approval First

Permission auto-approval using TRANSCRIPT_CLASSIFIER-inspired pattern is the first Phase 1.5 item shipped. It must:
- Auto-classify routine tool calls and execute without escalation
- Surface confidence score to user in escalation modal
- Learn from user approval/denial patterns over time
- Be feature-flagged so it can be disabled per-user or globally

### R2. Feature Flag System is Phase 1.5 Infrastructure

Feature flags ship before any Phase 1.5 capability. This enables:
- Gradual rollout of permission auto-approval (10% → 50% → 100%)
- Kill-switch on any misbehaving feature
- A/B testing of escalation policies
- No-redploy hotfix capability

### R3. Phase 2 Sequence is Memory First, Then Autonomy

PROACTIVE agent mode and KAIROS daemon mode require long-term memory infrastructure (mem0.ai + Qdrant). Phase 2 delivers:
- Long-term memory first
- Then permission learning from memory
- Then PROACTIVE autonomous action
- Then KAIROS-style dream consolidation

### R4. Template Strategy is Vertical-First

Templates are not generic. Pre-built agents are verticalized:
- "HVAC Company Email Agent" — not just "Email Handler"
- "Real Estate Lead Research Agent" — not just "Research Agent"
- "Legal Intake Assistant" — not just "Support Drafter"

Vertical templates create category expertise that generic agents can't match.

### R5. Phase 3 Remote Bridge Enables Multi-Tenant

Remote bridge architecture (git worktree isolation + JWT heartbeat + work polling) enables:
- Enterprise agent isolation
- Team collaboration
- Secure multi-user sessions
- Premium pricing tiers

---

## Success Criteria

- By end of Phase 1.5: Permission auto-approval handles 80%+ of routine tool calls without escalation
- By end of Phase 2: Agent autonomy rate >80% (agent handles 80%+ of runs without escalation)
- By Phase 3 launch: 3+ vertical industry templates live (HVAC, legal, real estate)
- Competitive window maintained: AgentOS has active users and vertical momentum before Anthropic ships KAIROS broadly

---

## Scope Boundaries

- **Not building:** Developer-focused features (CLI, IDE integration, code agents)
- **Not building:** General-purpose agent runtime for developers
- **Not competing on:** Model quality (use best available model, don't build models)
- **Not rushing:** PROACTIVE/KAIROS without memory infrastructure

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Win SMB over enterprise/developers | Different market, less competition, Anthropic ignores this audience |
| Permission auto-approval first in Phase 1.5 | Removes #1 friction for non-technical users, fastest time-to-value |
| Canva-level UX as our moat | Anthropic cannot copy this — model company vs product company |
| Memory before PROACTIVE/KAIROS | Agents without memory are stupid. Sequence is firm. |
| Vertical templates over generic | Category expertise creates defensibility |

---

## Dependencies / Assumptions

- mem0.ai and Qdrant are the assumed long-term memory stack (from existing Phase 2 plan)
- Permission classifier is a local ML model or API-based classifier, not hardcoded rules
- Feature flag system uses build-time DCE (tree-shaken) + runtime kill-switches
- Vertical templates require domain expert input for best results

---

## Open Questions

### Deferred to Planning

- [Technical] What is the permission classifier architecture — local ML model vs API-based? Performance constraints for real-time classification.
- [Technical] How does the feature flag system interact with existing deployment pipeline? Vercel environment variables vs custom flag service.
- [Technical] Vertical template development — what is the process for building domain-specific templates? Do we hire domain experts or partner?
- [Needs research] mem0.ai performance at scale — how many memory queries per heartbeat cycle before latency is unacceptable?

### Resolved During Brainstorm

- **Phase boundaries:** Kept as-is. Phase 1 (Foundation), Phase 1.5 (Friction Reduction), Phase 2 (Memory + Multi-Agent), Phase 3 (Scale)
- **PROACTIVE/KAIROS timing:** Stay in Phase 2 — memory infrastructure is a prerequisite, not optional
- **Remote bridge:** Phase 3 — enables enterprise/multi-user, natural progression from SMB

---

## Next Steps

→ `/ce:plan` for Phase 1.5 permission auto-approval (first item, highest impact)

