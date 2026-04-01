# Harness Architecture Reference

**Date:** 2026-04-01
**Status:** Internal — Engineering
**Classification:** Not for external sharing
**Source:** Claude Code v2.1.88 analysis (sanbuphy/claude-code-source-code) + AgentOS context adaptation

---

## Purpose

This document is the internal engineering reference for AgentOS's harness architecture. It extracts the **principles** from Claude Code's design — not the code, not the file names — and describes how each principle is **adapted** for a multi-tenant SaaS product serving non-technical business users.

**The rule:** If the adaptation requires changing the principle because our context is fundamentally different, we change the principle. We are not building a CLI coding harness. We are building a business data harness with a completely different trust model.

---

## The Fundamental Difference

Claude Code runs on the user's machine. AgentOS runs on our servers.

This sounds obvious. It is actually the most important architectural decision in the entire system.

| Dimension | Claude Code | AgentOS |
|-----------|-------------|---------|
| Execution environment | User's local machine | Our cloud servers |
| Resource access | Full filesystem, full environment | OAuth to third-party APIs (Gmail, Calendar) |
| Trust model | User trusts themselves | Maria trusts us with her business data |
| Audit destination | Anthropic's telemetry servers | Maria's own Postgres (tenant-isolated) |
| Permission scope | Entire machine | OAuth-scoped to specific actions |
| Agent identity | Single user, single machine | Multiple users, shared infrastructure |
| Compliance burden | None | GDPR, potential SOC 2 |

**Consequence:** Every pattern that works because Claude Code runs locally must be re-examined for AgentOS. The permission system, the memory system, the telemetry — all of it changes when the agent is a cloud service accessing a business owner's Gmail, not a CLI tool on a developer's laptop.

---

## The 5-Layer Agent Architecture

Claude Code's harness is organized around a core LLM loop with layers that plug into it. We use the same 5-layer model, adapted:

```
┌─────────────────────────────────────────────────────────────┐
│                     PERSONA LAYER                           │
│  System prompt assembled from:                              │
│  - Maria's NL description → distilled instructions         │
│  - Approved contact list (enforced at execution, not just prompt) │
│  - Confirmed memory facts (Phase 2)                       │
│  - Tier 1 auto-approval patterns (Phase 2)                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    PLANNER LAYER                             │
│  LLM reasons: what to do next                              │
│  Emits: decision step with full reasoning text              │
│  Evaluates: escalation conditions                          │
│  → If escalate: pause, emit escalation step                │
│  → If auto-approve (Phase 2): execute + log decision      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     TOOL LAYER                             │
│  Tool dispatcher: calls tools in sequence/parallel         │
│  Streaming: tools fire during LLM token generation        │
│  Concurrency: partitioned by safety (read vs write)       │
│  Rate limiting: per-tool, per-user                       │
│  Logging: every call → immutable audit trail              │
│  ENFORCEMENT: approved contact list enforced at this layer │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   MEMORY LAYER                             │
│  Working memory: ephemeral, per-run                      │
│  Checkpoints: durable, per-step, Postgres              │
│  Idempotency: ULID-based keys prevent double execution  │
│  Long-term (Phase 2): mem0 + Qdrant                   │
│  Hallucination guard (Phase 2): fact verification    │
│  Privacy: ALL memory is Maria's. Never leaves her tenant. │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   SCHEDULER LAYER                          │
│  BullMQ: cron-based scheduled wakes                   │
│  Heartbeat: periodic keepalive + checkpoint           │
│  PROACTIVE (Phase 2): Gmail push → immediate wake    │
│  Privacy: Maria's email never stored. Only metadata. │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Tool System — Adapted

### Claude Code's Approach

Claude Code has 40+ tools (FileReadTool, BashTool, WebSearchTool, etc.). Every tool implements a standard interface:

```typescript
interface Tool {
  validateInput(): ValidationResult
  checkPermissions(): PermissionResult
  call(): Promise<ToolResult>
  renderToolUseMessage(): ReactNode   // How it appears in the UI
  prompt(): string                    // LLM-facing description
}
```

Tools have capability flags:
- `isConcurrencySafe()` — can run in parallel with other tools
- `isReadOnly()` — doesn't modify state
- `isDestructive()` — potentially destructive operation

Permission flow: `validateInput()` → PreToolUse Hooks → Permission Rules → Interactive Prompt (if no rule matches) → `checkPermissions()` → APPROVED → `call()`

### AgentOS's Adaptation

We don't have a filesystem. We have OAuth to third-party APIs. The tool system adapts accordingly:

**Tool types (Phase 1):**

| Tool | Capability | Concurrency |
|------|-----------|-------------|
| `gmail_read` | Read-only | Parallel-safe |
| `gmail_search` | Read-only | Parallel-safe |
| `gmail_send` | Write | Serial per agent (concurrency-unsafe) |
| `gmail_draft` | Write | Serial per agent |

**The critical difference:** Claude Code's permission system asks the user interactively ("Allow Read file? [Yes/No]"). Our permission system enforces constraints **without asking** — because Maria doesn't want to be interrupted every time her agent reads an email, and because we can't interrupt her while she's sleeping.

**This means the permission model inverts:**

| Claude Code | AgentOS |
|-------------|---------|
| Ask → User approves → Tool executes | Tool checks Approved Contact List → If not approved: escalate |
| Interactive permission prompt | Pre-approved constraint enforcement |
| `alwaysAllowRules`, `alwaysDenyRules` | `approved_contacts` (explicit allow list), escalation triggers |

### The Approved Contact List — Our Version of Permission Scopes

In Claude Code, permission scopes are broad ("Allow file system access"). In AgentOS, they're specific:

```typescript
interface ApprovedContactList {
  user_id: string
  contacts: ApprovedContact[]
}

