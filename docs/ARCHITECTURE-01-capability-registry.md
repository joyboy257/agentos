# Architecture: Capability Registry

**Document ID:** ARCHITECTURE-01
**Status:** Proposed
**Supersedes:** `agent-registry.ts` (hardcoded role definitions)
**Date:** 2026-03-29

---

## 1. Problem Statement

The current `agent-registry.ts` defines 8 fixed roles as enumerated strings. This approach has two critical failures:

**Failure 1 — The NL layer cannot ask "what can I do?"**
When a user says "I need to find a flight for next Tuesday", the NL layer has no structured way to enumerate capabilities that could help. It cannot ask the registry "which of your capabilities handle flight search?" because the registry is not a queryable data structure — it is a switch statement.

**Failure 2 — Goal-to-capability matching is opaque**
There is no trigger vocabulary. The system cannot determine that "send me the latest email from Sarah" maps to `email:read` and "remind me in 30 minutes" maps to `delay`. Engineers must hardcode every new mapping inside the NL prompt layer, creating a feedback loop that is impossible to audit or extend.

**Failure 3 — No composability**
A user goal like "if no one replies to my email in 2 hours, send a Slack message" requires three separate capabilities (send email, wait, send Slack). The current registry has no concept of composition or control-flow primitives that the system can reason about.

---

## 2. Solution: Capability Registry

Replace the hardcoded role registry with a **structured, queryable catalog** of all system capabilities.

A capability is an **atomic unit of computable action** the system can perform. The registry is the authoritative source of truth for:

- What the system can do (enumerated and typed)
- What natural language triggers map to each capability
- What inputs each capability requires
- What outputs it produces
- Whether it requires human approval before execution

The NL layer queries this registry at runtime using semantic matching over trigger phrases to produce an ordered list of candidate capabilities for a given user goal.

---

## 3. TypeScript Schema

```typescript
// JSON Schema subset — kept minimal for cross-language portability
interface JSONSchema {
  type: "string" | "number" | "boolean" | "array" | "object" | "null";
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  /** Semantic type tag for field-level dependency resolution.
   * Examples: "emailAddress", "threadId", "messageId", "userId",
   *           "query", "url", "date", "duration", "channelRef"
   */
  semanticType?: string;
}

interface Capability {
  /**
   * Unique identifier in namespace:subdomain format.
   * Namespace is the broad category (email, web, slack, control).
   * Subdomain is the specific action.
   */
  id: string;

  /**
   * Human-readable description of what this capability does.
   * Used in "I can't do that" messages and capability discovery.
   */
  description: string;

  /**
   * Natural language phrases that should trigger this capability.
   * The NL layer scores incoming user goals against this list
   * using embedding similarity or keyword overlap.
   *
   * Examples:
   *   ["read my email", "check inbox", "show recent emails", "any new messages"]
   */
  triggers: string[];

  /**
   * Which MCP tools this capability invokes.
   * A single capability may call multiple tools in sequence.
   *
   * Examples:
   *   ["gmail://messages.list"]           — single tool
   *   ["gmail://messages.send", "gmail://drafts.create"]  — multi-step
   */
  tools: string[];

  /**
   * JSON Schema describing the input parameters this capability accepts.
   * The NL layer infers these from the user goal and validates
   * before constructing the execution plan.
   *
   * Each input field SHOULD have a `semanticType` tag (e.g., "emailId",
   * "threadId", "query") to enable field-level dependency resolution
   * across capabilities.
   */
  inputSchema: JSONSchema;

  /**
   * JSON Schema describing the output this capability returns.
   * Used by the NL layer to format responses and by downstream
   * capabilities that consume this output as input.
   *
   * Each output field SHOULD have a `semanticType` tag to enable
   * semantic field matching in resolveDependencies.
   */
  outputSchema: JSONSchema;

  /**
   * Approval configuration for this capability.
   * Destructive or externally-sending actions (email send, Slack post,
   * file delete, payment) require explicit human approval.
   */
  approvalConfig: ApprovalConfig;

  /**
   * If true, this is a control-flow primitive (delay, condition, loop).
   * Control-flow capabilities are handled specially by the execution
   * engine — they may pause plan execution and resume on a timer or
   * external event rather than completing in a single step.
   *
   * Default: false
   */
  isControlFlow?: boolean;

  /**
   * Estimated worst-case execution duration in milliseconds.
   * Used by the execution planner for timeout and scheduling decisions.
   * If omitted, the planner uses a default (e.g., 30 000 ms).
   * Set to -1 if duration is indeterminate (e.g., indefinite watch).
   */
  estimatedDurationMs?: number;

  /**
   * Example prompt strings that correctly invoke this capability.
   * Used for few-shot prompting in the NL layer and for automated
   * regression testing of trigger matching.
   */
  examples?: string[];
}

/** Approval configuration — replaces the previous `requiresApproval: boolean` flag. */
interface ApprovalConfig {
  /**
   * Who must approve this action.
   *   "user"        — the end user who initiated the goal
   *   "approver"    — a designated approver (e.g., manager, admin)
   *   "none"        — no approval required (same as omitting the capability)
   */
  approverType: "user" | "approver" | "none";

  /**
   * Seconds to wait for approval before taking the fallback action.
   * If exceeded and no fallback is specified, the step is aborted.
   */
  timeoutSeconds?: number;

  /**
   * Fallback action when approval times out.
   *   "skip"   — skip this step and continue the plan
   *   "abort"  — abort the entire execution plan
   *   "retry"  — re-prompt for approval
   *   string   — capability ID to execute instead
   */
  fallback?: "skip" | "abort" | "retry" | string;
}
```

