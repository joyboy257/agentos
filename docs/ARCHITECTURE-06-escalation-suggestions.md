# Architecture: Escalation Suggestions (Agent Self-Proposal)

**Document ID:** ARCHITECTURE-06
**Status:** Proposed
**Date:** 2026-04-02

---

## 1. Problem Statement

Damian Player's Perplexity Computer thesis identified the most "agent-like" behavior: after completing a task, the agent asks *"is there something I'm not asking about here that would make this more useful?"* — then proposes a schedule, a follow-on task, or a process improvement. This is the **agent self-proposal pattern**.

AgentOS has a two-tier escalation model (Approve / Edit / Skip / Cancel) for stopping execution when the agent needs human input. But it has no equivalent for the agent **proactively suggesting** what Maria should automate next.

This gap is a direct competitive disadvantage. Perplexity Computer surfaces this as a feature moment. AgentOS has no such mechanism.

---

## 2. The Self-Proposal Pattern

After every completed run, the agent should be able to propose:

1. **Recurring schedule** — "This task ran 3 times with the same input structure. You could schedule it to run automatically."
2. **Follow-on task** — "Based on what this task produced, you could add: [follow-on task]."
3. **Gap detection** — "You asked me to do X, but X requires Y which you haven't connected yet."
4. **Trust signals** — "I've completed 10 of these without escalating. You could raise my approval threshold."

These are not escalations. They are **suggestions** — Maria can accept, ignore, or refine them.

---

## 3. Design

### 3.1 Two Modes

**Mode A — Post-Run Reflection (Automatic)**
After every completed run, the agent evaluates whether suggestions apply. If yes, it emits a `suggestion` event which surfaces as a dismissible card on the canvas. This runs silently after every run — no action required from Maria.

**Mode B — On-Demand Query**
Maria types: "what else should I automate?" or "any suggestions for my team?" The agent runs the same evaluation logic but returns its top 3 suggestions directly to the conversation. This is a query, not a side-effect.

### 3.2 Suggestion Types

| Type | Trigger | Action |
|---|---|---|
| `schedule_recurring` | Same task run 3+ times with similar inputs | Propose cron schedule |
| `follow_on_task` | Task output suggests a natural next step | Propose a linked worker node |
| `connector_gap` | Agent tries tool it doesn't have access to | Propose connecting an app |
| `approval_bump` | 10+ consecutive auto-approved runs | Propose raising approval threshold |
| `budget_increase` | Agent consistently hits budget limit | Propose increasing budget |

### 3.3 Suggestion Schema

```typescript
interface EscalationSuggestion {
  id: string;              // ULID
  agentId: string;
  runId: string;           // The run that triggered this
  type: SuggestionType;
  confidence: number;      // 0.0–1.0
  trigger: {
    description: string;   // "This task ran 3 times this week"
    evidence: string[];    // ["Run 3: same CSV structure", "Run 7: same filter criteria"]
  };
  proposal: {
    headline: string;      // "Schedule this to run every Monday at 7am"
    detail: string;       // Longer explanation
    action: ProposalAction;
  };
  createdAt: string;       // ISO 8601
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
}

type SuggestionType =
  | 'schedule_recurring'
  | 'follow_on_task'
  | 'connector_gap'
  | 'approval_bump'
  | 'budget_increase';

interface ProposalAction {
  type: 'schedule' | 'add_node' | 'connect_app' | 'adjust_threshold' | 'adjust_budget';
  payload: Record<string, unknown>;  // type-specific
}
```

### 3.4 Proposal Payloads by Type