interface ApprovedContact {
  type: 'email' | 'domain'
  value: string                    // "lead@hitech.com" or "@hitech.com"
  added_at: string
  added_by: 'maria' | 'agent'     // Did the agent suggest this, or Maria add it manually?
  auto_approved: boolean           // Was this added via a "always approve this" rule?
}
```

**Enforcement at the Tool Layer:**

```typescript
// BEFORE gmail_send executes:
async function gmail_send(params: { to: string[]; subject: string; body: string }) {
  // 1. Check every recipient against approved contact list
  for (const recipient of params.to) {
    const approved = await checkApprovedContact(userId, recipient)
    if (!approved) {
      // 2. If not approved, ESCALATE — don't execute
      await emitEscalation({
        reason: `Recipient ${recipient} not in approved contacts`,
        proposed_action: { type: 'send_email', ...params },
        can_auto_approve: false
      })
      return { status: 'escalated', escalation_id: ... }
    }
  }
  // 3. All recipients approved — execute
  return gmailAPI.send(params)
}
```

This is fundamentally different from Claude Code's interactive prompt model. We pre-authorize constraints; Claude Code asks in real time.

**Phase 2 extension:** "Always approve emails to @domain.com" — Maria sets a custom rule. This becomes a persistent approved contact entry, not an interactive permission.

---

## Layer 2: Memory System — Adapted

### Claude Code's Three-Layer Memory

Claude Code uses a three-layer memory architecture:

```
Working Memory (messages array)
    │
    │  ~13,000 tokens below context limit
    ▼
Context Compaction (autoCompact)
    │  Compresses: discards intermediate reasoning chains
    │  Keeps: distilled facts + summaries
    ▼
Long-Term Memory (memdir/)
    │  ~/.claude/projects/<path>/memory/
    │  Persists across sessions
    ▼
Session Memory (extractMemories.ts)
    │  Forked agent extracts facts at end of session
    │  Writes to memory/ directory
    ▼
