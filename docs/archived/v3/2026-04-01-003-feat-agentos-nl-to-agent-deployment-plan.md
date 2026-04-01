# Plan: NL-to-Agent Deployment

**Date:** 2026-04-01
**Type:** feat
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v4 — Pillar 1: NL-to-Deployment

---

## Goal

Allow a non-technical user to describe what they want in plain English — e.g., "I want an agent that handles my inbound customer emails and escalates anything urgent to me" — and watch a complete agent configuration get built in real time, shown as a visual preview before activation.

This is the primary "wow moment" during onboarding. The user types a sentence; they watch their team get built.

---

## Problem Frame

Every existing agent platform makes users configure agents via:
- Dropdown menus and toggles (Zapier-style) — too limiting
- JSON/YAML config files — developer-only
- Template selection with no customization — rigid

**Maria doesn't think in integrations or tools.** She thinks: "handle my emails, tell me if something's wrong." The NL interface translates her intent into a structured agent configuration without requiring her to specify implementation details.

The real-time preview is the trust-building mechanism. She sees exactly what will be built before she clicks "Activate."

---

## Requirements Traceability

| Requirement | Source |
|---|---|
| NL-to-agent deployment | PRD v4 — Pillar 1 |
| Real-time preview before activation | PRD v4 — MVP Feature 2 |
| No terminal/code/JSON for non-technical users | PRD v4 — Core Principle |
| Watch team get built in real time | PRD v4 — The Wow Moment |

---

## Non-Goals

- Full natural language programming (not a code generation engine)
- Implementing the agent runtime (delegated to Durable Execution plan)
- Multi-agent team generation in a single NL turn (deferred to Phase 3)

---

## High-Level Design

### Intent → Config Pipeline

```
User Input: "I want an agent that handles my inbound customer emails"
    │
    ▼
┌─────────────────────────────────────────────┐
│  NL Intent Parser (GPT-4o)                  │
│  ─────────────────────────────────────────  │
│  1. Classify intent type                    │
│     - Email handling                        │
│     - Calendar management                    │
│     - Research / data aggregation           │
│     - Customer support                      │
│     - Custom / multi-purpose                │
│                                             │
│  2. Extract structured fields:             │
│     - trigger: inbound_email | scheduled    │
│     - escalation_threshold: string | null   │
│     - tools: [read_email, send_email, ...] │
│     - schedule: cron | on_event | continuous │
│     - persona: string                       │
│     - approval_required: boolean            │
│                                             │
│  3. Map to agent config schema              │
│     - name, description, instructions       │
│     - tool_whitelist                        │
│     - trigger_config                        │
│     - escalation_rules                       │
│     - memory_enabled: boolean               │
└─────────────────────────────────────────────┘
    │
    ▼
Agent Config JSON (internal)
    │
    ▼
┌─────────────────────────────────────────────┐
│  Preview Renderer (Canvas)                  │
│  ─────────────────────────────────────────  │
│  Shows:                                     │
│  - Agent card with name + avatar            │
│  - Tool icons that will be enabled          │
│  - Trigger schedule or event                 │
│  - Escalation threshold (if any)            │
│  - Agent persona description                │
│  - "Edit" affordances on each section       │
└─────────────────────────────────────────────┘
    │
    ▼
User clicks "Activate" → Agent created in DB
```

### Intent Classification Taxonomy

```
EMAIL_HANDLING
  triggers: "email", "inbox", "respond to emails"
  default_tools: [read_email, send_email, search_emails]
  escalation_triggers: ["urgent", "refund", "complaint", escalation_keywords]

CALENDAR_MANAGEMENT
  triggers: "calendar", "schedule meeting", "appointments"
  default_tools: [read_calendar, create_event, send_calendar_invite]
  escalation_triggers: [conflicting_events, no_availability]

CUSTOMER_SUPPORT
  triggers: "customer", "support", "help desk", "tickets"
  default_tools: [read_support_tickets, send_email, create_task]
  escalation_triggers: [unresolved_24h, customer_explicit_escalation]

RESEARCH
  triggers: "research", "find information", "monitor", "track"
  default_tools: [web_search, read_url, store_findings]
  escalation_triggers: [nothing_found_after_n_attempts]

GENERAL_PURPOSE
  triggers: anything else
  default_tools: []
  → Prompt user: "What tools should this agent have access to?"
```