### Supporting Types

```typescript
interface CapabilityMatch {
  capability: Capability;
  score: number;        // 0.0–1.0 confidence
  matchedTriggers: string[];
  inferredInputs: Record<string, unknown>;
}

interface ExecutionPlan {
  steps: ExecutionStep[];
  estimatedDurationMs: number;  // sum of all step durations; -1 if indeterminate
  requiresApproval: boolean;   // true if any step has approverType !== "none"
}

interface ExecutionStep {
  capabilityId: string;
  inputs: Record<string, unknown>;
  dependsOn: string[];   // IDs of steps whose outputs this step consumes
}

interface RegistryQuery {
  goal: string;                  // raw user goal
  context?: ExecutionContext;    // current session/execution context
  limit?: number;                // max results (default 5)
}

/** Execution context passed to the registry query to enable context-aware filtering. */
interface ExecutionContext {
  /** Active capability IDs already assigned in the current plan.
   *  Used to avoid returning duplicate or conflicting capabilities.
   */
  activeCapabilities?: string[];

  /** Channel/platform through which the user is interacting.
   *  Examples: "slack", "email", "web", "calendar"
   */
  channel?: string;

  /** User's authenticated identity */
  userId?: string;

  /** Current session identifier */
  sessionId?: string;

  /** Organisation/workspace context */
  orgId?: string;

  /** Arbitrary additional context specific to the NL layer or integration */
  extras?: Record<string, unknown>;
}
```

---

## 4. Example Entries

### 4.1 `email:read`

Read messages from the user's Gmail inbox.

```typescript
{
  id: "email:read",
  description: "Retrieves email messages from the user's Gmail inbox. Supports filtering by sender, subject, date range, and labels. Returns message metadata and body content.",

  triggers: [
    "read my email",
    "check my inbox",
    "show recent emails",
    "any new messages",
    "find emails from",
    "search my emails",
    "what emails did I get",
    "show me unread emails",
    "get my emails",
    "fetch email",
    "pull up my inbox"
  ],

  tools: ["gmail://messages.list", "gmail://messages.get"],

  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Gmail search query string (e.g. 'from:sarah after:2026/03/01')",
        semanticType: "query",
        default: ""
      },
      maxResults: {
        type: "number",
        description: "Maximum number of messages to return",
        default: 10
      },
      includeBody: {
        type: "boolean",
        description: "Whether to include full message body",
        default: false
      }
    },
    required: []
  },

  outputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id:        { type: "string", description: "Message ID",          semanticType: "emailId" },
            threadId:  { type: "string", description: "Thread/gmail thread ID", semanticType: "threadId" },
            from:      { type: "string", description: "Sender email address" },
            subject:   { type: "string" },
            snippet:   { type: "string" },
            body:      { type: "string" },
            date:      { type: "string" },
            labels:    { type: "array", items: { type: "string" } }
          }
        }
      },
      totalCount:   { type: "number" },
      nextPageToken: { type: "string", nullable: true }
    }
  },

  approvalConfig: { approverType: "none" },

  estimatedDurationMs: 2000,

  examples: [
    "Did I get any emails from John this week?",
    "Read my last 5 emails",
    "Show me unread messages",
    "Find emails about the quarterly report"
  ]
}
```

---

### 4.2 `email:send`

Send an email via Gmail. **Requires approval** because this is a write/send action.

```typescript
{
  id: "email:send",
  description: "Sends an email from the user's Gmail account to one or more recipients. Supports CC/BCC, attachments via file references, and thread reply.",

  triggers: [
    "send an email",
    "send email to",
    "compose and send",
    "email them",
    "drop them an email",
    "write to",
    "send a message via email",
    "forward this email",
    "reply to this email",
    "cc",
    "bcc"
  ],

  tools: ["gmail://messages.send"],

  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "array",
        items: { type: "string" },
        description: "Recipient email addresses",
        semanticType: "emailAddress"
      },
      cc: {
        type: "array",
        items: { type: "string" },
        description: "CC recipient email addresses",
        semanticType: "emailAddress"
      },
      bcc: {
        type: "array",
        items: { type: "string" },
        description: "BCC recipient email addresses",
        semanticType: "emailAddress"
      },
      subject: {
        type: "string",
        description: "Email subject line",
        semanticType: "subject"
      },
      body: {
        type: "string",
        description: "Plaintext or HTML email body",
        semanticType: "messageBody"
      },
      threadId: {
        type: "string",
        description: "Thread ID to reply within (leave empty for new thread)",
        semanticType: "threadId"
      },
      attachments: {
        type: "array",
        items: { type: "string" },
        description: "File paths or content IDs to attach"
      }
    },
    required: ["to", "subject", "body"]
  },

  outputSchema: {
    type: "object",
    properties: {
      messageId: { type: "string", semanticType: "emailId" },
      threadId:  { type: "string", semanticType: "threadId" },
      to:        { type: "array", items: { type: "string" } },
      subject:   { type: "string" },
      sentAt:    { type: "string" }
    }
  },

  approvalConfig: {
    approverType: "user",
    timeoutSeconds: 300,
    fallback: "abort"
  },

  estimatedDurationMs: 3000,

  examples: [
    "Send an email to alice@example.com saying the report is ready",
    "Email the team about the schedule change",
    "Reply to this thread with 'Looks good to me'",
    "Forward that email to my manager"
  ]
}
```

