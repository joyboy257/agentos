# AgentOS TODOs

## Context: Product Change

The TODOs below were updated on 2026-03-28 following a product pivot:
- **Old product:** Config Studio (browser-based agent config tool with Discovery Panel)
- **New product:** AgentOS Electron IDE (desktop app: visual canvas + integrated terminal runtime + Orchestrator)
- **Old TODOs:** T1-T4 from the Config Studio eng review are being updated for the Electron product

---

## T1: Define the agent lifecycle state machine

**What:** Specify exact agent states (`idle | running | waiting | error | completed`), transition rules, and restart/backoff strategy when a crashed agent is restarted by the watchdog.
**Why:** The design doc says "watchdog: restart crashed agents" but the restart policy (immediate vs backoff, max retries per session, notify before restart) is unspecced. The Orchestrator policy engine needs explicit state transitions to evaluate triggers correctly.
**Pros:** Eliminates undefined restart behavior; gives the policy engine a clean state machine to evaluate against.
**Cons:** Over-specifying before first agent runs means the state machine may miss real failure modes discovered in Phase 0.
**Context:** In Phase 0, agents run in isolation. When Phase 2 adds the Orchestrator, the policy engine needs to know: does `on_error` fire on the transition `running → error`? Does `on_timeout` reset when the agent retries? What is the backoff formula?
**Effort:** S | CC: S
**Priority:** P1
**Depends on:** Phase 0 runtime validation (must see real crash patterns first)
**Status:** OPEN

---

## T2: Add rollback procedure to CI/CD

**What:** Specify how to roll back a bad GitHub Pages deployment. GitHub Pages has no native rollback — you redeploy the previous known-good commit.
**Why:** If a malformed build ships to production, there's no defined procedure to recover. Engineers waste time figuring out what to do during an incident.
**Note:** This TODO was deferred from the prior design. It applies to the v0.1 static CDN deploy if that path is still used. For Electron builds, auto-update via electron-updater handles rollbacks differently (users get auto-updated to latest; no rollback to old Electron version without re-download).
**Effort:** S | CC: S
**Priority:** P2
**Depends on:** CI/CD pipeline specced for Electron (electron-builder config)
**Status:** OPEN

---

## T3: Define the PTY + stdout streaming architecture

**What:** Specify exactly how `node-pty` stdout data flows to xterm.js. The critical questions: (1) does node-pty's `onData` callback write directly to xterm.js, or through a MessagePort router? (2) How is backpressure handled when an agent produces output faster than xterm.js can render? (3) What happens to PTY state when the terminal tab is hidden (backgrounded)?
**Why:** Codex flagged this as a critical gap. Streaming without backpressure can freeze the UI or exhaust memory. The answer affects the entire IPC streaming layer.
**Context:** Phase 0 runtime sprint must answer this. The plan uses MessagePort per agent for routing, but node-pty is synchronous. The routing strategy (sync write vs async queue) must be specced before Phase 0 begins.
**Effort:** S | CC: S
**Priority:** P1
**Depends on:** None (pre-Phase 0 speccing required)
**Status:** OPEN

---

## T4: Define the SQLite trace write strategy

**What:** Specify how reasoning traces are written to SQLite without blocking the Electron main process event loop. Options: (1) batched writes on idle (`setImmediate`), (2) separate write-ahead log thread, (3) in-memory ring buffer flushed periodically.
**Why:** Codex flagged that `better-sqlite3` synchronous writes will block the event loop under trace-heavy load. The design doc mentions "batched flush on idle" as the mitigation but this needs a concrete spec.
**Context:** v0.2 adds reasoning trace persistence. The write strategy affects performance characteristics of the entire runtime.
**Effort:** S | CC: S
**Priority:** P1
**Depends on:** Phase 0 (need to measure real trace volume before choosing strategy)
**Status:** OPEN

---

## T5: Define the watch-and-learn eval criteria

**What:** Specify the statistical thresholds that define a "pattern" worth surfacing as a policy suggestion. Options: (1) mean + 2 standard deviations of tool call duration, (2) fixed thresholds (e.g., >10s = slow), (3) error rate > X% in a window.
**Why:** The "watch and learn" mode has no eval criteria. Without this, the Orchestrator surfaces random noise as "insights."
**Context:** Phase 3 adds the Orchestrator. The statistical criteria must be specced before the watch-and-learn feature can be implemented.
**Effort:** S | CC: S
**Priority:** P2
**Depends on:** Phase 2 runtime data (must have real event durations to calibrate)
**Status:** OPEN

---

## T6: Define the agent restart recovery procedure

**What:** Specify what happens when the app crashes mid-agent-run. Orphan agent processes may remain running. On restart, what is the recovery procedure? (1) Detect orphan PIDs on startup and clean them up? (2) Restore agent state from SQLite and resume? (3) Prompt user to manually restart?
**Why:** If the app crashes, users lose visibility into what was running. Without a recovery procedure, agents can "disappear" mid-task.
**Effort:** S | CC: S
**Priority:** P1
**Depends on:** Phase 2 (SQLite persistence + process registry must exist first)
**Status:** OPEN
