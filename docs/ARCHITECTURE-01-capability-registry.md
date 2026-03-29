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
   */
  inputSchema: JSONSchema;

  /**
   * JSON Schema describing the output this capability returns.
   * Used by the NL layer to format responses and by downstream
   * capabilities that consume this output as input.
   */
  outputSchema: JSONSchema;

  /**
   * If true, the execution engine halts and requests human approval
   * before invoking the underlying tools.
   * Applies to destructive or externally-sending actions (email send,
   * Slack post, file delete, payment).
   */
  requiresApproval: boolean;

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
   * Example prompt strings that correctly invoke this capability.
   * Used for few-shot prompting in the NL layer and for automated
   * regression testing of trigger matching.
   */
  examples?: string[];
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
  estimatedDuration?: number;  // milliseconds
  requiresApproval: boolean;   // OR of all step requiresApproval flags
}

interface ExecutionStep {
  capabilityId: string;
  inputs: Record<string, unknown>;
  dependsOn: string[];   // IDs of steps whose outputs this step consumes
}

interface RegistryQuery {
  goal: string;                  // raw user goal
  context?: Record<string, unknown>;  // current session context
  limit?: number;                // max results (default 5)
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
            id: { type: "string" },
            threadId: { type: "string" },
            from: { type: "string" },
            subject: { type: "string" },
            snippet: { type: "string" },
            body: { type: "string" },
            date: { type: "string" },
            labels: { type: "array", items: { type: "string" } }
          }
        }
      },
      totalCount: { type: "number" },
      nextPageToken: { type: "string", nullable: true }
    }
  },

  requiresApproval: false,

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
        description: "Recipient email addresses"
      },
      cc: {
        type: "array",
        items: { type: "string" },
        description: "CC recipient email addresses"
      },
      bcc: {
        type: "array",
        items: { type: "string" },
        description: "BCC recipient email addresses"
      },
      subject: {
        type: "string",
        description: "Email subject line"
      },
      body: {
        type: "string",
        description: "Plaintext or HTML email body"
      },
      threadId: {
        type: "string",
        description: "Thread ID to reply within (leave empty for new thread)"
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
      messageId: { type: "string" },
      threadId: { type: "string" },
      to: { type: "array", items: { type: "string" } },
      subject: { type: "string" },
      sentAt: { type: "string" }
    }
  },

  requiresApproval: true,

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
        description: "The search query string"
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
            title: { type: "string" },
            url: { type: "string" },
            snippet: { type: "string" },
            favicon: { type: "string" },
            source: { type: "string" },
            date: { type: "string", nullable: true }
          }
        }
      },
      totalResults: { type: "number" },
      query: { type: "string" }
    }
  },

  requiresApproval: false,

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
        enum: ["email", "slack"]
      },
      threadRef: {
        type: "string",
        description: "Reference to the specific thread or message ID to watch"
      },
      timeout: {
        type: "number",
        description: "Maximum seconds to wait before triggering onNoReply branch",
        default: 7200  // 2 hours
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

  requiresApproval: false,
  isControlFlow: true,

  examples: [
    "If they reply saying 'approved', send the contract. Otherwise send a reminder after 2 hours.",
    "Monitor this email thread for a response. If no one replies in 24 hours, close the ticket.",
    "Wait for a reply on Slack. If they confirm, proceed with the order. If not, cancel it."
  ]
}
```

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
        minimum: 1
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
      startedAt: { type: "string" },
      endedAt: { type: "string" },
      durationSeconds: { type: "number" }
    }
  },

  requiresApproval: false,
  isControlFlow: true,

  examples: [
    "Wait 30 seconds and then check again",
    "In 5 minutes, send me a reminder to review this",
    "Check the status again in 10 minutes",
    "Wait for an hour before sending the follow-up"
  ]
}
```

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
        description: "Slack channel name (with #) or user ID to post to"
      },
      text: {
        type: "string",
        description: "Main message text (supports Slack Markdown)"
      },
      threadTs: {
        type: "string",
        description: "Timestamp of parent message to reply in thread"
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
      ts: { type: "string", description: "Timestamp of posted message" },
      channel: { type: "string" },
      text: { type: "string" }
    }
  },

  requiresApproval: true,

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
        description: "Start of date/time range (ISO 8601)"
      },
      timeMax: {
        type: "string",
        description: "End of date/time range (ISO 8601)"
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
            id: { type: "string" },
            summary: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            attendees: { type: "array", items: { type: "string" } },
            location: { type: "string", nullable: true },
            description: { type: "string", nullable: true },
            colorId: { type: "string", nullable: true }
          }
        }
      }
    }
  },

  requiresApproval: false,

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
3. QUERY registry with goal text and extracted phrases
4. RANK matches by score (0.0–1.0)
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
   * Query the registry for capabilities matching a user goal.
   *
   * The NL layer calls this with the raw user goal and gets back
   * scored, ranked matches with inferred inputs.
   */
  async query(input: RegistryQuery): Promise<CapabilityMatch[]> {
    const { goal, context, limit = 5 } = input;

    // Step 1: Tokenize and normalize the goal
    const goalTokens = this.tokenize(goal);

    // Step 2: Score every capability by trigger overlap
    const scored: CapabilityMatch[] = [];

    for (const capability of this.capabilities.values()) {
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

      if (best.score > 0.1) {
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

  private cosineSimilarity(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter(x => b.has(x)));
    return intersection.size / Math.sqrt(a.size * b.size);
  }

  /**
   * Given a capability's inputSchema and the user goal,
   * extract parameter values from the goal text.
   *
   * Example:
   *   goal: "Email john@example.com about the Q1 budget"
   *   schema: { to: {...}, subject: {...}, body: {...} }
   *   → inferredInputs: { to: ["john@example.com"], subject: "Q1 budget" }
   */
  private inferInputs(
    schema: JSONSchema,
    goal: string,
    context?: Record<string, unknown>
  ): Record<string, unknown> {
    // Implementation uses NER (named entity recognition) or GPT-4o
    // completion to extract structured params from free text.
    // This is delegated to the NL layer's own extraction logic.
    // The registry schema is the contract that NL extraction targets.
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

  return {
    steps,
    requiresApproval: steps.some(s =>
      capabilities.get(s.capabilityId)?.requiresApproval
    )
  };
}

/**
 * Resolve which previous steps' outputs feed into this step's inputs.
 * A step B depends on step A if B's inputSchema references a type
 * that A's outputSchema produces.
 */
function resolveDependencies(
  capability: Capability,
  priorSteps: ExecutionStep[]
): string[] {
  const deps: string[] = [];
  const inputType = capability.inputSchema.type;

  for (const step of priorSteps) {
    const priorCap = capabilities.get(step.capabilityId);
    if (priorCap?.outputSchema.type === inputType) {
      deps.push(step.capabilityId);
    }
  }
  return deps;
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
  timestamp: string;
  userGoal: string;
  matchedCapabilities: string[];   // IDs of capabilities used
  executionPlan: ExecutionPlan;
  success: boolean;
  latencyMs: number;
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
      emailTo: { type: "array", items: { type: "string" } },
      emailSubject: { type: "string" },
      emailBody: { type: "string" },
      slackUserId: { type: "string" },
      slackMessage: { type: "string" },
      timeoutHours: { type: "number", default: 24 }
    },
    required: ["emailTo", "emailSubject", "emailBody", "slackUserId", "slackMessage"]
  },

  outputSchema: {
    type: "object",
    properties: {
      emailMessageId: { type: "string" },
      slackTs: { type: "string", nullable: true },
      outcome: { type: "string", enum: ["replied", "escalated", "pending"] }
    }
  },

  requiresApproval: true,
  isControlFlow: true,
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
  execution/
    plan-executor.ts         # Executes an ExecutionPlan
```

---

## 9. Open Questions

1. **Trigger scoring threshold**: What minimum score (0.0–1.0) should the NL layer require before treating a capability as a valid match? A threshold that is too high misses valid matches; too low causes false positives.

2. **Embedding vs. keyword matching**: Should trigger matching use TF-IDF/BM25 keyword overlap or dense embeddings? Embeddings are more semantically robust but introduce latency and a dependency on an embedding model.

3. **Registry storage**: Is the registry a static JSON file loaded at startup, or a dynamic database that can be updated without a deploy? Flywheel promotion implies the latter, which introduces versioning and consistency concerns.

4. **Approval workflow UX**: `requiresApproval: true` pauses execution, but who approves? A Slack DM? A web UI? The approval flow is execution-engine-level but affects how the NL layer frames the "I'm asking for approval" message to the user.

5. **Cross-capability input/output contracts**: When `condition:if_no_reply` passes control to `slack:post`, the output of `email:read` (the original message) must be passed through. These data flow contracts need a formal type system beyond `JSONSchema` to ensure correctness.