```

**Key mechanism — `extractMemories.ts`:**

Claude Code uses a **forked agent** to extract memories at the end of each session. It runs a perfect fork of the main conversation (sharing prompt cache), asks the LLM to distill facts, and writes them to the memory directory.

This is elegant: the extraction agent has the full context of what happened, without the extraction logic contaminating the main agent's reasoning.

### AgentOS's Adaptation

We have three adaptations required:

**1. Working memory is per-heartbeat, not per-session**

Claude Code's working memory spans an entire CLI session — potentially hours of back-and-forth. Our agents have scheduled heartbeat cycles. Working memory resets on each wake cycle (unless we're in PROACTIVE mode, Phase 2).

```typescript
interface WorkingMemory {
  run_id: string
  heartbeat_count: number
  steps: AuditableStep[]           // All steps in this run
  current_reasoning: string       // Live reasoning text
  tokens_used: number
  tokens_remaining: number        // Context window budget
}
```

**2. Context compaction fires at token threshold — adapted**

Claude Code compacts when `usage >= MAX_TOKENS - AUTOCOMPACT_BUFFER_TOKENS - MAX_OUTPUT_TOKENS_FOR_SUMMARY`.

For AgentOS (MVP): Hard stop at token limit — if remaining tokens < estimated tool call + response, pause and escalate.

For Phase 2 (smart compaction): We use a memory extraction approach similar to `extractMemories.ts` — at the end of each heartbeat cycle, a forked agent (or the main agent in a lightweight inference call) extracts distilled facts from the run transcript. These facts go into Maria's long-term memory (Phase 2). The intermediate reasoning chains are discarded.

**This is the key insight from Claude Code's memory architecture that we adopt:** Don't try to compress and retain everything. Extract distilled facts. Discard the reasoning traces after extraction.

**3. Privacy requirement: memory is Maria's, not ours**

Claude Code stores memories in `~/.claude/projects/<path>/memory/` — on the user's machine. We store memories in Maria's Postgres schema, tenant-isolated. Her data never leaves her database.

```typescript
interface MemoryStore {
  // Phase 1: Working memory only
  working_memory: {
    run_id: string
    steps: AuditableStep[]
  }

  // Phase 2: Long-term memory
  long_term_memory: {
    user_id: string                    // Maria's user ID
    memories: EmbeddedFact[]           // Stored in Qdrant (vectors) + Postgres (text)
    facts: LearnedFact[]               // Pending/confirmed/denied by Maria
  }
}
```

---

## Layer 3: Query Engine — Core Loop

### Claude Code's QueryEngine

Claude Code's `QueryEngine.ts` (785KB, ~46,000 lines) is the central state machine. The main loop:

```
User input
    │
    ▼
FetchSystemPrompt() → assemble system prompt
    │
    ▼
Claude API (streaming) → LLM generates tokens
    │
    ▼
Tool calls fire during streaming (StreamingToolExecutor)
    │
    ▼
Results append to messages[]
    │
    ▼
If stop_reason = "tool_use": loop back to API call
If stop_reason = "end_turn": return to user
```

Key components:
- `StreamingToolExecutor`: parallel tool execution during token streaming
- `autoCompact()`: context compression when approaching token limit
- `runTools()`: tool orchestration with concurrency partitioning
- Typed exit reasons: `completed`, `tool_use`, `error`, `max_steps`

### AgentOS's Adaptation

Our `DurableRunner` follows the same loop structure but with different implementations:

```
Scheduled heartbeat (BullMQ)
    │
    ▼
LoadCheckpoint() → restore working memory from Postgres
    │
    ▼
FetchPersona() → assemble system prompt from Maria's config
    │
    ▼
Claude API (streaming SSE) → LLM generates tokens
    │
    ▼
Tool calls fire during streaming → SSE event emitted
    │
    ▼
Checkpoint after every tool result → Postgres
    │
    ▼
If token_limit_exceeded: compact or escalate
If no work to do: SleepTool equivalent (pause until next heartbeat)
If escalation: pause, notify Maria
If completed: checkpoint final state, sleep until next heartbeat
```

**Key differences from Claude Code:**

| Aspect | Claude Code | AgentOS |
|--------|-------------|---------|
| Trigger | User types input | BullMQ scheduled job |
| Streaming | Terminal output | SSE → Canvas UI |
| Exit reasons | `completed\|tool_use\|error\|max_steps` | `completed\|escalated\|budget_exceeded\|max_steps_exceeded\|error\|cancelled` |
| Concurrency | `isConcurrencySafe()` partition | `parallel-safe` vs `serial-per-agent` partition |
| Tool result display | Terminal/IDE output | Reasoning trace panel |

**The typed exit reason difference is important:** Our `escalated` is a first-class exit reason, not just a pause. This matters because every escalation creates a database record, triggers a push notification, and waits for Maria's decision. The exit reason isn't just a label — it's the state machine transition that controls what happens next.

---

## Layer 4: Permission/Escalation System — Fundamentally Different

### Claude Code's Permission System

Claude Code has an interactive permission system — tools prompt the user before executing potentially destructive actions:

```
Tool call requested
    │
    ▼
