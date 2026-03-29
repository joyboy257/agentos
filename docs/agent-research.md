# AgentOS Research: Tool Catalog Strategy

**Date:** 2026-03-29
**Purpose:** Synthesize research findings into actionable architecture decisions

---

## Executive Summary

AgentOS is not a tool integration company. MCP commoditizes integrations. The moat is the **NL interpretation layer that masks complexity**, the **reliability infrastructure that makes agents trustworthy**, and the **UX that makes agents feel like trusted assistants**, not like "talking to a computer."

The comparison to OpenClaw and Siri is apt: users don't want to know what an agent is. They want to describe what they want and have it done. The NL layer is the product. The tools are just how it executes.

---

## Key Research Findings

### 1. MCP Has Won the Integration Layer

Model Context Protocol (MCP) is emerging as the USB-C of AI agent tool integration.

- Zapier exposes an MCP server with 8,000+ integrations
- Make.com exposes an MCP server
- n8n exposes an MCP server
- These integrations handle OAuth2, token refresh, retries, and API differences automatically

**Implication:** AgentOS does NOT need to build integrations. Connect to Zapier's MCP server and have 8,000+ tools available on day one. The differentiation is NOT the number of integrations — it's how well the NL layer queries, selects, and composes them.

### 2. The Flywheel Architecture

Tool catalogs grow organically from observed usage, not upfront design:

```
1. Build pure primitives (atomic tools with create/read/update/delete parity)
2. Users ask for things not explicitly built
3. Agent composes primitives OR fails (failing reveals the gap)
4. Observe patterns in what users/agents combine
5. Common compositions get promoted to domain tools (efficiency shortcuts)
6. Rare but valid compositions remain as primitives (still work)
7. Repeat
```

**Implication:** The platform team's job is NOT to anticipate every tool. It's to build the right primitives and observe what emerges.

### 3. Number of Tools Is a Trap

Platforms compete on integration counts. It's a trap.

- Head (80% of usage): Gmail, Slack, Google Workspace, CRM, Calendar, Spreadsheets, Webhooks
- Long tail (20%): everything else

**20 tools executed flawlessly** with retry logic, timeouts, proper OAuth, and observability outperforms 500 tools with inconsistent behavior every time.

### 4. The Real Engineering Cost Is Hidden

| What's Actually Hard | % of Engineering Time |
|---------------------|---------------------|
| OAuth2 flows + token refresh + credential rotation | ~30% |
| Retry middleware with exponential backoff + jitter | ~20% |
| Error translation (raw API errors → LLM-readable messages) | ~15% |
| Webhook security (signature validation, rate limiting) | ~15% |
| Observability (tool call logging, failure alerting) | ~15% |
| The actual API call | ~5% |

**Most agent platforms build the 5% and skip the 95%.** This is why they fail.

### 5. The Sweet Spot: AI + Automation

The winning pattern is NOT "AI does everything."

The winning pattern IS:
- **AI interprets unstructured data** — emails, documents, voice, images
- **Deterministic automation handles the mechanical steps** — create row, send message, update status
- **Human-in-the-loop approves the irreversible ones** — send email, process payment

### 6. Triggers Are Infrastructure, Not a Feature

Production architecture is event-driven:

```
Webhook (external event)
    ↓
Agent begins execution
    ↓
Async processing (LLM calls take variable time)
    ↓
Webhook callback when complete
```

### 7. Observability Is the Trust Layer

Users need to see: what the agent did, what it decided, why it made each choice, what succeeded and what failed. Without this, users can't trust the system.

---

## The Competitive Moat

Despite MCP commoditizing integrations, agents are still not friendly for the masses. People use ChatGPT as a chat window. But people should be using agents as much as possible.

The NL layer that masks the inner workings is what made OpenClaw a runaway success. It was what Siri was marketed to be, but failed to become.

**The three durable moats:**

1. **NL Interpretation Layer** — how well it queries the capability catalog, resolves ambiguity, generates execution plans
2. **Reliability Infrastructure** — retries, timeouts, error translation, observability (the 95% most platforms skip)
3. **Human Approval UX** — how the system surfaces "this will be sent" and lets users approve, edit, or reject