---

### 4.3 `web:search`

Perform a web search and return structured results.

```typescript
{
  id: "web:search",
  description: "Executes a web search query and returns structured results including titles, URLs, snippets, and metadata. Used as a primitive for factual lookup, research, and real-time information retrieval.",

  triggers: [
    "search for",
    "google",
    "look up",
    "find on the web",
    "search the web",
    "what is",
    "who is",
    "how do I",
    "find information about",
    "web search",
    "internet search",
    "lookup"
  ],

  tools: ["web://search.execute"],

  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query string",
        semanticType: "query"
      },
      numResults: {
        type: "number",
        description: "Number of results to return",
        default: 10
      },
      source: {
        type: "string",
        description: "Preferred source (e.g. 'news', 'images', 'videos', 'web' — defaults to 'web')",
        enum: ["web", "news", "images", "videos", "shopping"]
      },
      language: {
        type: "string",
        description: "ISO 639-1 language code for results",
        default: "en"
      },
      safeSearch: {
        type: "boolean",
        description: "Enable safe search filtering",
        default: true
      }
    },
    required: ["query"]
  },

  outputSchema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title:   { type: "string" },
            url:     { type: "string", semanticType: "url" },
            snippet: { type: "string" },
            favicon: { type: "string" },
            source:  { type: "string" },
            date:    { type: "string", nullable: true }
          }
        }
      },
      totalResults: { type: "number" },
      query:        { type: "string", semanticType: "query" }
    }
  },

  approvalConfig: { approverType: "none" },

  estimatedDurationMs: 1500,

  examples: [
    "Search for the latest news on AI agents",
    "Look up how to configure a MacBook for development",
    "Who founded Anthropic?",
    "Find restaurants near me with good reviews"
  ]
}
```

---

### 4.4 `condition:if_no_reply`

A control-flow primitive that branches execution based on whether an external actor (email sender, Slack user) replies within a specified time window.

```typescript
{
  id: "condition:if_no_reply",
  description: "A conditional branching primitive. Pauses plan execution and waits for an external reply to a specified message thread. If a reply is received before the timeout, the 'onReply' branch executes. If the timeout expires with no reply, the 'onNoReply' branch executes. Used to build 'if X replies, do Y, otherwise do Z' logic.",

  triggers: [
    "if they reply",
    "if no reply",
    "if there's no response",
    "wait for a response",
    "if someone replies",
    "monitor for replies",
    "if I get a reply",
    "conditional on reply",
    "only if they respond",
    "otherwise"
  ],

  tools: ["gmail://threads.watch", "slack://conversations.history"],

  inputSchema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        description: "The thread or conversation channel to monitor (email thread ID or Slack channel ID)",
        enum: ["email", "slack"],
        semanticType: "channelType"
      },
      threadRef: {
        type: "string",
        description: "Reference to the specific thread or message ID to watch",
        semanticType: "threadId"   // email: threadId; slack: channel ID + thread ts
      },
      timeout: {
        type: "number",
        description: "Maximum seconds to wait before triggering onNoReply branch",
        default: 7200,  // 2 hours
        minimum: 1
      },
      onReply: {
        type: "array",
        items: { type: "string" },
        description: "Capability IDs to execute if a reply is received"
      },
      onNoReply: {
        type: "array",
        items: { type: "string" },
        description: "Capability IDs to execute if timeout expires with no reply"
      }
    },
    required: ["channel", "threadRef", "timeout", "onReply", "onNoReply"]
  },

  outputSchema: {
    type: "object",
    properties: {
      outcome: {
        type: "string",
        enum: ["replied", "timeout"],
        description: "Which branch was taken"
      },
      replyMessage: {
        type: "object",
        nullable: true,
        description: "The first reply message if outcome is 'replied'"
      },
      waitedSeconds: { type: "number" }
    }
  },

  approvalConfig: { approverType: "none" },
  isControlFlow: true,
  estimatedDurationMs: -1,   // indeterminate — waits indefinitely

  examples: [
    "If they reply saying 'approved', send the contract. Otherwise send a reminder after 2 hours.",
    "Monitor this email thread for a response. If no one replies in 24 hours, close the ticket.",
    "Wait for a reply on Slack. If they confirm, proceed with the order. If not, cancel it."
  ]
}
```

#### Watch State Persistence Model

The `condition:if_no_reply` capability must maintain watch state across time because the condition may span minutes to hours. The execution engine persists this state so that it survives process restarts and can be resumed on node failover.

**Persistence store: Redis (recommended) or equivalent KV store**

Rationale: Low latency reads/writes, TTL support for automatic expiry, pub/sub for watch notifications. In-memory-only persistence is insufficient for multi-hour watches.

**Key schema:**

```
Key:   watch:{sessionId}:{capabilityInstanceId}
Value: JSON {
  threadRef:      string,       // thread/channel being watched
  channel:        "email"|"slack",
  startedAt:      string (ISO),// when watch began
  timeoutAt:      string (ISO),// when timeout fires
  status:         "watching"|"resolved"|"timed_out"|"cancelled",
  onReply:        string[],     // capability IDs for onReply branch
  onNoReply:       string[],     // capability IDs for onNoReply branch
  userId:         string,
  orgId:          string,
  planId:         string,       // ExecutionPlan ID this watch belongs to
  resolvedOutcome?: "replied"|"timeout",
  replyMessage?:   object       // set when status becomes "resolved"
}
TTL: timeout + 300s (5-min buffer after expected timeout)
```

