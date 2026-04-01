---
title: "feat: Typed Error Hierarchy for AgentHandleable Errors"
type: feat
status: active
date: 2026-03-31
---

# Typed Error Hierarchy for AgentHandleable Errors

## Overview

Introduce a typed error hierarchy that distinguishes between agent-recoverable errors (retryable, skippable) and fatal errors. This enables better user-facing error messages, smarter automatic retry, and clearer failure UX on the canvas.

## Problem Frame

Currently, all tool errors surface to users the same way: "Tool failed." Users can't tell:
- Was it a network timeout (retryable)?
- Was it a bad argument (fixable by user)?
- Was it a server error (not their fault)?

This creates confusion and unnecessary support load.

**From AgentScope:** `ToolInterruptedError` (agent can continue), `ToolNotFoundError` (skip), `ToolInvalidArgumentsError` (skip or fix).

## Requirements Trace

- R7 (from MVP): Reliable execution — typed errors power smarter retry UI and user-facing error categorization
- **New requirement:** Users see specific error types and recovery actions in the canvas

## Key Technical Decisions

**Decision: Three-tier error severity: retryable, skippable, fatal.**
- `RetryableError`: network timeouts, 429s, 5xx — runner retries automatically, user sees "Retrying..."
- `SkippableError`: bad arguments, not found — runner skips, user sees "Skipped: [reason]"
- `FatalError`: schema violations, auth failures — runner halts, user sees "Failed: [reason]"

**Decision: Error type is determined at translation time, not at throw time.**
- Rationale: The middleware (`error-translation.ts`) already translates raw errors. Add severity classification there.
- Runner decision: retry if `retryable`, skip if `skippable`, halt if `fatal`.

**Decision: Errors have a user-facing `message` and a developer `detail`.**
- `message`: human-readable, shown to user in canvas ("Email sending failed: rate limit exceeded")
- `detail`: technical detail, shown in "Details" expander ("429 Too Many Requests from Gmail API")

## Scope Boundaries

- **Error recovery automation** — only retry is automatic. Skip requires user confirmation. Fatal is shown only.
- **Error persistence** — errors are logged but not stored in DB for v1
- **Error categories beyond tools** — runner errors (cycle detection, etc.) are not typed for v1

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Call Layer                              │
│  gmail.send() → rejects → MCPClient catches                    │
└────────────────────┬────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Error Translation                               │
│  translateToolError(error, toolName)                             │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐             │
│  │RetryableErr │  │SkippableErr  │  │FatalErr  │             │
│  │ (severity:  │  │ (severity:   │  │(severity:│             │
│  │  'medium')  │  │  'low')      │  │  'high') │             │
│  └─────────────┘  └──────────────┘  └──────────┘             │
└────────────────────┬────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Runner                                      │
│  if (error instanceof RetryableError) → retry                 │
│  if (error instanceof SkippableError) → skip + notify          │
│  if (error instanceof FatalError) → halt + surface to user     │
└─────────────────────────────────────────────────────────────────┘
```

### Error Type Hierarchy

```typescript
// lib/errors/agent-errors.ts

class AgentError extends Error {
  readonly retryable: boolean
  readonly skippable: boolean
  readonly severity: 'low' | 'medium' | 'high' | 'critical'
  readonly toolName?: string
  readonly userMessage: string      // User-facing message
  readonly detail?: string          // Technical detail
}

class RetryableError extends AgentError {
  readonly retryable = true
  readonly skippable = false
  readonly severity: 'medium'
  readonly autoRetry = true
}

class SkippableError extends AgentError {
  readonly retryable = false
  readonly skippable = true
  readonly severity: 'low'
}

class FatalError extends AgentError {
  readonly retryable = false
  readonly skippable = false
  readonly severity: 'high' | 'critical'
  readonly autoRetry = false
}