PreToolUse Hooks (custom automation)
    │
    ▼
Permission Rules:
  - alwaysAllowRules: ["Read files", "Web search"]
  - alwaysDenyRules: ["rm -rf", "git push --force"]
  - alwaysAskRules: ["git push", "shell commands"]
    │
    ▼
If rule matches: apply it
If no rule: show interactive prompt
    │
    ▼
User approves/denies
    │
    ▼
Tool executes or blocked
```

### AgentOS's Adaptation

We cannot use interactive prompts — Maria is often not watching, and the agent needs to work while she sleeps. The permission model becomes:

```
Tool call requested
    │
    ▼
Pre-execution constraint check (approved contact list, budget)
    │
    ▼
Phase 1: If constraint violated → ESCALATE (no auto-approval)
Phase 2: If TRANSCRIPT_CLASSIFIER confidence >= threshold → AUTO-APPROVE
         If confidence < threshold → ESCALATE
    │
    ▼
Escalation:
  - Emit escalation step (SSE → Canvas + push notification)
  - Pause run, wait for Maria's decision
  - Maria decides: Approve / Edit & Approve / I Will Reply / Cancel
    │
    ▼
Maria's decision:
  - Logged to audit trail
  - Updates classifier (Phase 2) or confirmed contacts (Phase 1)
  - Run resumes or terminates
```

**The key architectural shift:** Claude Code's permission system is **interactive and real-time**. Ours is **declarative and constraint-based**. We pre-authorize constraints (approved contacts, escalation keywords, budget limits) and enforce them without interrupting Maria.

**The escalation modal is our version of Claude Code's interactive permission prompt.** The difference is that our modal can appear asynchronously (via push notification), and the decision is logged and actionable.

---

## Layer 5: Proactive/Honeycomb Architecture — Adapted

### Claude Code's KAIROS

Claude Code's KAIROS mode (unreleased) is the proactive agent pattern:

```
Agent runs autonomously between turns
Receives <tick> heartbeat prompts
Sleeps if no useful work
Wakes on:
  - Scheduled interval
  - GitHub PR webhook
  - Proactive suggestion
Commits, pushes, acts independently
Sends push notifications (PushNotificationTool)
```

Claude Code's proactive mode is for developers who want their AI to work in the background while they code.

### AgentOS's PROACTIVE Mode (Phase 2)

Our version is event-driven by Maria's business data, not by a developer's GitHub feed:

```
New email arrives in Maria's Gmail
    │
    ▼
Gmail Pub/Sub pushes notification to our webhook
    │
    ▼
Cloudflare Worker receives webhook
    │
    ▼
BullMQ enqueues "email_wake" job
    │
    ▼
Agent wakes immediately (not on next cron interval)
    │
    ▼
Agent reads email, evaluates:
  - If routine: handle autonomously (Phase 2 auto-approval)
  - If unusual: escalate to Maria
    │
    ▼
Result sent (email, notification), agent sleeps
```

**Latency target:** < 2 minutes from email arrival to agent action (vs. 15-minute cron polling = 900s latency).

**Privacy note:** Gmail push notifies us of *metadata* (new email arrived) — not the email content. The agent reads the email only after waking, and the email content never leaves Maria's authorized Gmail access.

---

## Context Compaction — Adapted

### Claude Code's Auto-Compact

Claude Code compacts context when approaching the token limit:

```
AUTOCOMPACT_BUFFER_TOKENS = 13,000 tokens
MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000 tokens

Compaction fires when:
  usage >= max_tokens - 13,000 - 20,000

Compaction process:
  1. Pause agent
  2. Extract distilled facts from conversation history
  3. Discard intermediate reasoning chains
  4. Replace with compressed summary
  5. Resume agent with compacted context
```

### AgentOS's Adaptation

**MVP:** Hard stop at token limit. If the agent approaches the context window, it pauses and escalates: "This conversation is getting long. Let me finish what I have and start fresh on the next run."

**Phase 2:** We adopt Claude Code's compaction principle but apply it differently:

```
End of each heartbeat cycle (not mid-cycle):
  │
  ▼