### The Edit-before-Activate Loop

The preview is interactive. Before clicking "Activate," Maria can:

1. **Change the name** — click the agent name, type a new one
2. **Add/remove tools** — toggle tool chips
3. **Adjust escalation** — type escalation keywords or select from suggestions
4. **Change schedule** — pick frequency from dropdown
5. **Edit instructions** — textarea with live preview of persona

Each edit is reflected immediately in the preview. The agent config is rebuilt in real time as she edits.

---

## Implementation Units

### Unit 1: NL Intent Parser

**Goal:** Given a free-text user description, return a structured `AgentConfig` object.

**Requirements:** Advances PRD v4 Pillar 1, MVP Feature 2

**Dependencies:** None (stateless, no DB)

**Files:**
- `app/lib/nl/parser.ts` — intent classification + field extraction
- `app/lib/nl/taxonomy.ts` — intent type constants + escalation keyword defaults
- `app/lib/nl/prompts.ts` — GPT-4o prompt templates
- `app/lib/nl/__tests__/parser.test.ts` — unit tests

**Approach:**

```
Input: "I want an agent that handles my inbound customer emails"
Output: {
  intent_type: "EMAIL_HANDLING",
  name: "Email Agent",
  description: "Handles inbound customer emails, escalates urgent matters",
  tools: ["read_email", "send_email", "search_emails"],
  trigger: { type: "scheduled", cron: "*/15 * * * *" },  // every 15 min
  escalation: {
    enabled: true,
    keywords: ["urgent", "refund", "complaint", "cancelled"],
    escalate_to_human: true
  },
  persona: "You are a helpful email agent that handles customer inquiries...",
  memory_enabled: true
}
```

**GPT-4o Prompt Design:**

```
System: You are an AI agent configuration translator. Given a user's plain-English
description of what they want an AI agent to do, extract a structured configuration.
Be conservative — if the user says "handle my emails" assume read + send + search.
If they mention escalation explicitly, capture it. If not, use defaults for the intent type.

Respond ONLY with valid JSON matching this schema:
{
  "intent_type": "EMAIL_HANDLING" | "CALENDAR_MANAGEMENT" | "CUSTOMER_SUPPORT" | "RESEARCH" | "GENERAL_PURPOSE",
  "name": string | null,  // null = generate from intent_type
  "description": string,
  "tools": string[],
  "trigger": { "type": "scheduled" | "on_event" | "continuous", "cron"?: string, "event"?: string },
  "escalation": { "enabled": boolean, "keywords": string[], "escalate_to_human": boolean },
  "persona": string,
  "memory_enabled": boolean
}

Default escalation keywords by intent_type:
- EMAIL_HANDLING: ["urgent", "refund", "complaint", "cancelled order", "boss"]
- CALENDAR_MANAGEMENT: ["conflict", "no availability", "overlapping"]
- CUSTOMER_SUPPORT: ["unresolved 24h", "customer explicitly asked for manager"]
- RESEARCH: []
- GENERAL_PURPOSE: []

Never ask follow-up questions. Make reasonable assumptions and include them.
The user can edit everything before activation.
```

**Patterns to follow:** Existing GPT-4o API calls in codebase (check `app/lib/`)

**Test scenarios:**
- "handle my emails" → EMAIL_HANDLING, correct default tools
- "I need someone to manage my calendar and schedule meetings" → CALENDAR_MANAGEMENT
- "track my competitors' pricing" → RESEARCH
- "handle customer support tickets" → CUSTOMER_SUPPORT
- "I want an agent that does everything" → GENERAL_PURPOSE with empty tools
- "handle emails but NEVER escalate anything" → escalation.enabled = false
- Intent type is case-insensitive
- Empty string → returns error with user-friendly message

**Verification:** Unit tests pass. JSON output schema-valid. Intent classification accuracy validated against test corpus.

---

### Unit 2: Agent Config Schema + Preview Renderer

**Goal:** Define the internal `AgentConfig` schema and build the React preview component that shows Maria what will be built before she activates.