```typescript
// schedule_recurring
{
  type: 'schedule',
  payload: {
    agentId: string,
    cronExpression: string,         // "0 7 * * 1" = every Monday at 7am
    proposedLabel: string,          // "Every Monday at 7am"
    estimatedWeeklyRuns: number,
  }
}

// follow_on_task
{
  type: 'add_node',
  payload: {
    proposedNodeName: string,
    archetype: 'ingest' | 'process' | 'distill',
    triggerGoal: string,            // "follow up with leads who haven't replied in 7 days"
    wireTo: string[],              // node IDs this should connect to
  }
}

// connector_gap
{
  type: 'connect_app',
  payload: {
    missingCapability: string,     // "hubspot:leads"
    appName: string,                // "HubSpot"
    promptToConnect: string,        // "Connect HubSpot so I can read your leads"
  }
}

// approval_bump
{
  type: 'adjust_threshold',
  payload: {
    currentThreshold: string,        // "$5,000"
    proposedThreshold: string,       // "$10,000"
    runsSinceLastEscalation: number, // 12
  }
}
```

---

## 4. Evaluation Logic

### 4.1 When Post-Run Reflection Runs

```
Agent run completes (exit_reason: 'completed')
    │
    ▼
Post-Run Reflection Phase (automatic, silent)
    │
    ├── 1. Load last N runs for this agent from working memory
    ├── 2. Evaluate each suggestion trigger
    ├── 3. If any trigger fires (confidence > 0.7):
    │       └── Create EscalationSuggestion record
    └── 4. If suggestions exist:
            └── Emit 'suggestion' event → canvas card (dismissible)
```

### 4.2 Trigger Evaluation Functions

```typescript
// Trigger: schedule_recurring
async function evaluateScheduleRecurring(agentId: string): Promise<Suggestion | null> {
  const runs = await getLastNRuns(agentId, 10);
  const similarRuns = clusterByInputStructure(runs);

  for (const cluster of similarRuns) {
    if (cluster.count >= 3 && cluster.variance < SCHEDULE_THRESHOLD) {
      // Same structure, 3+ times → suggest scheduling
      return {
        type: 'schedule_recurring',
        confidence: Math.min(0.5 + (cluster.count * 0.1), 0.95),
        trigger: {
          description: `This task ran ${cluster.count} times with the same structure`,
          evidence: cluster.runIds.map(id => `Run ${id}: ${cluster.inputSignature}`),
        },
        proposal: {
          headline: `Schedule this to run ${inferFrequency(cluster.intervals)}`,
          detail: `You've run this ${cluster.count} times. I can run it automatically on a schedule so you don't have to trigger it manually.`,
          action: { type: 'schedule', payload: { cronExpression: inferCron(cluster) } },
        },
      };
    }
  }
  return null;
}

// Trigger: follow_on_task
async function evaluateFollowOnTask(agentId: string, lastRunOutput: unknown): Promise<Suggestion | null> {
  const outputSchema = inferOutputSchema(lastRunOutput);

  // Check if output schema has a natural follower
  const knownFollowers: Record<string, string> = {
    'email:read': 'email:send',
    'hubspot:leads': 'email:send',
    'web:search': 'distill:summarize',
    'calendar:query': 'email:send',  // "send meeting notes to attendees"
  };

  const follower = knownFollowers[outputSchema.primaryCapability];
  if (follower) {
    return {
      type: 'follow_on_task',
      confidence: 0.75,
      trigger: {
        description: 'Output has a natural next step',
        evidence: [`${outputSchema.primaryCapability} → ${follower}`],
      },
      proposal: {
        headline: `Add a ${follower} step after this task`,
        detail: `This task produces output that typically gets followed up on manually. I can add an automated follow-on step.`,
        action: { type: 'add_node', payload: { archetype: inferArchetype(follower) } },
      },
    };
  }
  return null;
}

// Trigger: connector_gap
async function evaluateConnectorGap(agentId: string): Promise<Suggestion | null> {
  // Check if this agent attempted to use a tool it doesn't have access to
  const failedToolAttempts = await getFailedToolAttempts(agentId);

  for (const attempt of failedToolAttempts) {
    if (attempt.reason === 'connector_not_connected') {
      const appName = inferAppFromTool(attempt.toolName);
      return {
        type: 'connector_gap',
        confidence: 0.9,
        trigger: {
          description: `Agent tried to use ${appName} but it's not connected`,
          evidence: [`Tool: ${attempt.toolName}`, `Error: ${attempt.reason}`],
        },
        proposal: {
          headline: `Connect ${appName} to unlock this capability`,
          detail: `I tried to read from ${appName} but you haven't connected it yet. Connecting it would let me handle this step automatically.`,
          action: { type: 'connect_app', payload: { appName, missingTool: attempt.toolName } },
        },
      };
    }
  }
  return null;
}