Forked extraction call:
  │  Lightweight inference call (not a full agent fork)
  │  Shares the run transcript
  │  Asks: "What facts did Maria's agent learn in this run?"
  ▼
Extract: verified facts → long-term memory (Qdrant + Postgres)
Discard: intermediate reasoning chains from this run
Retain: completed actions, escalation records, approval history
```

**Why at end of heartbeat, not continuously?** Because Maria's agents run on a heartbeat schedule. At the end of each heartbeat cycle, the agent is going to sleep anyway. Extracting facts at that point is natural and doesn't interrupt active work.

---

## Multi-Agent Architecture — Deferred, Different

### Claude Code's Coordinator Mode

Claude Code has `CoordinatorMode` (feature-flagged, unreleased) for multi-agent orchestration:

```
Coordinator agent
    │
    ├──→ Worker agent (research)
    │       Sidechain transcript
    │       Isolated memory
    │
    ├──→ Worker agent (draft)
    │       Sidechain transcript
    │       Isolated memory
    │
    └──→ Worker agent (review)
            Sidechain transcript
            Isolated memory
```

Each worker has isolated context. The coordinator manages shared state and spawns parallel workers.

### AgentOS's Phase 3 Adaptation

For James's marketing team use case, we use a simpler model:

```
James (human)
    │
    ├──→ Research Agent (autonomous, scheduled)
    │       Monitors competitor websites
    │       Writes findings to shared memory
    │
    ├──→ Draft Agent (triggered by Research Agent)
    │       Reads shared memory
    │       Drafts content
    │       Escalates to James for approval
    │
    └──→ Review Agent (triggered by James approval)
            Polishes and publishes