**Transitions:**

| Event | Transition |
|-------|------------|
| Watch created | status = "watching", TTL = timeout + 300s |
| External reply received | status = "resolved", resolvedOutcome = "replied", replyMessage = msg, TTL = 300s |
| Timeout fires | status = "timed_out", resolvedOutcome = "timeout", TTL = 300s |
| Plan cancelled | status = "cancelled", key deleted |

**Notification mechanism:**
- Email watch: use Gmail push notifications (google pubsub) or polling fallback
- Slack watch: use Slack Event API with app-level token

**NL layer contract:** The NL layer receives `outcome: "replied"|"timeout"` and the `replyMessage` object in the output schema. The NL layer is responsible for deciding which branch of the plan to execute based on `outcome`.

---

### 4.5 `delay`

A control-flow primitive that pauses execution for a specified duration before resuming the plan.

```typescript
{
  id: "delay",
  description: "Pauses plan execution for a specified duration. The plan resumes automatically after the delay completes. Used for follow-up reminders, polling loops, and rate-limited retry backoff.",

  triggers: [
    "wait",
    "wait for",
    "delay",
    "in a moment",
    "after",
    "later",
    "remind me in",
    "check again in",
    "come back to this",
    "pause"
  ],

  tools: [],  // No external tool — managed by execution engine timer

  inputSchema: {
    type: "object",
    properties: {
      seconds: {
        type: "number",
        description: "Number of seconds to wait",
        minimum: 1,
        maximum: 86400   // CRITICAL: prevent infinite loops; max 24 hours
      },
      resumeWith: {
        type: "string",
        description: "Optional capability ID to execute when delay completes (for chained delays)"
      },
      note: {
        type: "string",
        description: "Human-readable note about why we're waiting (not used functionally, returned in output)"
      }
    },
    required: ["seconds"]
  },

  outputSchema: {
    type: "object",
    properties: {
      startedAt:        { type: "string" },
      endedAt:          { type: "string" },
      durationSeconds:  { type: "number" }
    }
  },

  approvalConfig: { approverType: "none" },
  isControlFlow: true,
  estimatedDurationMs: 0,   // computed at runtime from `seconds` input

  examples: [
    "Wait 30 seconds and then check again",
    "In 5 minutes, send me a reminder to review this",
    "Check the status again in 10 minutes",
    "Wait for an hour before sending the follow-up"
  ]
}
```

**Maximum duration constraint:** The `delay` capability enforces `maximum: 86400` (24 hours) on the `seconds` field. This prevents accidental infinite delay loops. For delays exceeding 24 hours, the NL layer should decompose the wait into multiple `delay` steps with intermediate checkpoints, or use the `condition:if_no_reply` mechanism.

---

### 4.6 `slack:post`

Post a message to a Slack channel or user. **Requires approval** for external-facing messages.

```typescript
{
  id: "slack:post",
  description: "Posts a message to a Slack channel, group DM, or user. Supports blocks, attachments, and thread replies. This is a write action that is visible to external parties and therefore requires approval.",

  triggers: [
    "post to slack",
    "send a slack message",
    "message on slack",
    "post in",
    "slack them",
    "ping on slack",
    "notify on slack",
    "send to #",
    "dm on slack"
  ],

  tools: ["slack://chat.postMessage", "slack://conversations.open"],

  inputSchema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        description: "Slack channel name (with #) or user ID to post to",
        semanticType: "channelRef"
      },
      text: {
        type: "string",
        description: "Main message text (supports Slack Markdown)",
        semanticType: "messageBody"
      },
      threadTs: {
        type: "string",
        description: "Timestamp of parent message to reply in thread",
        semanticType: "messageId"
      },
      blocks: {
        type: "array",
        items: { type: "object" },
        description: "Slack Block Kit structured content"
      },
      unfurlLinks: {
        type: "boolean",
        description: "Enable link unfurling for URLs in message",
        default: false
      }
    },
    required: ["channel", "text"]
  },

  outputSchema: {
    type: "object",
    properties: {
      ts:      { type: "string", description: "Timestamp of posted message", semanticType: "messageId" },
      channel: { type: "string", semanticType: "channelRef" },
      text:    { type: "string" }
    }
  },

  approvalConfig: {
    approverType: "user",
    timeoutSeconds: 300,
    fallback: "abort"
  },

  estimatedDurationMs: 2000,

  examples: [
    "Post to #engineering that the deploy is complete",
    "DM user @alice to confirm the meeting time",
    "Reply in the thread with the updated status",
    "Notify the team in #incidents that the issue is resolved"
  ]
}
```

---

### 4.7 `calendar:query`

Query the user's calendar for events within a date range.