---

## Technical Recommendations

### Build Order

1. **MCP Client** — Connect to Zapier's MCP server. 8,000+ integrations immediately.
2. **Reliability Middleware** — Every tool gets: 3 retries with backoff, custom error messages, timeout enforcement, structured logging
3. **Webhook Infrastructure** — Event-driven triggers first, not "user clicks Run"
4. **Observability Dashboard** — Show reasoning traces, tool call history, success/failure rates
5. **Human Approval Checkpoints** — `interrupt()` equivalent for irreversible actions

### Architecture Pattern

```
User types goal
    ↓
NL Interpretation Layer (queries capability registry)
    ↓
MCP Client → Zapier MCP Server (8,000+ tools)
    ↓
Tool execution with retry/error middleware
    ↓
Human approval checkpoint (for send/write actions)
    ↓
Structured output + reasoning trace
    ↓
Plain English summary ("Sent 12 emails, held 5 for your review")
```

### Capability Registry (Not Hardcoded Prompts)

Every capability is explicitly defined:

```typescript
const CAPABILITIES = {
  "email:read": {
    description: "Read emails from Gmail",
    triggers: ["read my emails", "check my inbox", "what emails came in"],
    tools: ["gmail.read"],
    outputSchema: EmailReadOutput
  },
  "email:draft_reply": {
    description: "Draft a personalized reply to an email",
    triggers: ["reply to", "draft a response", "write back"],
    tools: ["llm"],
    inputSchema: { email: Email, context: string }
  },
  "condition:if_no_reply": {
    description: "If no reply within X days, trigger a follow-up",
    triggers: ["if they don't reply", "follow up if"],
    // Requires delay + condition primitives
  }
}
```

The NL interpretation layer queries this registry first — "what capabilities match this goal?" — before generating an execution plan.

### Minimum Viable Tool Pattern

Every tool requires:

```typescript
tool(
  "read_item",
  "Read an item by key",
  { key: z.string().describe("Item key") },
  async ({ key }) => {
    const item = await storage.get(key);
    return {
      content: [{
        type: "text",
        text: item ? JSON.stringify(item, null, 2) : `Not found: ${key}`,
      }],
      isError: !item,  // Required for reliability
    };
  }
)
```

Required elements: descriptive name, description of what it does (not when to use it), typed input schema, rich output with verification info, error flag.

---

## The OpenClaw / Siri Comparison

OpenClaw succeeded because:
- It masked the complexity of what it was doing
- Users described what they wanted in plain language
- The system figured out how to do it
- It showed what it was going to do before doing it

Siri failed because:
- It could only do a fixed set of predefined things
- When it couldn't do something, it just said "I can't do that"
- It didn't explain what it was doing
- It didn't learn or improve based on failures

AgentOS is the product Siri was marketed to be.

---

## What Agents Need to Be Trustworthy

1. **Reliability** — Every tool call has retry logic, timeout, graceful degradation. Never silently fails.
2. **Visibility** — Users can see what the agent decided and why, not just the final result.
3. **Predictability** — The same request produces the same outcome. No randomness in critical paths.
4. **Honesty** — "I can't do that" with an explanation of what's missing, not a hallucinated response.
5. **Human-in-the-loop** — For irreversible actions (send email, post publicly, process payment), the user approves first.

---

## Research Sources

- Anthropic Claude SDK Documentation (MCP tool design, session management)
- OpenAI Agents SDK Documentation (agent handoffs, function calling)
- LangGraph Documentation (state management, checkpointing, human-in-the-loop)
- Zapier MCP Server Documentation (8,000+ integrations)
- Make.com Developer API Documentation (webhook triggers, scheduling)
- n8n Workflow Automation Documentation (retry patterns, observability)
- ActivePieces Documentation (trigger architecture, polling patterns)
- Context7 Library Research: LangGraph, OpenAI API, Anthropic SDKs, Zapier, Make.com, n8n