// Tool-specific errors extend the above
class RateLimitError extends RetryableError { }
class InvalidArgumentError extends SkippableError { }
class AuthenticationError extends FatalError { }
class AuthorizationError extends FatalError { }
```

## Implementation Units

- [ ] **Unit 1: Error Type Hierarchy**

**Goal:** Define and export the error type hierarchy.

**Requirements:** R7

**Files:**
- Create: `lib/errors/agent-errors.ts` (all error types)
- Create: `lib/errors/index.ts` (exports)
- Test: `lib/errors/__tests__/agent-errors.test.ts`

**Approach:**
- `AgentError` base with all error properties
- Three subclasses: `RetryableError`, `SkippableError`, `FatalError`
- Tool-specific errors extend the appropriate base
- All errors are `Error` subclasses for proper stack traces

**Patterns to follow:**
- `agentscope/src/agentscope/exception/` for error hierarchy pattern
- `lib/middleware/error-translation.ts` for existing error handling

**Test scenarios:**
- `RetryableError.retryable === true`
- `SkippableError.skippable === true`
- `FatalError.autoRetry === false`
- Errors serialize to JSON correctly (for logging)

**Verification:**
- `npx vitest --run lib/errors/__tests__/agent-errors.test.ts` passes

---

- [ ] **Unit 2: Error Translation Update**

**Goal:** Update `error-translation.ts` to return typed errors with user-facing messages.

**Requirements:** R7

**Files:**
- Modify: `lib/middleware/error-translation.ts` — return typed errors
- Modify: `lib/middleware/error-translation.test.ts` — update tests

**Approach:**
- Update `translateToolError()` to return `RetryableError | SkippableError | FatalError` instead of `{ retryable: boolean, message: string }`
- Each error includes `userMessage` (human-readable) and `detail` (technical)
- Error mapping table (see below)

**Error mapping table:**

| Raw Error | Type | User Message | Detail |
|-----------|------|-------------|--------|
| 429 rate limit | `RetryableError` | "Rate limit exceeded. Retrying..." | "Gmail API rate limit" |
| 500 Gmail server error | `RetryableError` | "Gmail is having issues. Retrying..." | "500 Internal Server Error" |
| 401 auth failure | `FatalError` | "Gmail authorization expired. Please re-connect." | "401 Invalid credentials" |
| 403 permission denied | `FatalError` | "Permission denied for this Gmail action." | "403 Forbidden" |
| Invalid argument | `SkippableError` | "Invalid email address." | "Bad email format" |
| Tool not found | `SkippableError` | "Tool not available." | "Method not found in manifest" |
| Network timeout | `RetryableError` | "Connection timed out. Retrying..." | "ETIMEDOUT" |
| JSON parse error | `FatalError` | "Tool returned unexpected response." | "Invalid JSON from tool" |

**Patterns to follow:**
- Existing error translation pattern in `lib/middleware/error-translation.ts`

**Test scenarios:**
- 429 → `RetryableError` with correct userMessage
- 401 → `FatalError` with auth userMessage
- Invalid arg → `SkippableError`
- Unknown error → `FatalError` (fail safe)

**Verification:**
- All error translation tests pass

---

- [ ] **Unit 3: Runner Error Handling**

**Goal:** Runner uses error type to make retry/skip/halt decisions and surfaces typed errors to canvas.

**Requirements:** R7

**Files:**
- Modify: `lib/runtime/runner.ts` — use typed error for retry/skip/halt
- Modify: `lib/runtime/runner.ts` — emit error events with typed error info
- Modify: `lib/tracing/event-schema.ts` — add `error` event with type field

**Approach:**
- Runner catches `RetryableError` → increment retry count, continue
- Runner catches `SkippableError` → log warning, skip tool, emit `tool_skipped` event
- Runner catches `FatalError` → halt run, emit `run_error` with typed error
- SSE error events include: `error.type`, `error.userMessage`, `error.detail`

**Patterns to follow:**
- Existing runner error handling in `lib/runtime/runner.ts`
- SSE event emission in `lib/tracing/trace-emitter.ts`

**Test scenarios:**
- `RetryableError` triggers retry (up to max retries)
- `SkippableError` skips tool and continues
- `FatalError` halts run and emits error event
- Error appears in SSE with correct `userMessage`

**Verification:**
- Runner tests with typed errors pass

---

- [ ] **Unit 4: Canvas Error UI**

**Goal:** Canvas shows typed error states with user-facing messages and recovery actions.

**Requirements:** R7, R1

**Files:**
- Modify: `components/agent-card.tsx` — show error badge with message
- Modify: `components/reasoning-panel.tsx` — show typed errors in trace
- Create: `components/error-badge.tsx` (styled error indicator)

**Approach:**
- Agent card shows error state (red border) with error type badge
- Error badge shows `userMessage` on hover
- "Details" expander shows `detail` for developers
- Retry action button for `RetryableError` (manual retry)
- "Skip" action button for `SkippableError`

**Patterns to follow:**
- `components/agent-card.tsx` for status badge styling
- `components/approval-modal.tsx` for modal action buttons

**Test scenarios:**
- Agent card shows "Retrying..." for RetryableError
- Agent card shows "Skipped" for SkippableError
- Agent card shows "Failed" for FatalError
- Error detail expandable on click

**Verification:**
- Manual: trigger each error type, verify correct UI state

---

## System-Wide Impact

- **Runner:** Error type drives retry/skip/halt behavior
- **SSE:** Error events now carry typed error data
- **Canvas:** Error UI with user-facing messages and recovery actions
- **Tracing:** Errors are classified in the trace

## Risks & Dependencies

- **Incorrect error classification:** If a 500 is classified as `SkippableError` instead of `RetryableError`, the agent skips instead of retrying. Mitigation: conservative classification — when in doubt, retry.
- **Error message leakage:** `userMessage` should not expose internal system details. Mitigation: all messages go through a sanitization step.

## Documentation / Operational Notes

- Document error types in `docs/errors.md`
- Document error classification rules (for future maintainers adding new tools)
- Document "fail safe" principle: unknown errors are Fatal, not silently skipped

## Sources & References

- `agentscope/src/agentscope/exception/` — AgentScope exception hierarchy
- `lib/middleware/error-translation.ts` — existing error translation
