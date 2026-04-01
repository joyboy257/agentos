---
date: 2026-03-31
topic: durable-agents-product-requirements
---

# Durable, Always-On Agents — Product Requirements

## Problem Frame

The core reframe: **You don't run an agent. You hire an agent.** "Handle my emails" means an agent that works 24/7 forever, not a one-off task.

Current AgentOS (v2) builds one-off task runners. The v3 product must support durable, always-on agents that work continuously — scheduling their own work, remembering past actions, and escalating only when genuinely needed.

Nine product dimensions need decisions before planning can begin.

---

## Requirements

- R1. **Adaptive Abstraction Ladder** — The system must support four layers of user control: Layer 1 (pure intent: "handle my emails"), Layer 2 (agent-level: schedule + tools), Layer 3 (escalation policy: "CC me on anything to executives"), Layer 4 (per-action approval). The user chooses their layer. The system surfaces the right controls without overwhelming users who want simplicity.

- R2. **Canvas as Team Dashboard** — The canvas is a live team management interface, not a run visualizer. Agent cards show current status (idle, running, waiting_for_approval, paused, failed), last ran, and what the agent is doing right now. Activity feed vs run log — the distinction matters.

- R3. **The AHA Moment** — The moment of deployment feels like hiring someone, not submitting a form. "Activate" is a clear, confident gesture. Onboarding flow asks: "When should it run?" and "When should it ask you?" — not configuration questions.

- R4. **Escalation as Primary User Touchpoint** — The agent works 24/7. When it needs a human, it pings. Escalation modal becomes the main way the agent talks to the user. Notification model is defined. Waiting_for_approval state is surfaced as a ping, not a badge.

- R5. **Activity Log** — Agent runs every day for 3 months. The user can search, filter, and timeline-view all activity. This is fundamentally different from a run trace viewer. Ticket-based organization (each run = one ticket) with full audit trail.

- R6. **NL Interpretation at the Right Abstraction** — The NL layer handles implicit escalation policies ("handle my emails, but CC me on anything to executives") without requiring the user to know what "escalation policy" means. The NL layer detects which abstraction layer the user is operating at and adapts.

- R7. **Agent Team Model** — User builds a team over time, not a pipeline per run. Multiple agents, one dashboard, unified escalation inbox. Org chart metaphor for agent hierarchy.

- R8. **State Machine UX** — Agent states (idle, running, waiting_for_approval, paused, failed, completed) are surfaced in the UI. waiting_for_approval is the most visible state — the ping. The user always knows what state their agent is in.

- R9. **Per-Agent vs Per-Action Escalation Config** — User chooses their level of control per agent. AgentOS intelligently assists by flagging when lower-layer settings conflict with higher-layer stated goals (e.g., "per-action approval for all emails" conflicts with "handle my emails autonomously").

---

## Success Criteria

- An agent can be created in under 2 minutes via plain English
- User sees their agent team's status at a glance on a single canvas view
- Escalation modal is readable by a non-technical user within 5 seconds
- Activity log is searchable without training
- waiting_for_approval state surfaces as a notification within 10 seconds of the agent pausing
- Non-technical user can understand what their agent is doing without reading docs

---

## Scope Boundaries

- **In scope:** Canvas UI, NL interpretation layer, escalation modal, activity log, agent team dashboard, heartbeat scheduling, resource budgets
- **Out of scope:** Mobile app (Phase 3), agent marketplace (Phase 3), team collaboration multi-user (Phase 2+)

---

## Key Decisions

- **Decision: Org chart over pipeline diagram.** Agent teams are displayed as hierarchies with reporting lines, not data flow pipelines. Rationale: Non-technical users understand org charts from their own companies. Pipeline diagrams are developer-native.

- **Decision: Heartbeat model for always-on execution.** Agents wake on schedule, check for work, act, then sleep. Not a continuous loop — discrete heartbeats with clear state. Rationale: Comprehensible to non-technical users. "My agent wakes up every morning and checks for new emails."

- **Decision: Two-tier escalation.** Action-level (inline modal for dangerous tools like email send) vs. agent-level (governance page for creating agents, changing budgets). Rationale: Paperclip AI's board governance pattern translates well. Different stakes deserve different UX.

- **Decision: Ticket-based activity log.** Each scheduled run = one ticket. Searchable, filterable, timeline view. Not a raw run trace. Rationale: Follows Paperclip's audit trail pattern. Matches how non-technical users think about work ("what did my agent do last week?").

---

## Dependencies / Assumptions

- Durable execution infrastructure (BullMQ, Postgres, state machine with checkpoints) must exist before the canvas can show persistent agent state
- The NL interpretation layer is built as a separate service that converts plain English → agent config
- Hook system (Units 1–2) is already built and provides the event foundation for canvas reactivity

---

## Outstanding Questions

### Resolve Before Planning

- **[R1] Abstraction layer defaults:** When a new user creates their first agent, what layer do we start them at? Do we assume Layer 1 (pure intent) and let them drill down, or Layer 2 (agent-level with schedule + tools)?

- **[R4] Notification delivery:** When the agent enters waiting_for_approval, how does the user get pinged? In-app notification only? Email? SMS? Is there a notification preferences model?

- **[R6] NL confidence threshold:** If the NL layer interprets "handle my emails" as a Layer 1 agent, but the user has previously set per-action approval for email sends — how does the system detect and flag this conflict?

### Deferred to Planning

- **[R3] Onboarding flow:** What does the first-time setup wizard look like when the first agent "just works"? Is there a getting-started template that walks through "when" and "when to ask"?
- **[R5] Activity log retention:** How far back do we store? Cost/privacy implications of storing agent reasoning traces?
- **[R9] Conflict resolution UI:** When AgentOS flags a conflict between stated intent and lower-layer settings, what does that warning look like? Is it blocking or advisory?

---

## Next Steps

→ `/ce:plan` for structured implementation planning