```typescript
{
  id: "calendar:query",
  description: "Retrieves calendar events from the user's connected calendar (Google Calendar) within a specified date range. Returns event details including title, time, attendees, location, and description.",

  triggers: [
    "what's on my calendar",
    "do I have any meetings",
    "show my schedule",
    "what meetings do I have",
    "check my calendar",
    "am I free",
    "when am I busy",
    "upcoming events",
    "what's happening tomorrow"
  ],

  tools: ["calendar://events.list"],

  inputSchema: {
    type: "object",
    properties: {
      timeMin: {
        type: "string",
        description: "Start of date/time range (ISO 8601)",
        semanticType: "dateTime"
      },
      timeMax: {
        type: "string",
        description: "End of date/time range (ISO 8601)",
        semanticType: "dateTime"
      },
      maxResults: {
        type: "number",
        default: 20
      },
      singleEvents: {
        type: "boolean",
        default: true,
        description: "Expand recurring events into individual occurrences"
      }
    },
    required: ["timeMin", "timeMax"]
  },

  outputSchema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id:          { type: "string" },
            summary:     { type: "string" },
            start:       { type: "string", semanticType: "dateTime" },
            end:         { type: "string", semanticType: "dateTime" },
            attendees:   { type: "array", items: { type: "string" } },
            location:    { type: "string", nullable: true },
            description: { type: "string", nullable: true },
            colorId:     { type: "string", nullable: true }
          }
        }
      }
    }
  },

  approvalConfig: { approverType: "none" },

  estimatedDurationMs: 1500,

  examples: [
    "What's on my calendar tomorrow?",
    "Show me my meetings for this week",
    "Am I free on Friday afternoon?",
    "Check if I have any conflicts at 3pm"
  ]
}
```

---

## 5. How the NL Layer Queries the Registry

### 5.1 Query Flow

When the NL layer receives a user goal, it performs the following steps:

```
1. RECEIVE goal: "I need to follow up with anyone who hasn't replied to the project update"
2. EXTRACT key phrases: ["follow up", "hasn't replied", "project update"]
3. QUERY registry with goal text and extracted phrases (pass ExecutionContext)
4. RANK matches by score (0.0–1.0), filtering by context.activeCapabilities
5. BUILD execution plan from top matches
6. VALIDATE inputSchema against inferred inputs
7. EXECUTE or REQUEST approval
```

### 5.2 Registry Query Implementation