**Requirements:** Advances PRD v4 Pillar 1, MVP Feature 2

**Dependencies:** Unit 1 (parser must exist before preview is meaningful)

**Files:**
- `app/types/agent-config.ts` — TypeScript type definitions
- `app/app/components/agent/AgentPreview.tsx` — preview card component
- `app/app/components/agent/AgentConfigEditor.tsx` — inline edit component
- `app/app/components/agent/ToolChips.tsx` — toggle-able tool chip UI
- `app/app/components/agent/__tests__/AgentPreview.test.tsx`

**Approach:**

```typescript
// app/types/agent-config.ts

export type IntentType =
  | 'EMAIL_HANDLING'
  | 'CALENDAR_MANAGEMENT'
  | 'CUSTOMER_SUPPORT'
  | 'RESEARCH'
  | 'GENERAL_PURPOSE';

export type TriggerType = 'scheduled' | 'on_event' | 'continuous';

export interface EscalationConfig {
  enabled: boolean;
  keywords: string[];
  escalate_to_human: boolean;
}

export interface TriggerConfig {
  type: TriggerType;
  cron?: string;       // e.g., "*/15 * * * *"
  event?: string;      // e.g., "inbound_email"
  interval_ms?: number; // for continuous
}

export interface AgentConfig {
  intent_type: IntentType;
  name: string;
  description: string;
  tools: string[];       // tool IDs from tool registry
  trigger: TriggerConfig;
  escalation: EscalationConfig;
  persona: string;       // system prompt for the agent
  memory_enabled: boolean;
  idempotency_key_prefix: string; // auto-generated ULID prefix
  exit_reason: ExitReason; // inherited from runtime
  created_at: string;
  updated_at: string;
}
```

**Preview Component UX:**

```
┌─────────────────────────────────────────────┐
│  [Avatar]  Email Agent           [Edit ✏️]  │
│                                             │
│  "Handles inbound customer emails and       │
│   escalates anything urgent"               │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  ⏰  Every 15 minutes                       │
│                                             │
│  🔧  Tools                                  │
│  [📧 Read Email] [📤 Send Email] [🔍 Search]│
│                                             │
│  ⚠️  Escalates: urgent, refund, complaint   │
│                                             │
│  🧠  Memory: Enabled                        │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  [Cancel]              [Activate ▶️]       │
└─────────────────────────────────────────────┘
```

**Patterns to follow:** Existing React component patterns in `app/app/components/`

**Test scenarios:**
- Preview renders correctly for EMAIL_HANDLING config
- Preview renders correctly for CALENDAR_MANAGEMENT config
- Edit mode opens on name click
- Tool chips toggle correctly (remove/add tools)
- Escalation keywords can be added/removed
- Cancel returns to previous state
- Activate button is disabled until name is non-empty

**Verification:** Visual QA + unit tests. Component renders without console errors.

---

### Unit 3: NL-to-Agent API Endpoint

**Goal:** Expose a POST endpoint that accepts free text and returns an `AgentConfig` — used by the Canvas UI when the user submits the NL description.

**Requirements:** Advances PRD v4 Pillar 1, MVP Feature 2

**Dependencies:** Unit 1 (parser), Unit 2 (types)

**Files:**
- `app/app/api/nl/deploy/route.ts` — POST handler
- `app/app/api/nl/deploy/__tests__/route.test.ts`

**Endpoint:**

```
POST /api/nl/deploy

Request:
{ "description": "I want an agent that handles my inbound customer emails" }

Response 200:
{
  "config": AgentConfig,
  "warnings": string[]   // e.g., "No tools specified for GENERAL_PURPOSE intent"
}

Response 400:
{ "error": "Could not parse description", "detail": string }
```

**Approach:**
- Call GPT-4o via `app/lib/nl/parser.ts`
- Validate output against `AgentConfig` schema
- Return structured config or error
- No DB write at this stage — this is purely translation
- Rate limit: 10 requests/minute per user to prevent prompt injection abuse

**Patterns to follow:** Existing API route patterns in `app/app/api/`

**Test scenarios:**
- Valid description returns 200 with valid config
- Empty string returns 400
- Very long description is truncated before sending to GPT-4o
- Rate limit returns 429

