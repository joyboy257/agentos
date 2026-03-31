---
date: 2026-03-30
topic: agentos-v3-nl-canvas-mvp
---

# AgentOS v3 — NL-to-Canvas MVP

## Problem Frame

Non-technical business users feel the weight of operational overhead: repetitive follow-ups, knowledge bottlenecks, manual work that should be automated. They know what they want an agent to do but can't build it. Existing tools require prompt engineering, configuration, or developer knowledge. The gap between "I know what I want" and "I have an agent doing it" spans four dimensions: the prompt tax, the personalization gap, silent failure invisibility, and trust calibration.

AgentOS v3 is "Canva for AI agents" — a visual canvas where non-technical users compose agent teams and delegate work through natural language. The canvas makes pipelines visible and interpretable so users can understand, trust, and correct their agents. The core product loop is **NL-to-canvas**: a user describes what they want in plain English, and the system builds a working agent pipeline on the visual canvas.

**Core product metaphor:** A tireless junior employee who never forgets. You delegate a job, they figure out the steps, they come back with results. Not a tool you configure — a person you put to work.

**MVP north star (90-day):** NL-to-canvas — user types what they want, system builds a working pipeline. Show the magic of NL interpretation first. Reliability and enterprise polish are phase 2.

---

## Requirements

- R1. **NL-to-canvas pipeline builder**: User types a goal in plain English (e.g., "follow up with leads who haven't replied in 7 days"). The system interprets the goal, selects relevant capabilities from the registry, composes them into a visual pipeline on the canvas, and presents it for user review before activation. The user can adjust the pipeline by dragging, reconnecting, or swapping agents.

- R2. **Readable agent pipeline visualization**: Every pipeline node shows a plain-English milestone label (e.g., "Step 1: Read emails — Found 12 unread"). Each edge shows green/red status. Each agent that requires a decision shows a mini approval checkpoint. The user sees a collaborative workspace feel — like a shared document where agents contribute visibly.

- R3. **Capability Registry with structured inputs**: The registry exposes capabilities with typed input schemas. When the NL layer needs to satisfy a capability's input requirements, it prompts the user directly for each missing field — not through an opaque AI extraction step. The `inferInputs` contract is a direct user-prompt flow, not a circular delegation to the NL layer.

- R4. **Role-based permission grants**: Sensitive capabilities (PAYMENTS, ADMIN, EXECUTE_CODE) are gated by an explicit `CapabilityGrantRequest` flow. An admin must approve capability access for a user. The approval UI shows what the user is requesting access to and why. Users cannot self-grant privileged capabilities.

- R5. **Human-in-the-loop approval checkpoints**: At decision nodes where an agent wants to take a consequential action (sending 47 emails, updating CRM records, making a payment), the pipeline pauses and surfaces a clear approval modal: "Alex the agent wants to send this email to 47 people. Approve, Edit, or Cancel." The user sees exactly what the agent plans to do, in plain English.

- R6. **Readable reasoning trace per pipeline run**: Every pipeline execution emits a trace showing what each agent did. The trace is a scrolling timeline of milestone cards — not raw LLM tokens. Consecutive observations are collapsed. The user sees a narrative: "Read emails → Identified 3 leads → Drafting follow-up email → Awaiting your approval." Maximum 500 rendered events with virtual scrolling.

- R7. **Reliable execution with visible failure states**: Every tool call is wrapped in retry middleware. Failures are surfaced as red status on the affected pipeline node with a one-line explanation. Partial failures don't silently cascade — downstream agents receive explicit `{skipped: true, partialInputs: [...]}` signals.

- R8. **GDPR retention with automated enforcement**: Reasoning traces are retained for 30 days (standard) or 90 days (flagged). A nightly cron job deletes traces past their retention window. Retention policy is enforced by infrastructure, not by convention.

- R9. **MCP integration for app connectivity**: The system connects to Zapier's MCP server (8,000+ integrations) via bearer token. Users authenticate once and their connected apps become available as capability sources in the canvas.

- R10. **Onboarding import path**: Users can connect an existing Zapier account and the system reads their active Zaps, then offers to create equivalent AgentOS agent pipelines from them. This reduces time-to-first-agent from "build from scratch" to "review and activate."

---

## Success Criteria

- A non-technical user can type a goal, see a working pipeline on the canvas, make one adjustment, and activate it — in under 10 minutes.
- The pipeline visualization is readable by a business user with no technical training — no jargon, plain English milestones only.
- Sensitive actions always pause for explicit human approval before executing.
- When an agent fails, the user sees a clear red status and a one-line explanation — not a raw error.
- Traces auto-delete after 30/90 days with no manual intervention.
- A user who imports their Zapier account gets a working agent pipeline in under 5 minutes.

---

## Scope Boundaries

- **Not in MVP:** Enterprise SSO, team collaboration with multiple simultaneous editors, mobile-native canvas (responsive web only), Zapier import beyond reading active Zaps (write-back, active Zaps only).
- **Not in MVP:** Full prompt engineering UI — the NL layer handles interpretation; users can adjust the canvas but not edit raw prompts.
- **Not in MVP:** Multi-tenant isolation. MVP is single-org.
- **Not in MVP:** Custom capability creation UI. Users use pre-registered capabilities only.