```

**The difference:** Claude Code's coordinator spawns fully autonomous sub-agents that coordinate among themselves. Our Phase 3 multi-agent keeps James in the loop as the coordinator. Workers escalate to James, not to each other. This is more appropriate for non-technical users who need to understand and trust what their agents are doing.

True peer-to-peer multi-agent coordination (Claude Code's coordinator pattern) is a Phase 3+ stretch goal.

---

## Telemetry and Privacy — Inverted

### Claude Code's Telemetry

Claude Code sends extensive telemetry to Anthropic's servers:
- Environment fingerprint (OS, node version, installed tools)
- Process metrics (CPU, memory, uptime)
- Session metadata (session ID, user ID, repo URL hash)
- Tool inputs (truncated by default, full with `OTEL_LOG_TOOL_DETAILS=1`)
- Analytics events via Datadog

**The opt-out problem:** First-party telemetry cannot be disabled for direct API users.

### AgentOS's Telemetry Policy

**We have no telemetry to third parties. Maria's data is Maria's data.**

| Data | Where it goes | Maria's control |
|------|--------------|-----------------|
| Agent reasoning traces | Maria's Postgres (tenant-isolated) | Full access, export any time |
| Tool calls and outputs | Maria's Postgres | Full access, export any time |
| Memory facts | Maria's Postgres + Qdrant (Maria's) | Full access, confirm/deny facts |
| Audit logs | Maria's Postgres | Exportable CSV/PDF for compliance |
| Aggregate analytics | AgentOS internal (no PII) | Opt-out available |
| Error logs | AgentOS internal (session ID only) | Minimal, no tool content |

**The only data we retain about Maria's agent activity is:**
- Aggregate metrics (how many emails were handled, how many escalations, uptime)
- Error reports (which run failed, error code — not email content)
- Usage for billing (tool call counts, not content)

**This is the inverse of Claude Code's telemetry model.** We designed for privacy by default, not as an afterthought.

---

## The Patterns We Borrow vs. The Patterns We Change

### Borrow (Principle Preserved, Implementation Adapted)

| Claude Code Pattern | AgentOS Adaptation |
|--------------------|--------------------|
| Tool interface (`validateInput`, `call`, `render`) | Tool schema + handler pattern (Gmail tools) |
| Streaming tool execution during token generation | SSE stream to Canvas UI |
| Concurrency partitioning (`isConcurrencySafe`) | `parallel-safe` vs `serial-per-agent` |
| Typed exit reasons | `completed \| escalated \| budget_exceeded \| ...` |
| Checkpoint/resume | Postgres checkpoints after every tool call |
| ULID idempotency keys | Per-tool-call idempotency, prevents double-send |
| Forked agent memory extraction | End-of-heartbeat fact distillation (Phase 2) |
| Context compaction at token threshold | MVP: hard stop; Phase 2: end-of-cycle distillation |
| Heartbeat scheduling | BullMQ cron + PROACTIVE Gmail push (Phase 2) |
| Permission scopes | Approved contact list + escalation constraints |

### Change (Principle Changed for Our Context)

| Claude Code Approach | Why We Change | AgentOS Approach |
|---------------------|---------------|------------------|
| Interactive permission prompts | Can't interrupt Maria while she sleeps | Declarative constraints + escalation |
| Session-scoped working memory | Our agents are cloud services on heartbeat cycles | Per-heartbeat working memory + durable checkpoints |
| `~/.claude/projects/<path>/memory/` | Not applicable — no local filesystem | Maria's Postgres (tenant-isolated) |
| Local subprocess execution | Multi-tenant cloud service | BullMQ jobs per agent run |
| First-party telemetry to Anthropic | Privacy violation for Maria's business data | Zero third-party telemetry; Maria owns all data |
| Coordinator → autonomous workers | James can't supervise autonomous sub-agents | Human-in-the-loop coordinator; workers escalate to James |
| Full filesystem access | OAuth to Gmail, Calendar, HubSpot — not the filesystem | Scoped OAuth; agent can't touch anything Maria didn't grant |

### Do Not Borrow (Not Applicable)

These Claude Code patterns have no equivalent in AgentOS:

- **File system tools** (`FileReadTool`, `FileEditTool`, `BashTool`) — we don't have a filesystem
- **IDE integration** (`LSPTool`, terminal capture) — we're a web app
- **Git operations** — Maria's agent manages her inbox, not her code
- **Slash commands** (`/browse`, `/web-search`) — we have NL-to-agent instead
- **Code review tools** — not Maria's use case
- **REPLTool, NotebookEditTool** — developer tools, not business tools
- **Inbox poller** (Claude Code's own email polling) — we use OAuth push instead

---

## Engineering Principles Summary

From studying Claude Code's architecture, these are the principles that transfer:

**1. The agent loop is simple; the layers around it are complex.**

The core LLM loop is straightforward: send messages, receive tool calls, execute, repeat. What makes it production-grade is the layers: checkpointing, concurrency control, permission enforcement, memory management, streaming UX. Don't simplify the layers.

**2. Typed state transitions prevent runaway agents.**

Claude Code's `stop_reason` typed exit reasons aren't just labels — they're the state machine that controls what happens next. We use the same pattern: `completed`, `escalated`, `budget_exceeded` are not strings, they're the transitions that control whether the agent sleeps, notifies Maria, or pauses.

**3. Idempotency is not optional — it's the foundation of trust.**

Claude Code's idempotency keys mean "if this tool call runs twice, the second time is a no-op." For AgentOS, this means Maria never gets the same email sent twice. Never. This is non-negotiable.

**4. The permission model determines the trust ceiling.**

Claude Code's interactive permission model works for developers who are watching. For Maria, pre-authorized constraints + escalation creates trust without interruption. The key is that the escalation modal is fast (under 5 seconds to decide), clear (she sees exactly what the agent wants to do and why), and actionable (Approve / Edit / Cancel).

**5. Memory is not storage — it's a distillation pipeline.**

Claude Code's `extractMemories.ts` pattern is correct: don't try to retain everything, extract the distilled facts and discard the reasoning chains. We adopt this at the end of each heartbeat cycle. Phase 2 long-term memory is not "everything the agent saw" — it's "what Maria would want her agent to remember about her business."

**6. Streaming UX is the trust interface.**

Claude Code's streaming tool execution — seeing "Reading inbox..." before the full response — is not just a UX nicety. It's how the user knows the agent is actually working. Our reasoning trace panel is the same principle: Maria watches her agent think, which is how she learns to trust it.

---

*This document is for internal engineering reference. Not for external sharing.*