**Verification:** API tests pass. Endpoint responds within 3 seconds for typical input.

---

### Unit 4: Edit & Activate Flow

**Goal:** Wire the preview to a real agent creation — when Maria clicks "Activate," the `AgentConfig` is validated, written to the DB, and the agent is started immediately.

**Requirements:** Advances PRD v4 Pillar 1, MVP Feature 2, Feature 9 (agent cards)

**Dependencies:** Unit 2 (preview), Durable Execution plan (agent runtime)

**Files:**
- `app/app/api/agents/route.ts` — POST creates agent from config
- `app/lib/agents/factory.ts` — constructs runnable agent from config
- `app/app/api/agents/[agentId]/start/route.ts` — starts the agent
- `app/app/components/agent/__tests__/AgentActivation.test.tsx`

**Approach:**

```
User clicks "Activate" in Preview
    │
    ▼
POST /api/agents { config: AgentConfig }
    │
    ▼
1. Validate config schema (zod)
2. Check user has required OAuth connections for tools
3. Write agent record to DB
4. Create initial run record
5. Enqueue first job in BullMQ
    │
    ▼
Response: { agentId, runId, status: "starting" }
    │
    ▼
Frontend navigates to agent card on canvas
Agent card shows "Starting..." → "Running 🟢"
```

**OAuth Gate:** If the config requests Gmail but the user hasn't connected Gmail OAuth, show:

```
┌──────────────────────────────────────┐
│  ⚠️  Gmail not connected            │
│                                      │
│  This agent needs Gmail access.      │
│  [Connect Gmail]   [Cancel]         │
└──────────────────────────────────────┘
```

**Patterns to follow:** Existing API route patterns + BullMQ job creation from Durable Execution plan

**Test scenarios:**
- Valid config creates agent in DB and returns agentId
- Missing required fields returns 400 with field-level errors
- Agent without OAuth for required tool shows OAuth gate modal
- BullMQ job is enqueued on activation
- Duplicate activation (double-click) is idempotent — returns existing agentId

**Verification:** Integration test: NL description → API → agent in DB → job in BullMQ queue.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| User describes something too vague | Return GENERAL_PURPOSE with no tools, prompt user to specify |
| User describes a multi-agent team | Parse first agent, show "Add another agent" option (Phase 3 scope) |
| GPT-4o returns malformed JSON | Retry once, then return user-friendly error "Couldn't understand that, can you rephrase?" |
| User has no OAuth connected | Show OAuth gate before activation |
| Name is empty after edit | Disable Activate button, show inline validation error |
| Description is all non-ASCII characters | Accept and pass through — GPT-4o handles it |

---

## Dependencies and Sequencing

```
Unit 1 (NL Parser)
    │
    ├── Unit 2 (Config Schema + Preview) ← depends on Unit 1 types
    │
    └── Unit 3 (API Endpoint) ← depends on Unit 1 + Unit 2 types
             │
             └── Unit 4 (Edit & Activate) ← depends on Unit 2 + Durable Execution

Durable Execution plan (Unit 3 from 2026-04-01-002) must land before Unit 4 activation flow is fully testable.
```

**Recommended order:** Unit 1 → Unit 2 → Unit 3 in parallel with Durable Execution → Unit 4

---

## Open Questions (Deferred to Implementation)

| Question | Why Deferred | How Resolved |
|---|---|---|
| Should GPT-4o use function calling or plain text JSON? | Depends on testing — function calling is more reliable but adds latency | Test both, pick based on error rate |
| How do we handle the user's brand/company name in persona? | Requires OAuth to get user profile, or onboarding data | Defer to after OAuth integration |
| What's the max description length? | GPT-4o token limits + UX study | 500 chars with counter |
| Do we support multiple languages? | Initial scope is English-only | Phase 2 if international demand |

---

## Success Criteria

1. A user can type a one-sentence description and see a complete agent preview in under 5 seconds
2. The preview accurately reflects what will be built (verified by QA)
3. All edits in the preview are persisted to the final agent config
4. Activation creates a running agent within 10 seconds
5. The NL parser correctly classifies 90%+ of realistic user descriptions (measured by test corpus)