---

## Key Decisions

- **NL-to-canvas first, reliability second**: MVP bets on the NL interpretation magic as the differentiator. Reliability infrastructure (DOC-03 middleware) is built but not the headline feature. If the NL interpretation doesn't work, the product doesn't work — so it gets the most weight.
- **Canvas as the trust layer**: The canvas is not just a workflow builder — it's how users understand and trust agents. Pipeline visualization (R2) and reasoning traces (R6) are the primary trust mechanisms, not raw LLM transparency.
- **Approval as the default for consequential actions**: PAYMENTS, ADMIN, and EXECUTE_CODE capabilities always require explicit approval. The permission grant flow (R4) gates access; the approval checkpoint (R5) gates execution.
- **inferInputs is user-prompt, not AI extraction**: The NL layer prompts the user directly for capability input fields. This is more reliable, more trustworthy, and better UX than attempting autonomous field inference.

---

## Architectural Influences

The following patterns from [AgentScope](https://github.com/agentscope-ai/agentscope) (`github.com/agentscope-ai/agentscope`) informed several requirements and should guide implementation. The repo is a production-ready Python async agent framework with essential abstractions that work with rising model capability. Implementers should read the source to validate pattern details before applying them.

- **Bounded execution**: Agents should have a max_iterations limit with a structured summarizing fallback when bounds are reached — not unlimited loops. Retry middleware (R7) should include iteration caps so agents cannot spiral indefinitely.

- **Structured reasoning schema**: Long-running agent memory should follow a compressed schema (task_overview, current_state, important_discoveries, next_steps) rather than raw LLM output. Reasoning traces (R6) should similarly follow a structured event schema — not raw token dumps — to keep traces readable at scale.

- **MsgHub-style coordination**: Multi-agent broadcast coordination via a context manager pattern (any agent's output auto-broadcasts to all participants) provides a clean declarative model for canvas agent coordination (R2).

- **Real-time event streaming**: Structured ServerEvent types (AGENT_READY, AGENT_ENDED, RESPONSE_CREATED, ERROR) with is_last_chunk flags enable real-time UI updates without polling. Relevant to R2 pipeline visualization and R6 trace streaming.

- **Graceful degradation**: Retry studio hook calls 3x, then log a warning and continue — not every failure is fatal. Retry middleware (R7) and MCP integration (R9) should follow this pattern so transient failures don't block pipelines.

- **StateModule for checkpoint/resume**: Nested state serialization enables multi-agent workflow checkpointing and resume. Not MVP scope but worth architecting for post-MVP stateful multi-agent sessions.

---

## Dependencies / Assumptions

- MCP server (Zapier) is available and the bearer token authentication flow works as specified in DOC-02.
- The LLM provider supports 120-second timeouts for complex reasoning tasks.
- The canvas UI (React Flow) can be extended to support the milestone card + approval checkpoint + reasoning trace timeline hybrid UX described in R2.
- GDPR deletion cron can run as a Vercel cron job or equivalent serverless cron.

---

## Outstanding Questions

### Resolve Before Planning

*All resolved during brainstorm:*

- **R1/R3** [Decision] **Both input modes available**: The NL layer supports both upfront and lazy per-step input collection. The user chooses the mode at the start of the NL-to-canvas session. Upfront is default for simple goals; lazy is default for complex exploratory goals.

- **R4** [Decision] **Org-level admin settings**: Admin is not a person — it is a role assigned at the org level via an admin console. The org owner (first user) has admin privileges by default and can designate other users as admins. Capability grants require a current admin to approve.

- **R4** [Decision] **In-app notification only, manual response required**: When a user requests privileged access, the admin sees the request in-app. There is no email or push notification for grant requests. The admin must manually approve or deny. No auto-deny timeout. If the admin doesn't respond, the request stays pending indefinitely.

### Deferred to Planning

- **R2** [Technical] **Canvas node design system**: The hybrid milestone/status/timeline/approval UX needs a concrete node component spec. This is a significant UI design decision that affects how agents are rendered on the canvas.
- **R6** [Technical] **Event aggregation tuning**: DOC-05 specifies 500ms event aggregation window and MAX_RENDERED_EVENTS = 500. These numbers need user research to validate — too aggressive collapses useful detail, too conservative overwhelms.
- **R6** [Technical] **Trace encryption at rest**: HMAC-SHA256 signing is specified for integrity. Does the trace need encryption at rest, or is signing sufficient? This affects key management complexity.
- **R9** [Needs research] **Zapier MCP rate limits**: What are Zapier's MCP rate limits? Does the reliability middleware need burst handling or quota management at the app level?
- **R10** [Technical] **Zapier import implementation**: Reading active Zaps from Zapier requires their API. Is this documented? Is there a Zapier partner API for this?
- **R1** [Technical] **LLM prompt for NL interpretation**: What prompt/instruction tuned LLM does the NL layer use to convert user goals to capability selections? This is the core algorithm and needs dedicated prompt engineering work.

---

## Next Steps

→ `/ce:plan` for structured implementation planning