```typescript
// registry.ts
class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  /**
   * In-memory rate limiter state.
   * Key: "query:{sessionId}" | "query:{userId}" — one of which must be provided.
   * Value: { count: number; windowStart: number }
   */
  private rateLimitState: Map<string, { count: number; windowStart: number }> = new Map();

  /**
   * Global rate limit configuration.
   * Applied per session or per user depending on which identifier is available.
   */
  private readonly RATE_LIMIT_MAX   = 100;  // max queries
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;  // per 60-second window

  /**
   * Query the registry for capabilities matching a user goal.
   *
   * The NL layer calls this with the raw user goal and gets back
   * scored, ranked matches with inferred inputs.
   */
  async query(input: RegistryQuery): Promise<CapabilityMatch[]> {
    const { goal, context, limit = 5 } = input;

    // ── Rate limiting ──────────────────────────────────────────────────────
    const limiterKey = (context?.sessionId ?? context?.userId ?? "anonymous")
      .replace(/[^a-zA-Z0-9]/g, "");

    const now = Date.now();
    const rateEntry = this.rateLimitState.get(limiterKey) ?? {
      count: 0,
      windowStart: now,
    };

    if (now - rateEntry.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      rateEntry.count = 0;
      rateEntry.windowStart = now;
    }

    if (++rateEntry.count > this.RATE_LIMIT_MAX) {
      throw new Error(
        `Rate limit exceeded for ${limiterKey}. ` +
        `Max ${this.RATE_LIMIT_MAX} queries per ${this.RATE_LIMIT_WINDOW_MS / 1000}s.`
      );
    }
    this.rateLimitState.set(limiterKey, rateEntry);
    // ───────────────────────────────────────────────────────────────────────

    // Step 1: Tokenize and normalize the goal
    const goalTokens = this.tokenize(goal);

    // Step 2: Score every capability by trigger overlap
    const scored: CapabilityMatch[] = [];

    for (const capability of this.capabilities.values()) {

      // ── Context filtering ──────────────────────────────────────────────
      // Skip if this capability is already active in the plan.
      if (
        context?.activeCapabilities?.length &&
        context.activeCapabilities.includes(capability.id)
      ) {
        continue;
      }
      // ───────────────────────────────────────────────────────────────────

      const triggerScores = capability.triggers.map(trigger => ({
        trigger,
        score: this.cosineSimilarity(
          this.tokenize(trigger),
          goalTokens
        )
      }));

      // Take the best-scoring trigger
      const best = triggerScores.reduce(
        (a, b) => (a.score > b.score ? a : b),
        { trigger: "", score: 0 }
      );

      // CRITICAL fix: raise threshold from 0.1 to 0.5
      if (best.score > 0.5) {
        scored.push({
          capability,
          score: best.score,
          matchedTriggers: triggerScores
            .filter(t => t.score > 0.5)
            .map(t => t.trigger),
          inferredInputs: this.inferInputs(capability.inputSchema, goal, context)
        });
      }
    }

    // Step 3: Sort by score descending, return top N
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Tokenize a phrase for keyword-based similarity scoring.
   *
   * This is a simple whitespace+lowercase tokenizer used as the
   * baseline BM25/TF-IDF pipeline. For production, this function
   * feeds the TF-IDF vectorizer below.
   *
   * A more semantically robust alternative is to replace this with
   * an OpenAI embeddings call (see embed() below) and use
   * vector cosine similarity instead.
   */
  tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter(token => token.length > 1)
    );
  }

  /**
   * Compute cosine similarity between two token sets using the classic
   * set-overlapping formula: |A ∩ B| / sqrt(|A| * |B|).
   *
   * This is equivalent to cosine similarity on one-hot vectors and
   * serves as the baseline keyword-matching scorer.
   *
   * For semantic matching, replace this with embedding-based similarity:
   *
   *   async embed(text: string): Promise<number[]> {
   *     const res = await fetch("https://api.openai.com/v1/embeddings", {
   *       method: "POST",
   *       headers: {
   *         "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
   *         "Content-Type": "application/json"
   *       },
   *       body: JSON.stringify({
   *         model: "text-embedding-3-small",
   *         input: text
   *       })
   *     });
   *     const { data } = await res.json();
   *     return data[0].embedding;   // number[]
   *   }
   *
   *   async embeddingSimilarity(a: string, b: string): Promise<number> {
   *     const [vecA, vecB] = await Promise.all([this.embed(a), this.embed(b)]);
   *     const dot = vecA.reduce((sum, v, i) => sum + v * vecB[i], 0);
   *     const mag = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
   *     return dot / (mag(vecA) * mag(vecB));
   *   }
   *
   * The trigger matching loop then becomes:
   *   score: await this.embeddingSimilarity(trigger, goal)
   *
   * Hybrid approach (BM25 + embeddings) is recommended for production.
   */
  private cosineSimilarity(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter(x => b.has(x)));
    if (intersection.size === 0) return 0;
    return intersection.size / Math.sqrt(a.size * b.size);
  }

  /**
   * Given a capability's inputSchema and the user goal, extract
   * parameter values from the goal text.
   *
   * EXTRACTION CONTRACT:
   * The NL layer is responsible for calling an LLM (GPT-4o or similar)
   * to extract structured parameter values from free-text user goals.
   * This method defines the contract/schema that extraction targets.
   *
   * Step 1 — Identify unsatisfied inputs:
   *   For each field in inputSchema.properties that has no value in
   *   sessionState or context.extras, the field is marked "unsatisfied".
   *
   * Step 2 — Extract from goal text:
   *   The NL layer sends the unsatisfied field list (with their
   *   semanticType tags and descriptions) along with the user goal to
   *   an LLM extraction prompt. The LLM returns a map of field name
   *   -> extracted value.
   *
   * Step 3 — Merge with context/session state:
   *   Any field already populated in sessionState (e.g., threadId from
   *   a prior email:read step) is carried through automatically and does
   *   NOT need to appear in the goal text.
   *
   * Extraction prompt template:
   *   ```
   *   Given the following user goal and input schema, extract values
   *   for each field. Only extract fields that are explicitly mentioned
   *   or can be unambiguously inferred. Leave undefined for fields
   *   that cannot be determined.
   *
   *   User goal: {goal}
   *
   *   Schema fields:
   *   {fields.map(f => `  - ${f.name} (${f.semanticType}): ${f.description}`).join('\n')}
   *
   *   Return a JSON object mapping field names to extracted values.
   *   ```
   *
   * @param schema      The inputSchema of the capability being queried
   * @param goal        The raw user goal string
   * @param context     ExecutionContext (session state, userId, channel, etc.)
   * @returns           A map of field names to extracted values;
   *                    empty object {} means no inputs could be extracted
   */
  private inferInputs(
    schema: JSONSchema,
    goal: string,
    context?: ExecutionContext
  ): Record<string, unknown> {
    // ── Step 1: Determine unsatisfied fields ─────────────────────────────
    const sessionState = context?.extras ?? {};
    const unsatisfiedFields: Array<{
      name: string;
      semanticType?: string;
      description?: string;
      schema: JSONSchema;
    }> = [];

    if (schema.properties) {
      for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
        // Field is satisfied if it exists in session state with a non-null value
        if (
          fieldName in sessionState &&
          sessionState[fieldName] != null
        ) {
          continue;  // already satisfied — carry through
        }
        unsatisfiedFields.push({ name: fieldName, schema: fieldSchema });
      }
    }

    if (unsatisfiedFields.length === 0) {
      return {};  // all inputs satisfied by context
    }

    // ── Step 2: NL extraction (delegated to calling NL layer) ─────────────
    // The registry does NOT call the LLM directly — it returns the schema
    // of what needs to be extracted, and the NL layer performs the
    // extraction and passes results back via ExecutionContext.extras or
    // as direct inputs to the capability invocation.
    //
    // For stub implementation, return empty object. The NL layer must
    // implement the actual LLM extraction loop.
    return {}; // Placeholder — actual implementation in NL layer
  }
}
```

### 5.3 Building an Execution Plan

Once matches are returned, the NL layer constructs an `ExecutionPlan`:

```typescript
/**
 * Given a list of matched capabilities, build a total ordering
 * and resolve dependencies between steps.
 */
function buildExecutionPlan(matches: CapabilityMatch[]): ExecutionPlan {
  const steps: ExecutionStep[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    if (seen.has(match.capability.id)) continue;
    seen.add(match.capability.id);

    steps.push({
      capabilityId: match.capability.id,
      inputs: match.inferredInputs,
      dependsOn: resolveDependencies(match.capability, steps)
    });
  }

  const totalDurationMs = steps.reduce((sum, step) => {
    const cap = capabilities.get(step.capabilityId);
    const d = cap?.estimatedDurationMs ?? 0;
    return sum + (d < 0 ? 0 : d);  // treat -1 (indeterminate) as 0 for sum
  }, 0);

  return {
    steps,
    estimatedDurationMs: totalDurationMs,
    requiresApproval: steps.some(s => {
      const cap = capabilities.get(s.capabilityId);
      return cap?.approvalConfig.approverType !== "none";
    })
  };
}

/**
 * Resolve which previous steps' outputs feed into this step's inputs
 * using FIELD-LEVEL SEMANTIC TYPE MATCHING.
 *
 * A step B depends on step A if B's inputSchema contains a field whose
 * `semanticType` matches the `semanticType` of an output field in A's
 * outputSchema.
 *
 * Example:
 *   email:send output  { threadId: { semanticType: "threadId" } }
 *   email:read output  { messages: [{ threadId: { semanticType: "threadId" } }] }
 *
 *   email:read --> email:send  (because both have threadId of semanticType "threadId")
 *
 * This replaces the broken type-level matching:
 *   BAD: outputSchema.type === inputSchema.type  (always "object" for both)
 *   GOOD: field-level semanticType equivalence
 */
function resolveDependencies(
  capability: Capability,
  priorSteps: ExecutionStep[]
): string[] {
  const deps: string[] = [];
  const inputProps = capability.inputSchema.properties ?? {};

  for (const step of priorSteps) {
    const priorCap = capabilities.get(step.capabilityId);
    if (!priorCap) continue;

    const outputProps = priorCap.outputSchema.properties ?? {};

    // Find if ANY output field semantically matches ANY input field
    for (const [outField, outSchema] of Object.entries(outputProps)) {
      const outType = outSchema.semanticType ?? outField;  // fallback to field name

      for (const [inField, inSchema] of Object.entries(inputProps)) {
        const inType = inSchema.semanticType ?? inField;  // fallback to field name

        if (outType === inType) {
          deps.push(step.capabilityId);
          break;  // one match is enough to establish the dependency
        }
      }
    }
  }

  return [...new Set(deps)];  // deduplicate
}
```

### 5.4 Handling "I Can't Do That"

When the registry returns no matches above a confidence threshold (e.g., all scores < 0.2), the NL layer must respond gracefully. The system **never responds with "I can't do that" without first checking what it CAN do**.