// Trigger: approval_bump
async function evaluateApprovalBump(agentId: string): Promise<Suggestion | null> {
  const escalationHistory = await getEscalationHistory(agentId, lastNRuns: 20);
  const autoApproved = escalationHistory.filter(e => e.decision === 'approved' && !e.wasEscalated);

  if (autoApproved.length >= 10) {
    const approvalRate = autoApproved.length / escalationHistory.length;
    if (approvalRate > 0.9) {
      return {
        type: 'approval_bump',
        confidence: 0.8,
        trigger: {
          description: `${autoApproved.length} of ${escalationHistory.length} runs were auto-approved`,
          evidence: escalationHistory.slice(-5).map(e => `Run ${e.runId}: ${e.decision}`),
        },
        proposal: {
          headline: 'Raise your approval threshold — I haven\'t needed help in a while',
          detail: `Out of my last ${escalationHistory.length} runs, I handled ${autoApproved.length} without escalating. You could raise my autonomy level.`,
          action: { type: 'adjust_threshold', payload: { runsAutoApproved: autoApproved.length } },
        },
      };
    }
  }
  return null;
}
```

---

## 5. UX: How Suggestions Surface

### 5.1 Canvas Suggestion Card

After a run completes and suggestions are generated, a dismissible card appears anchored to the relevant node:

```
┌──────────────────────────────────────────────────────────┐
│ 💡  Suggested improvement                                 │
│                                                          │
│ This task ran 3 times this week with the same input.    │
│ You could schedule it to run automatically.              │
│                                                          │
│ "Every Monday at 7am" — I'd handle the CSV and email   │
│ you the summary before your first meeting.               │
│                                                          │
│  [Schedule It]   [Edit Schedule]   [Dismiss]            │
└──────────────────────────────────────────────────────────┘
```

**Dismiss behavior:** Card disappears. `status: 'dismissed'`. Suggestion does not recur for this trigger unless Maria adds a similar task.

**Accept behavior:** Card shows "Scheduling..." → "Scheduled! Every Monday at 7am." Card updates to confirmation state.

### 5.2 On-Demand Query (Mode B)

Maria types in the NL prompt bar: "any suggestions for my team?"

```
┌──────────────────────────────────────────────────────────┐
│ 💡  3 suggestions for your team                          │
│                                                          │
│ 1. 📅 "Follow-up Research" could run every Monday       │
│    at 7am — you've run it manually 4 times.             │
│    [Schedule] [Ignore]                                   │
│                                                          │
│ 2. 🔗 "Lead Research" tried to access HubSpot but       │
│    it's not connected. Connecting it would let me        │
│    pull leads automatically.                            │
│    [Connect HubSpot] [Ignore]                            │
│                                                          │
│ 3. ⬆️ "Follow-up Email" has auto-approved 12 times.     │
│    You could raise the budget threshold from $5K to $10K│
│    [Raise Threshold] [Ignore]                            │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Suggestion in Escalation Modal

When Maria is reviewing an escalation, the modal includes:

```
┌──────────────────────────────────────────────────────────┐
│ ⚠️  [Lead Research Agent] wants to send a $50K follow-up│
│                                                          │
│ [Escalation reasoning trace...]                         │
│                                                          │
│ ────────────────────────────────────────                 │
│ 💡 While I'm here — this task has run 5 times.          │
│    I could schedule it to run automatically if you want.│
│    [Schedule It]  (do this after approving)             │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Data Model

### 6.1 Database Schema

```sql
CREATE TABLE escalation_suggestions (
  id              TEXT PRIMARY KEY,      -- ULID
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  run_id          TEXT NOT NULL REFERENCES runs(id),
  type            TEXT NOT NULL,        -- SuggestionType
  confidence      REAL NOT NULL,
  trigger_description TEXT NOT NULL,
  trigger_evidence JSONB NOT NULL,
  proposal_headline TEXT NOT NULL,
  proposal_detail  TEXT NOT NULL,
  proposal_action  JSONB NOT NULL,       -- ProposalAction
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,                 -- 'accepted' | 'dismissed' | 'expired'
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX idx_escalation_suggestions_agent ON escalation_suggestions(agent_id);
CREATE INDEX idx_escalation_suggestions_status ON escalation_suggestions(status);
CREATE INDEX idx_escalation_suggestions_created ON escalation_suggestions(created_at);
```

### 6.2 Suggestion Lifecycle

```
pending → accepted (Maria clicks "Schedule It")
pending → dismissed (Maria clicks "Dismiss" or suggestion expires)
pending → expired (7 days with no response)
accepted → active (schedule/node is live)
```

**Expiration:** Suggestions expire after 7 days. The agent does not re-propose the same suggestion within 30 days unless the underlying evidence changes significantly (e.g., task ran 3 more times).

---

## 7. Key Design Decisions

### 7.1 Suggestions are Non-Blocking

Suggestions never pause execution. They are side-effects of completed runs. Maria sees them when she next opens the canvas or answers an escalation. She can ignore them entirely.

### 7.2 Confidence Threshold

Only fire suggestions with `confidence >= 0.7` in post-run mode. This prevents noise. On-demand queries return the top 3 regardless of confidence.

### 7.3 No Re-Proposing the Same Suggestion

Accepted suggestions set a flag on the agent: "has_recurring_schedule_for_[task_signature]" — the trigger will not fire again for the same input signature within 30 days.

### 7.4 Escalation vs. Suggestion Separation

```
Escalation:     Agent CANNOT proceed without Maria's decision
Suggestion:     Agent CAN proceed; Maria may want to know about this
```

These are architecturally separate. Escalations pause the run. Suggestions do not.

### 7.5 On-Demand Queries Use Full Context

Mode B (on-demand) queries the full working memory history and returns the top 3 highest-confidence suggestions. This is the primary interface for Maria to discover automation opportunities without waiting for post-run reflection.

---

## 8. Implementation Phases

### Phase A: Core Mechanism (standalone — does not require Canvas UI)
- `escalation_suggestions` table
- `PostRunReflection` function (runs after every completed run)
- Schedule recurring trigger (most concrete, most valuable)
- Suggestion cards in escalation modal

### Phase B: Canvas UX
- Dismissible suggestion cards on canvas nodes
- Accept/dismiss flow
- Suggestion history in node detail panel

### Phase C: Full Mode B
- On-demand NL query: "any suggestions?"
- All suggestion types active
- Follow-on task and connector gap triggers

---

## 9. Open Questions

1. **Frequency capping:** How many suggestions can fire per run? (Recommended: max 2, highest confidence wins)
2. **Clustering threshold:** What variance in input structure counts as "the same task"? (Recommended: Jaccard similarity > 0.8 over 5 runs)
3. **Suggestion fatigue:** If Maria dismisses 5 schedule suggestions in a row, should we stop proposing schedules? (Recommended: yes, after 5 dismissals of the same type, quiet for 30 days)
4. **Long-term memory integration:** The suggestion engine should use cross-session memory (Phase 2) to detect patterns over weeks/months. In MVP (session-only memory), the trigger is limited to the last session.
