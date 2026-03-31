# Claude Code Harness Analysis — AgentOS Theft Reference

**Source:** Leaked Claude Code source (https://github.com/lowcortisolprogrammer/claude-code)
**Date:** 2026-03-31
**Purpose:** Architectural pattern extraction for AgentOS Phase 2+ development

---

## Executive Summary

Claude Code is a world-class agent harness for interactive coding. AgentOS is a platform for durable scheduled business task agents. These are different execution models — but the **patterns** translate across.

This document maps every significant technical domain in Claude Code to its applicability for AgentOS, organized by theft priority.

---

## Domain 1: Core Agent Loop

### What Claude Code Does
Interactive chat loop via `async function* query()` (1700+ lines). State machine using labeled `while(true)` with `continue` sites. Each turn: stream assistant message → collect `tool_use` blocks → execute tools → recurse with updated messages. Returns typed exit reasons: `completed | aborted_streaming | max_turns | prompt_too_long`.

### Key Files
- `query.ts` — main loop
- `QueryEngine.ts` — session-level wrapper
- `query/stopHooks.ts` — turn boundary hooks
- `query/tokenBudget.ts` — per-turn token accounting

### AgentOS Applicability
- Phase 1 `DurableRunner.execute()` already has a loop — could adopt typed exit reasons
- Turn counting with `maxTurns` halt → we have step limits, need typed halt reasons
- `turnCount` in loop state → our `Run` table could track turns per heartbeat

### Verdict: **Partial steal.** The loop pattern translates; the chat-triggered execution model does not.

---

## Domain 2: Tool System

### What Claude Code Does
Rich `Tool<Input, Output, ProgressData>` interface with Zod schemas, `prompt()`, `isConcurrencySafe()`, `renderToolResultMessage()`. 45+ built-in tools. Permission system with `alwaysAllow/alwaysDeny/alwaysAsk` rules from multiple sources (settings, CLI args, session, hooks).

### Key Files
- `Tool.ts` — interface definition
- `tools.ts` — registry + `feature()` gate DCE
- `services/tools/toolExecution.ts` — individual tool run
- `utils/permissions/permissions.ts` — permission rules

### AgentOS Applicability
- `isConcurrencySafe()` → **critical** for us — Gmail read (safe) vs send (unsafe)
- `isReadOnly()` / `isDestructive()` → same concern
- Permission rules → our escalation system IS a permission system
- `interruptBehavior(): 'cancel' | 'block'` → our `waiting_for_approval` IS this

### Verdict: **Must steal.** Concurrency partitioning is non-negotiable for Gmail.

---

## Domain 3: Concurrency & Streaming

### What Claude Code Does
**The highest-value theft.** Tools fire as `tool_use` blocks arrive during streaming — before the response completes. `partitionToolCalls()` splits tools into read-only (parallel) vs write (serial). `StreamingToolExecutor` queues tools dynamically, respects `canExecuteTool()` gating.

```
canExecuteTool(): if any non-safe tool running, everything waits
getMaxToolUseConcurrency() → default 10 (env var: CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY)
Sibling abort cascade: one Bash error → siblingAbortController.abort('sibling_error')
```

### Key Files
- `services/tools/StreamingToolExecutor.ts` — core streaming tool exec
- `services/tools/toolOrchestration.ts` — `partitionToolCalls()`, `runToolsConcurrently()`

### AgentOS Applicability
- When LLM streams Gmail tool calls, execute immediately — Maria sees "drafting..." before full reasoning
- Gmail read in parallel, Gmail send serial
- Configurable concurrency limits
- Sibling abort for Gmail tool chains

### Verdict: **Must steal.** Immediate UX win and correctness win.

---

## Domain 4: Context Compaction — 4 Distinct Algorithms

### What Claude Code Does

| Layer | Trigger | Mechanism |
|-------|---------|-----------|
| **Snip** | Before API call | Removes message ranges by ID, creates snip boundary marker |
| **Microcompact** | Per-message | Time-based: clears old tool results if gap exceeds threshold; or `cache_edits` API mode |
| **Context Collapse** | 90%/95% thresholds | Granular archive-with-projection, owns headroom, suppresses autocompact |
| **Autocompact** | ~93% context | Full summarization via forked agent, `compactBoundary` marker, re-injects recent attachments |

**Token counting:** Custom ~4 chars/token estimator (not tiktoken). `AUTOCOMPACT_BUFFER_TOKENS = 13,000` reserved for output.

**Compaction prompt:** `<analysis>` tags (stripped) → `<summary>` tags (kept). Three variants: full, partial-from, partial-up-to.

**Compact boundary:** `SystemCompactBoundaryMessage` with `headUuid/anchorUuid/tailUuid` chain for session restore.

### Key Files
- `services/compact/compact.ts` — main compaction
- `services/compact/autoCompact.ts` — auto trigger + circuit breaker
- `services/compact/microCompact.ts` — per-message budget
- `services/compact/prompt.ts` — compaction prompt templates

### AgentOS Applicability
- Phase 1 working memory is single-layer — Phase 2 needs something like this
- Token budgeting for LLM calls in long-running agents
- Compaction prompts for long-term memory summarization (Phase 2)

### Verdict: **Phase 2 steal.** Don't need 4 layers yet, but design for it.

---

## Domain 5: Multi-Agent — 3 Spawn Modes

### What Claude Code Does

| Mode | Context | Prompt Cache | Communication |
|------|---------|-------------|---------------|
| **AgentTool** (`worker`) | Full isolation, cloned file state | Fresh | `SendMessage`, `task-notification` XML |
| **ForkSubagent** | Parent's full history | **Byte-identical prefix = cache hits** | `TombstoneMessage` delivery |
| **Coordinator** | Coordinator's own | Restricted tool set | Spawns workers, 4-phase workflow |

**Sidechain transcripts:** Forked agents write to `transcripts/sidechain/<agentId>/` — parent's transcript stays clean.

**Abort hierarchy:** Sync agents share parent's `AbortController`. Async get isolated.

**Recursive guard:** `<FORK_BOILERPLATE_TAG>` prevents infinite fork recursion.

### Key Files
- `tools/AgentTool/AgentTool.tsx` — main spawn
- `tools/AgentTool/forkSubagent.ts` — fork pattern
- `tools/AgentTool/runAgent.ts` — subagent lifecycle
- `coordinator/coordinatorMode.ts` — coordinator mode

### AgentOS Applicability
- When Research Agent hands to Email Agent — shared context = prompt cache hits
- Each agent's transcript isolated (sidechain pattern)
- Coordinator = Maria as team lead
- `AgentTool` spawn = our delegation protocol

### Verdict: **Phase 2 steal.** This is exactly how AgentOS multi-agent delegation should work.

---

## Domain 6: MCP Integration

### What Claude Code Does
23 files implementing full MCP client. STDIO, SSE, StreamableHTTP, WebSocket transports. Full OAuth2 + PKCE flow with token refresh, 15-min auth cache TTL, lockfile for concurrent writes. Agent-specific MCP connections (additive to parent's).

**Tool naming:** `mcp__serverName__toolName` prefix.

**Session expiry:** HTTP 404 + JSON-RPC code -32001 → reconnect.

### Key Files
- `services/mcp/client.ts` — main implementation
- `services/mcp/auth.ts` — OAuth + token refresh
- `services/mcp/useManageMCPConnections.tsx` — React lifecycle hook

### AgentOS Applicability
- We need STDIO + SSE at minimum
- Align OAuth token storage (keychain, not Postgres)
- Tool naming convention — follow `mcp__serverName__toolName`
- Agent-specific MCP connections for Phase 2

### Verdict: **Steal now (transport + auth).** Phase 2 (agent-specific MCP).

---

## Domain 7: Error Handling

### What Claude Code Does

**413 PTL cascade:** Collapse drain → retry → reactive compact (peels oldest message groups, 20% at a time) → max 3 PTL retries → surface error.

**Withheld errors:** PTL detected during streaming but buffered — model might produce valid content after the error. Only yielded if recovery exhausts.

**Circuit breaker:** 3 consecutive autocompact failures → skip autocompact entirely.

**Exponential backoff:** `withRetry()` for 529/429. Only foreground retries on 529.

### Key Files
- `services/api/errors.ts` — error classification
- `services/api/withRetry.ts` — retry logic
- `query.ts` (lines 1061-1256) — PTL recovery cascade

### AgentOS Applicability
- Our LLM calls have no retry logic — add `withRetry()`
- PTL → collapse → retry cascade for long prompts
- Circuit breaker for escalation retry loops

### Verdict: **Steal now.** Error recovery is missing from our LLM call paths.

---

## Domain 8: Session Persistence

### What Claude Code Does
JSONL transcript format. Large tool results stored separately with `content_replacement_id`. Progress messages NOT persisted. Resume reconstructs from transcript + content replacement records. `readHeadAndTail()` for portable session loading.

### Key Files
- `utils/sessionStorage.ts` — core persistence
- `utils/toolResultStorage.ts` — large result offloading

### AgentOS Applicability
- Our `resume()` from checkpoint row is analogous — already done
- Could offload large Gmail attachments outside run row

### Verdict: **Already done (simpler).** Nice to have for large attachments.

---

## Domain 9: Skills System

### What Claude Code Does
Directory-based convention (`skills/<name>/SKILL.md`) with YAML frontmatter. Skills are **prompts-as-tools** — the SKILL tool renders markdown as text to the model. Not executable code.

**Frontmatter schema:**
```yaml
name: string
description: string
allowed-tools: string[]        # tool allowlist
argument-hint: string         # e.g. "<arg1> <arg2>"
when_to_use: string           # when to invoke
model: string | 'inherit'
disable-model-invocation: boolean
user-invocable: boolean      # default true
hooks: HooksSettings
context: 'inline' | 'fork'   # execution context
agent: string                # delegate to named agent
paths: string[]               # conditional activation (gitignore-style)
```

**Loading pipeline:**
- Sources: `~/.claude/skills/`, `.claude/skills/` (project), `--add-dir` paths
- Deduplication by resolved realpath
- Conditional skills: `paths` frontmatter → activated when matching files touched
- Dynamic discovery: walks up from file paths to find nested `.claude/skills/`

**17 bundled skills** (compiled into binary): `batch.ts`, `claudeApi.ts`, `debug.ts`, `keybindings.ts`, `loop.ts`, `remember.ts`, `scheduleRemoteAgents.ts`, `simplify.ts`, `skillify.ts`, `stuck.ts`, `updateConfig.ts`, `verify.ts`...

### Key Files
- `skills/loadSkillsDir.ts` — loading + discovery
- `skills/bundled/skillify.ts` — tool → skill conversion
- `bootstrap/state.ts` — `getInvokedSkillsForAgent()` tracking

### AgentOS Applicability
- Skills = our **template system** — directory convention, editable markdown
- `skills/email-agent/SKILL.md` — "You are a professional email agent..."
- `skills/meeting-scheduler/SKILL.md` — "You schedule meetings..."
- Conditional activation by agent type or user
- Skills are **plain text files** — users can edit them

### Verdict: **Steal now.** Skills are templates. Replace our hardcoded templates with a skill directory convention.

---

## Domain 10: Feature Flag Architecture

### What Claude Code Does
Build-time dead code elimination via `feature('FLAG')` from `bun:bundle`. Combined with GrowthBook runtime kill-switches.

```typescript
feature('VOICE_MODE')
  ? !getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_quartz_disabled', false)
  : false
```

**Major flags:**

| Flag | Feature |
|------|---------|
| `VOICE_MODE` | Voice I/O |
| `CONTEXT_COLLAPSE` | Granular message archiving |
| `HISTORY_SNIP` | Pre-query message removal |
| `FORK_SUBAGENT` | Implicit fork of conversation |
| `CHICAGO_MCP` | Computer use wrapper |
| `KAIROS` | Assistant mode |
| `PROACTIVE` | Proactive mode |
| `TEAMMEM` | Team memory |
| `MCP_SKILLS` | Convert MCP tools to skills |
| `COORDINATOR_MODE` | Manager/worker orchestration |
| `AGENT_TRIGGERS` / `AGENT_TRIGGERS_REMOTE` | **Scheduled/triggered agents** |
| `BG_SESSIONS` | Background sessions |
| `TOKEN_BUDGET` | Token budgeting |
| `MONITOR_TOOL` | Monitoring tool |
| `WORKFLOW_SCRIPTS` | Workflow scripting |

### Key Files
- `bun:bundle` — build-time feature detection
- Feature checks scattered across codebase

### AgentOS Applicability
- `feature('STREAMING_TOOL_EXEC')` — gate streaming tool exec behind flag
- `feature('LONG_TERM_MEMORY')` — gate Phase 2 features
- `feature('MULTI_AGENT_DELEGATION')` — gate fork/coordinator
- GrowthBook is overkill — simple `features.ts` config map

### Verdict: **Steal now.** Implement `features.ts` before Phase 2.

---

## Domain 11: Remote / Bridge Architecture

### What Claude Code Does
20+ files in `bridge/`. Persistent remote sessions via a work-scheduling protocol.

**Core protocol:**
1. Bridge registers with Anthropic infrastructure via `registerWorker()` with work secret
2. Spawns Claude Code child processes per session
3. HTTP long-poll for assigned work
4. JWT-authenticated heartbeat to stay alive
5. JWT refresh via `createTokenRefreshScheduler()`
6. Git worktrees for isolated session state

**Backoff config:**
```
connInitialMs: 2000
connCapMs: 120000      # 2 min max
connGiveUpMs: 600000   # 10 min max
pollSleepDetectionThresholdMs: 2x connBackoffCap
```

**Transport:** SSE, WebSocket, STDIO (local subprocess)

### Key Files
- `bridge/bridgeMain.ts` — main loop (115K+ chars)
- `bridge/replBridge.ts` — REPL bridge (100K+ chars)
- `bridge/remoteBridgeCore.ts` — protocol core
- `bridge/jwtUtils.ts` — JWT refresh

### AgentOS Applicability
- BullMQ + Postgres IS our bridge — different substrate, same pattern
- Work polling = cron triggers
- Session lifecycle = agent heartbeats
- JWT auth = our session tokens
- This is **exactly** what we're building — Claude Code is 6-12 months ahead

### Verdict: **Reference architecture.** Study deeply for Phase 3.

---

## Domain 12: Remote Agent Scheduling

### What Claude Code Does
`scheduleRemoteAgents.ts` — bundled skill implementing:

```typescript
RemoteTriggerTool: CRUD for scheduled CCR triggers
- Environment management
- MCP connector integration
- Cron scheduling
- Requires: tengu_surreal_dali GrowthBook flag + allow_remote_sessions policy
```

Enabled by `AGENT_TRIGGERS` and `AGENT_TRIGGERS_REMOTE` feature flags.

### For AgentOS
This IS what Phase 2 heartbeat scheduling is. `AGENT_TRIGGERS` + `scheduleRemoteAgents.ts` = scheduled persistent agents.

**Critical signal:** Claude Code is building toward exactly what AgentOS is building. They are 6-12 months ahead on the same product trajectory.

### Verdict: **Phase 2 target architecture.** Build toward this.

---

## Domain 13: MCP Full Implementation

### What Claude Code Does
23 files. Full OAuth2 + PKCE with token refresh. Lockfile for concurrent writes. 15-min auth cache. Sensitive params redacted from logs (`state`, `code`, `access_token`, `refresh_token`).

### Key Constants
```
MAX_LOCK_RETRIES: 5
MCP_AUTH_CACHE_TTL_MS: 15 * 60 * 1000  # 15 min
AUTH_REQUEST_TIMEOUT_MS: 30000           # 30s
DEFAULT_MCP_TOOL_TIMEOUT_MS: 100_000_000 # ~27.8 hours
```

### For AgentOS
- Align Gmail OAuth token storage with keychain pattern
- Our current Postgres-based token storage is fine for MVP, migrate later
- Dynamic OAuth port selection (49152-65535) is a good security detail

---

## Domain 14: Bundled Skill — `remember.ts`

### What Claude Code Does
Built-in memory/persistence skill — how Claude Code handles "remember this preference" across sessions.

### For AgentOS
Confirms memory is a first-class concern. Phase 2 long-term memory (mem0.ai + Qdrant) is our `remember.ts`.

---

## Domain 15: `updateConfig.ts` — Settings as Skill

### What Claude Code Does
A skill that edits `settings.json` with hook verification and merge strategies.

### For AgentOS
Our canvas dashboard IS a settings editor for agents. Treating config as a skill with a skill editor is a powerful pattern.

---

## Domain 16: Desktop/IDE Integration

### What Claude Code Does
VS Code SDK MCP, Claude-in-Chrome, trusted device auth.

### For AgentOS
Not immediately relevant. Web app is our interface.

---

## Theft Priority Matrix

| Domain | Priority | Timeline | Effort |
|--------|----------|----------|--------|
| **3. Concurrency & Streaming** | Must steal | Phase 1.5 | Medium |
| **2. Tool System** (`isConcurrencySafe`) | Must steal | Phase 1.5 | Low |
| **7. Error Handling** (retry, PTL cascade) | Must steal | Phase 1.5 | Medium |
| **9. Skills System** | Must steal | Phase 1.5 | Medium |
| **10. Feature Flags** | Must steal | Phase 1.5 | Low |
| **13. MCP Transport + Auth** | Steal | Phase 2 | Medium |
| **4. Compaction** | Phase 2 | Phase 2 | High |
| **5. Multi-Agent** (fork, sidechain) | Phase 2 | Phase 2 | High |
| **12. Agent Triggers** | Phase 2 target | Phase 2 | High |
| **11. Bridge Architecture** | Reference | Phase 3 | N/A |
| **6. MCP (agent-specific)** | Phase 2 | Phase 2 | Medium |
| **1. Core Loop** | Partial | Ongoing | Low |
| **8. Session Persistence** | Already done | — | — |

---

## Critical Insight: Claude Code Is 6-12 Months Ahead

The `AGENT_TRIGGERS` / `AGENT_TRIGGERS_REMOTE` flags combined with `scheduleRemoteAgents.ts` reveal that **Claude Code is building toward exactly what AgentOS is building** — scheduled, persistent, remote AI workers.

Their architecture is a preview of our Phase 2+ target state. Key signals:
- `scheduleRemoteAgents.ts` = heartbeat scheduling
- `forkSubagent` = context inheritance for delegation
- `sidechain transcripts` = isolated agent state
- `BG_SESSIONS` = background agent sessions
- `TEAMMEM` = team-level memory

---

## Recommended Phases

### Phase 1.5: Immediate Wins
- `isConcurrencySafe()` on Gmail tools
- `partitionToolCalls()` for Gmail read/write safety
- `StreamingToolExecutor` for real-time progress feedback
- Error recovery cascade for LLM calls
- `withRetry()` on API calls
- `features.ts` feature flag system
- Skills directory as template system replacement

### Phase 2: Multi-Agent + Memory
- Fork subagent pattern for context inheritance
- Sidechain transcripts per agent
- `remember.ts`-style long-term memory (mem0.ai + Qdrant)
- `scheduleRemoteAgents.ts`-style heartbeat scheduling
- `CONTEXT_COLLAPSE` for 30+ run sessions
- Agent-specific MCP connections
- `feature('MULTI_AGENT_DELEGATION')` gate

### Phase 3: Bridge Architecture
- Work polling + heartbeat protocol
- Git worktree isolation per agent session
- JWT session auth
- Background sessions (`BG_SESSIONS`)
- Monitor/alerting system

---

## Supplemental Insights from Source Read-Through

* contributed by human reviewer of leaked source

---

### KAIROS — Autonomous Daemon Mode (154 references)

The most heavily referenced feature flag in the entire codebase. This is an **always-on autonomous mode** that transforms Claude Code into a persistent background agent.

Core capabilities being built:
- **Background sessions** — Claude Code runs continuously, not just when prompted
- **"Dream" memory consolidation** — periodic memory processing while idle (like REM sleep for agents)
- **GitHub webhook subscriptions** — agent reacts to repo events autonomously
- **Push notifications** — agent proactively notifies rather than waiting for user
- **Channel-based communication** — multi-channel inbox for agent-to-user and agent-to-agent messages

This is **literally AgentOS's core product thesis**. They are building an always-on daemon that works while you sleep. We are not competing with them — we are parallel-pathing the same destination.

---

### PROACTIVE Mode (37 references)

Between-user autonomous work. The system sends **"tick" prompts** to wake the agent and it decides what to do.

The system prompt literally includes:
> "You are running autonomously"
> "look for useful work"
> "act on your best judgment rather than asking for confirmation"

This is exactly Maria's agent in Phase 1 — it checks for work, decides what to do, acts. **PROACTIVE is the production version of what we're building.**

---

### COORDINATOR_MODE (32 references)

Manager/worker orchestration. The coordinator spawns parallel workers for **research → implementation → verification** phases.

System prompt details:
- How to write prompts for workers
- When to continue vs spawn fresh agents
- How to handle worker failures
- Worker timeout handling

This is **exactly our Phase 2 multi-agent delegation**. The fork + sidechain patterns from the technical analysis are the implementation substrate for this coordinator.

---

### TRANSCRIPT_CLASSIFIER (107 references)

An **AI classifier that auto-approves tool permissions**. If this ships, permission prompts could become optional or disappear entirely for trusted operations.

For AgentOS: this is the escalation-free future. Maria's agent eventually reaches a point where it knows what to do and doesn't need to ask. The `important escalation capture rate` metric from our PRD (vs "unnecessary escalation rate") is this same idea — we want the agent to only escalate what genuinely needs human judgment.

---

### MODEL CODENAMES

| Codename | What It Means |
|----------|--------------|
| **Capybara** | Claude 4.6 variant. References mention "Capybara v8" with 29-30% false claims rate vs v4's 16.7%. Also has a tendency to over-comment code and includes an "assertiveness counterweight." |
| **Fennec** | Migrated to Opus 4.6 |
| **Numbat** | Unreleased. Comment: "Remove this section when we launch numbat" |
| **opus-4-7**, **sonnet-4-8** | Referenced as versions that "should never appear in public commits" |

The Capybara false-claims rate (29-30%) vs v4 (16.7%) is a significant regression. This has product implications — AgentOS should consider whether to pin to specific model versions or build guardrails around agent truthfulness.

---

### UNDERCOVER MODE

For Anthropic employees contributing to public repos. When active:
- Strips ALL AI attribution from commits
- Hides model codenames
- Removes any mention of "Claude Code" or AI
- Doesn't tell the model what model it is

Critically: **no force-OFF switch**. If the system isn't confident it's an internal repo, undercover stays on by default.

---

### VOICE_MODE (46 references)

Speech-to-text + text-to-speech integration. Uses `voice_stream` endpoint on claude.ai (not the public API). Requires Anthropic OAuth tokens.

---

### BUDDY SYSTEM — Tamagotchi for the Terminal

18 species: duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk.

Rarity tiers: legendary is 1%.

Cosmetics: hats (crown, tophat, propeller, halo, wizard, beanie, tinyduck).

Stats: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK.

Shiny variants exist.

**Note:** Capybara's name is obfuscated using `String.fromCharCode()` specifically to avoid triggering Anthropic's internal leak-detection scanners. This confirms capybara is a sensitive codename internally.

---

### Other Notable Flags

| Flag | Meaning |
|------|---------|
| `FORK_SUBAGENT` | Fork into parallel agents |
| `VERIFICATION_AGENT` | Independent adversarial verification of work |
| `ULTRAPLAN` | Advanced planning capabilities |
| `WEB_BROWSER_TOOL` | Browser automation |
| `TOKEN_BUDGET` | Explicit token budget targeting (`+500k`, `spend 2M tokens`) |
| `TEAMMEM` | Team memory sync across users |
| `BG_SESSIONS` | Background sessions |
| `EXTRACT_MEMORIES` | Memory extraction |

---

### What This Means for AgentOS

**KAIROS confirms the product direction is right.** Claude Code — a company with far more resources — is converging on the same always-on daemon architecture. We are building the right thing.

**KAIROS also creates urgency.** If Anthropic ships KAIROS broadly, they become a direct competitor in the always-on agent space. The window for AgentOS as an independent platform may be 6-12 months.

**The codename false-claims data is a product risk.** If Capybara (the variant we'd use) has a 29-30% false claims rate, we need guardrails. AgentOS is deploying into business workflows where factual accuracy matters.

**The Buddy system is a design lesson.** Even in a professional tool, personality and delight drive engagement. Maria's canvas dashboard should feel alive, not like a cold admin panel.

**Undercover mode is a security lesson.** Even with access to the source, Anthropic still protects against accidental attribution. We should think about what AgentOS's "undercover mode" would look like — e.g., agent behaviors that don't reveal AI involvement.

---

## Appendix: Key Files Reference

| Domain | Primary Files |
|--------|--------------|
| Core Loop | `query.ts`, `QueryEngine.ts` |
| Tools | `Tool.ts`, `tools.ts`, `services/tools/toolExecution.ts` |
| Streaming | `StreamingToolExecutor.ts`, `toolOrchestration.ts` |
| Compaction | `compact.ts`, `autoCompact.ts`, `microCompact.ts` |
| Multi-Agent | `AgentTool.tsx`, `forkSubagent.ts`, `runAgent.ts`, `coordinatorMode.ts` |
| MCP | `services/mcp/client.ts`, `services/mcp/auth.ts` |
| Error Handling | `errors.ts`, `withRetry.ts` |
| Persistence | `sessionStorage.ts`, `toolResultStorage.ts` |
| Skills | `loadSkillsDir.ts`, `bundled/skillify.ts` |
| Remote Bridge | `bridge/bridgeMain.ts`, `bridge/replBridge.ts`, `remoteBridgeCore.ts` |
| Feature Flags | Scattered — `feature('FLAG')` throughout |