```typescript
async function handleUnmatchedGoal(goal: string): Promise<string> {
  // Fallback 1: Get top 3 capabilities by trigger popularity
  const popular = await registry.getByExampleCount();

  const message = [
    `I don't have a capability that matches "${goal}".`,
    `Here are some things I can do:\n`
  ];

  for (const cap of popular.slice(0, 3)) {
    message.push(`  • **${cap.id}**: ${cap.description}`);
    message.push(`    Try: "${cap.examples[0]}"\n`);
  }

  message.push(
    `Can you rephrase your goal using one of these patterns, ` +
    `or ask me "what can you do?" for the full list?`
  );

  return message.join("\n");
}
```

---

## 6. Flywheel Pattern: Capability Promotion

Over time, common goal patterns that are currently achieved by composing multiple primitive capabilities should be **promoted** into first-class capabilities. This is the flywheel.

### 6.1 The Promotion Cycle

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   OBSERVE          IDENTIFY         PROMOTE                 │
│   ────────         ────────         ────────                │
│   NL layer         Pattern:         New capability           │
│   logs every       3+ primitives    added to registry        │
│   goal that        used together     with composite          │
│   matched          >10 times         triggers and            │
│   multiple         per week          isControlFlow           │
│   primitives                                             │
│       │                  │                  │               │
│       └──────────────────┴──────────────────┘               │
│                      FLYWHEEL                               │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Observability: What Gets Logged

```typescript
interface CapabilityUsageEvent {
  timestamp: string;            // ISO 8601
  userId: string;              // CRITICAL: user who initiated the goal
  sessionId: string;          // CRITICAL: session context for correlation
  orgId: string;              // CRITICAL: organisation/workspace scope
  userGoal: string;
  matchedCapabilities: string[];   // IDs of capabilities used
  executionPlan: ExecutionPlan;
  success: boolean;
  latencyMs: number;
  /** Additional context for debugging/analytics */
  context?: {
    channel?: string;          // slack, email, web, calendar
    triggerScores?: Record<string, number>;  // capabilityId -> match score
    fallbackUsed?: boolean;    // true if a fallback was triggered
  };
}
```

These events are aggregated weekly. A pattern is a candidate for promotion when:

1. **Frequency**: The same 2–4 capability IDs appear together in >10 distinct sessions within 7 days
2. **Coherence**: The user goals that trigger this composition share a common NL phrase pattern
3. **Atomicity**: The composition cannot be further decomposed into meaningful sub-steps that are used independently

### 6.3 Promotion Example

**Observed pattern (3 months of telemetry):**

```
Goal: "if no one replies to my email by tomorrow, ping them on Slack"
Matched: [email:read, condition:if_no_reply, delay, slack:post]
Frequency: ~40 uses/week across users
```

**Proposed new capability — `email:escalate-slack`:**

```typescript
{
  id: "email:escalate-slack",
  description: "Sends an email and monitors for a reply. If no reply is received within the specified timeout, sends a Slack DM to the recipient as a follow-up.",

  triggers: [
    "if no reply, ping on slack",
    "follow up on email with slack",
    "escalate to slack if no response",
    "email and slack if no reply"
  ],

  tools: ["gmail://messages.send", "gmail://threads.watch", "slack://conversations.open", "slack://chat.postMessage"],

  inputSchema: {
    type: "object",
    properties: {
      emailTo:          { type: "array",  items: { type: "string" }, semanticType: "emailAddress" },
      emailSubject:     { type: "string", semanticType: "subject" },
      emailBody:        { type: "string", semanticType: "messageBody" },
      slackUserId:      { type: "string", semanticType: "userId" },
      slackMessage:     { type: "string", semanticType: "messageBody" },
      timeoutHours:     { type: "number", default: 24, minimum: 1, maximum: 168 }
    },
    required: ["emailTo", "emailSubject", "emailBody", "slackUserId", "slackMessage"]
  },

  outputSchema: {
    type: "object",
    properties: {
      emailMessageId: { type: "string", semanticType: "emailId" },
      slackTs:        { type: "string", nullable: true, semanticType: "messageId" },
      outcome:        { type: "string", enum: ["replied", "escalated", "pending"] }
    }
  },

  approvalConfig: { approverType: "user", timeoutSeconds: 600, fallback: "abort" },
  isControlFlow: true,
  estimatedDurationMs: -1,

  examples: [
    "Email the client and ping them on Slack if they don't reply by tomorrow",
    "Send the proposal and follow up on Slack if no response in 4 hours"
  ]
}
```

### 6.4 Registry Evolution

The registry is versioned. Each promotion generates a migration entry:

```typescript
interface RegistryMigration {
  version: string;
  date: string;
  added: Capability[];
  removed: string[];      // IDs that are now deprecated
  deprecated: string[];  // IDs that still work but emit warnings
  breakingChanges: string[];
}
```

The NL layer checks the registry version at startup and logs a warning if it is more than 2 versions behind.

---

## 7. What NOT to Include

The following do **not** belong in the capability registry:

### 7.1 Business Logic

Do not encode domain-specific decision trees. For example, "is this email a customer complaint?" is a classification problem, not a capability. If the NL layer needs to route based on classification, it should call a dedicated classifier service, not a capability.

**Bad:**
```typescript
// WRONG — business logic in registry
{ id: "triage:customer-email", description: "Classify if email is a complaint..." }
```

**Good:**
```typescript
// Email read is atomic. Triage is a classification layer on top.
{ id: "email:read", ... }
```

### 7.2 Non-Composable Multi-Step Macros

Do not create capabilities that hardcode a sequence of unrelated actions. Each capability should be independently useful. If two capabilities are always used together, that is evidence of a composition, not a new atomic capability — unless the pattern has been promoted via the flywheel.

**Bad:**
```typescript
// WRONG — macro pretending to be a capability
{ id: "onboarding:send-welcome-slack-then-email", tools: ["slack://...", "gmail://..."] }
```

### 7.3 Credentials or Secrets

Do not include user credentials, API keys, or tokens in capability definitions. Capabilities describe **what** the system can do; the execution engine handles **how** authentication is performed.

### 7.4 Response Templates

Do not include natural language response text in capabilities. The NL layer generates responses. Capabilities describe actions. This separation keeps the registry stable even if the UI or tone of responses changes.

### 7.5 Implementation Details

Do not include tool implementation URLs, internal service names, or infrastructure configuration. These are engine-level concerns. The registry is the **interface contract** between the NL layer and the execution engine.

---

## 8. File Structure

```
src/
  registry/
    capability-registry.ts   # Core registry class + query logic
    schema.ts                # TypeScript interfaces (JSONSchema, Capability, etc.)
    migrations/
      001-initial.ts         # v1 registry seed data
      002-email-escalate.ts  # Flywheel promotion
    index.ts                 # Public exports
  nl/
    goal-matcher.ts          # NL-layer trigger matching (uses registry)
    plan-builder.ts          # Builds ExecutionPlan from matches
    fallback-handler.ts      # "I can't do that" handler
    extractor.ts             # LLM-based input extraction (implements inferInputs contract)
  execution/
    plan-executor.ts         # Executes an ExecutionPlan
    watch-state-store.ts     # Redis-backed store for condition:if_no_reply watch state
```

---

## 9. Open Questions

1. **Trigger scoring threshold**: What minimum score (0.0–1.0) should the NL layer require before treating a capability as a valid match? A threshold that is too high misses valid matches; too low causes false positives. We now use 0.5 as the default but this is tunable.

2. **Embedding vs. keyword matching**: Should trigger matching use TF-IDF/BM25 keyword overlap or dense embeddings? Embeddings are more semantically robust but introduce latency and a dependency on an embedding model. The document now provides a clear `embed()` scaffolding for OpenAI embeddings, and recommends a hybrid approach for production.

3. **Registry storage**: Is the registry a static JSON file loaded at startup, or a dynamic database that can be updated without a deploy? Flywheel promotion implies the latter, which introduces versioning and consistency concerns.

4. **Approval workflow UX**: `approvalConfig` now replaces the boolean `requiresApproval`. Who approves? A Slack DM? A web UI? The approval flow is execution-engine-level but affects how the NL layer frames the "I'm asking for approval" message to the user.

5. **Cross-capability input/output contracts**: When `condition:if_no_reply` passes control to `slack:post`, the output of `email:read` (the original message) must be passed through. These data flow contracts need a formal type system beyond `JSONSchema` to ensure correctness. We now use `semanticType` tags to establish field-level contracts, but full type inference across compositions (especially condition branches) remains an open design problem.
