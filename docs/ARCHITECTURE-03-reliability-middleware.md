# Architecture: Reliability Middleware for Tool Execution

**Date:** 2026-03-29
**Status:** Proposed
**Owner:** Engineering

---

## 1. The Problem

The current `InProcessRunner` (see `app/lib/runtime/runner.ts`) calls tool functions directly with zero reliability infrastructure:

```typescript
// runner.ts lines 105-135 — direct, unaudited tool calls
if (tools.includes('gmail.read')) {
  const result = await gmailReadTool('is:unread newer_than:1d', 'demo')
  output = { agentId, role: agent.role, status: 'completed', data: result }
} else if (tools.includes('gmail.send')) {
  const result = await gmailSendTool(draftData.draft.to, draftData.draft.subject, draftData.draft.body, 'demo')
  output = { agentId, role: agent.role, status: 'completed', data: result }
} else if (tools.includes('web.search')) {
  const result = await webSearchTool('research leads', 10)
  output = { agentId, role: agent.role, status: 'completed', data: result }
} else if (tools.includes('llm')) {
  const result = await llmTool(`Context:\n${context}\n\nTask: ${agent.description}`, system)
  output = { agentId, role: agent.role, status: 'completed', data: { kind: 'llm', response: result.text, model: 'gpt-4o' } }
}
```

**Failure modes today:**

| Scenario | What Happens |
|----------|--------------|
| Gmail API returns 401 | Raw `Error: 401 Unauthorized` thrown, agent fails, run may cascade-fail |
| Gmail API returns 429 | Raw `Error: 429 Too Many Requests` thrown, no retry, immediate death |
| Gmail API returns 500 | Raw `Error: 500 Internal Server Error` thrown, no retry |
| Network timeout (10+ seconds) | Call hangs indefinitely, runner concurrency stalls |
| Gmail read takes 45 seconds | No timeout, UI shows no progress, user has no idea what is happening |
| API returns a non-JSON error body | Error propogates as-is, LLM sees raw garbage |

**The core issue:** Raw API errors are unfiltered. They go straight into the agent's error handler (runner.ts line 156-174), which stuffs the raw message into `output.error` and continues. The LLM then sees unstructured, API-centric error messages that it cannot interpret or recover from.

---

## 2. The Solution

Wrap every tool call in a **reliability middleware layer** (`ToolExecutor`) that sits between the runner and the raw tool implementations.

```
Runner                     ToolExecutor                   Raw Tool
──────                     ─────────────                   ────────
executeAgent() ──────────► executeTool() ──────────────► gmailReadTool()
                              │
                              ├── withTimeout()           (AbortController)
                              │
                              ├── withRetry()             (exponential backoff + jitter)
                              │
                              └── translateToolError()     (401/403/429/500/network → structured)
                              │
                         ToolResult
                         { llmMessage, userMessage, retryable, data }
```

**Four components:**

1. **`withRetry`** — retry loop with exponential backoff + jitter
2. **`withTimeout`** — per-call deadline via `AbortController`
3. **`translateToolError`** — error classification and human-readable translation
4. **`executeTool`** — the orchestrator that composes the above three

---

## 3. Retry with Exponential Backoff + Jitter

```typescript
// app/lib/runtime/middleware/retry.ts

export interface RetryConfig {
  maxRetries: number      // default 3
  baseDelay: number        // ms, default 1000
  backoffFactor: number    // default 2 (exponential)
  maxDelay: number         // ms, default 30000
  jitter: boolean          // random jitter to prevent thundering herd
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  backoffFactor: 2,
  maxDelay: 30000,
  jitter: true,
}

/**
 * Returns true if an error is retryable (5xx, network, 429).
 * Override per-tool via the `retryable` predicate.
 */
export function defaultRetryable(err: any): boolean {
  if (!err) return false
  // Network errors (fetch throws TypeError on network failure)
  if (err instanceof TypeError && err.message.includes('fetch')) return true
  // HTTP status codes
  if (err.status) {
    return [429, 500, 502, 503, 504].includes(err.status)
  }
  // GCP/AWS timeout errors
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') return true
  return false
}

/**
 * Calculate delay with exponential backoff and optional jitter.
 *
 * Without jitter: 1s → 2s → 4s → 8s → 16s ...
 * With jitter (uniform 0..1): 1s → 3s → 5s → 11s → 20s ...
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelay * Math.pow(config.backoffFactor, attempt)
  const capped = Math.min(exponential, config.maxDelay)
  if (!config.jitter) return capped
  // Uniform random jitter in [0, capped]
  return Math.random() * capped
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  retryable: (err: any) => boolean = defaultRetryable
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err

      const isLastAttempt = attempt === config.maxRetries
      const shouldRetry = retryable(err) && !isLastAttempt

      if (!shouldRetry) {
        throw err
      }

      const delay = calculateDelay(attempt, config)
      // Emit a retry status event so the runner can log it
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
```

**Jitter rationale:** Without jitter, N clients that receive the same error will all retry at exactly the same time (thundering herd). With jitter, retry windows are decorrelated.

**Retryable vs. non-retryable:**

| Error | retryable? | Reason |
|-------|-----------|--------|
| 401 Unauthorized | NO | Credentials are invalid; retrying will never succeed |
| 403 Forbidden | NO | Permission denied; retrying will never succeed |
| 429 Rate Limited | YES | Upstream is overloaded; back off and retry |
| 500 Server Error | YES | Transient; may succeed on next attempt |
| 502/503/504 | YES | Transient gateway errors |
| Network timeout | YES | Network glitch; may recover |
| TypeError (fetch) | YES | Network unreachable; may recover |
| 400 Bad Request | NO | Malformed request; retrying is wasteful |

---

## 4. Timeout Enforcement

```typescript
// app/lib/runtime/middleware/timeout.ts

export class TimeoutError extends Error {
  readonly toolName: string
  readonly timeoutMs: number
  constructor(toolName: string, timeoutMs: number) {
    super(`${toolName} timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
    this.toolName = toolName
    this.timeoutMs = timeoutMs
  }
}

export interface TimeoutConfig {
  timeoutMs: number
  // Tool-specific overrides can be injected here
}

export const DEFAULT_TIMEOUT_MS = 30_000 // 30 seconds

/**
 * Wraps a Promise with an AbortController-based timeout.
 * If the timeout fires first, the underlying Promise is NOT cancelled
 * (cancellation requires the underlying call to respect AbortSignal),
 * but we raise TimeoutError to the caller.
 */
export async function withTimeout<T>(
  toolName: string,
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(toolName, timeoutMs))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timeoutHandle!)
  }
}
```

**Key design decisions:**

- `TimeoutError` is a named error type so `translateToolError` can classify it as retryable (timeouts are typically transient network issues).
- The `setTimeout` is cleared on both success and failure to prevent memory leaks.
- Underlying tool execution continues even after our timeout fires (we don't call `abort()` on an `AbortController` we don't hold). This is intentional — cancelling in-flight HTTP requests is the tool implementation's responsibility.
- Per-tool timeout overrides: `gmail.read` might need 30s, `llm` might need 60s. The `executeTool` config carries the per-tool timeout.

---

## 5. Error Translation

This is the most critical piece. Raw API errors MUST NOT reach the LLM.

```typescript
// app/lib/runtime/middleware/errors.ts

export interface TranslatedError {
  /** What the agent/LLM reads to understand and respond to the failure */
  llmMessage: string
  /** What the user sees in the UI */
  userMessage: string
  /** Whether withRetry should attempt a retry */
  retryable: boolean
  /** Machine-readable error code for logging */
  errorCode: ErrorCode
}

export type ErrorCode =
  | 'UNAUTHORIZED'       // 401
  | 'FORBIDDEN'          // 403
  | 'RATE_LIMITED'       // 429
  | 'SERVER_ERROR'       // 500-504
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'   // 400
  | 'UNKNOWN_ERROR'

export function translateToolError(error: any, toolName: string): TranslatedError {
  // Timeout
  if (error instanceof TimeoutError) {
    return {
      llmMessage: `${toolName} did not respond in time. The operation timed out after ${error.timeoutMs}ms. Consider retrying or simplifying the request.`,
      userMessage: `${toolName} is taking too long. Please try again.`,
      retryable: true,
      errorCode: 'TIMEOUT',
    }
  }

  // Network error (TypeError from failed fetch)
  if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
    return {
      llmMessage: `Could not reach the ${toolName} service. Check network connectivity and retry.`,
      userMessage: `Could not reach ${toolName}. Check your internet connection and try again.`,
      retryable: true,
      errorCode: 'NETWORK_ERROR',
    }
  }

  // HTTP status code check
  const status = error?.status ?? error?.response?.status

  if (status === 401) {
    return {
      llmMessage: `${toolName} authentication has expired or is invalid. The agent cannot proceed without valid credentials. Please reconnect the account.`,
      userMessage: `Your ${toolName} connection has expired. Please reconnect your account.`,
      retryable: false,
      errorCode: 'UNAUTHORIZED',
    }
  }

  if (status === 403) {
    return {
      llmMessage: `${toolName} access was denied. The agent does not have permission to perform this operation. Check account permissions.`,
      userMessage: `${toolName} access denied. Check that your account has the required permissions.`,
      retryable: false,
      errorCode: 'FORBIDDEN',
    }
  }

  if (status === 429) {
    // Try to extract retry-after hint
    const retryAfter = error?.response?.headers?.get('Retry-After')
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null
    return {
      llmMessage: `${toolName} is rate limited. Retrying in ${retryMs ? `${retryMs / 1000}s` : '30s'}...`,
      userMessage: `${toolName} is rate limited. Retrying...`,
      retryable: true,
      errorCode: 'RATE_LIMITED',
    }
  }

  if (status === 500) {
    return {
      llmMessage: `${toolName} encountered a server error. Retrying may resolve this.`,
      userMessage: `${toolName} is having issues. Retrying...`,
      retryable: true,
      errorCode: 'SERVER_ERROR',
    }
  }

  if (status >= 502 && status <= 504) {
    return {
      llmMessage: `${toolName} gateway error (${status}). This is typically transient. Retrying...`,
      userMessage: `${toolName} is temporarily unavailable. Retrying...`,
      retryable: true,
      errorCode: 'SERVER_ERROR',
    }
  }

  if (status === 400) {
    return {
      llmMessage: `${toolName} received a malformed request: ${error?.message ?? 'Bad Request'}. Check the request parameters.`,
      userMessage: `Invalid request to ${toolName}. Please try a different query.`,
      retryable: false,
      errorCode: 'VALIDATION_ERROR',
    }
  }

  // GCP/AWS/Node.js system errors
  if (error?.code === 'ETIMEDOUT') {
    return {
      llmMessage: `Connection to ${toolName} timed out. Check network connectivity.`,
      userMessage: `Connection to ${toolName} timed out. Check your internet connection.`,
      retryable: true,
      errorCode: 'TIMEOUT',
    }
  }

  if (error?.code === 'ECONNRESET') {
    return {
      llmMessage: `Connection to ${toolName} was reset. Retrying...`,
      userMessage: `Connection interrupted. Retrying...`,
      retryable: true,
      errorCode: 'NETWORK_ERROR',
    }
  }

  // Default: unknown error
  return {
    llmMessage: `${toolName} failed: ${error?.message ?? 'Unknown error'}.`,
    userMessage: `${toolName} failed. Please try again.`,
    retryable: false,
    errorCode: 'UNKNOWN_ERROR',
  }
}
```

**Example translated outcomes:**

| Raw Error | LLM Reads | User Reads | Retryable |
|-----------|-----------|------------|-----------|
| `{status: 401}` | "Gmail authentication has expired..." | "Your Gmail connection has expired..." | NO |
| `{status: 429}` | "Gmail is rate limited. Retrying in 30s..." | "Gmail is rate limited. Retrying..." | YES |
| `{status: 500}` | "Gmail encountered a server error. Retrying may resolve this." | "Gmail is having issues. Retrying..." | YES |
| `TypeError: fetch failed` | "Could not reach the Gmail service..." | "Could not reach Gmail. Check your internet connection..." | YES |
| `TimeoutError(30000)` | "Gmail did not respond in time..." | "Gmail is taking too long. Please try again." | YES |

---

## 6. Structured Logging

Every tool call emits a `ToolCallLog` entry. Logs are written to a structured logger (e.g., console with JSON output, or a logger abstraction).

```typescript
// app/lib/runtime/middleware/logger.ts

export type ToolCallResult = 'success' | 'error' | 'timeout'

export interface ToolCallLog {
  toolName: string
  /** Arguments with PII redacted (email addresses, phone numbers, etc.) */
  arguments: Record<string, unknown>
  /** 1-indexed attempt number */
  attempt: number
  startedAt: number
  /** Wall clock duration in ms */
  durationMs: number
  result: ToolCallResult
  errorType?: string
  /** Whether the error was classified as retryable */
  retryable: boolean
  /** Human-readable LLM message if error */
  llmMessage?: string
  /** Error code classification */
  errorCode?: string
}

/** Redacts PII from argument values for logging */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const piiKeys = ['email', 'to', 'from', 'phone', 'address', 'name', 'subject', 'body']
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(args)) {
    const lowerKey = key.toLowerCase()
    if (piiKeys.some(pii => lowerKey.includes(pii))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[TRUNCATED]'
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

export class ToolCallLogger {
  constructor(private readonly serviceName: string = 'agentos.tool') {}

  logStart(toolName: string, args: Record<string, unknown>, attempt: number): void {
    const entry: ToolCallLog = {
      toolName,
      arguments: sanitizeArgs(args),
      attempt,
      startedAt: Date.now(),
      durationMs: 0,
      result: 'success', // placeholder; updated on logEnd
      retryable: false,
    }
    console.log(JSON.stringify({ severity: 'DEBUG', service: this.serviceName, ...entry }))
  }

  logEnd(log: Omit<ToolCallLog, 'startedAt' | 'durationMs'>): void {
    const durationMs = Date.now() - log.startedAt
    const entry: ToolCallLog = { ...log, durationMs }
    console.log(JSON.stringify({ severity: log.result === 'error' ? 'ERROR' : 'INFO', service: this.serviceName, ...entry }))
  }
}
```

**Example log output:**

```json
{"severity":"DEBUG","service":"agentos.tool","toolName":"gmail.read","arguments":{"query":"is:unread newer_than:1d","userId":"[REDACTED]"},"attempt":1,"startedAt":1743270000000,"durationMs":0,"result":"success","retryable":false}
{"severity":"ERROR","service":"agentos.tool","toolName":"gmail.read","arguments":{"query":"is:unread newer_than:1d","userId":"[REDACTED]"},"attempt":1,"startedAt":1743270000000,"durationMs":1523,"result":"error","errorType":"TimeoutError","errorCode":"TIMEOUT","retryable":true,"llmMessage":"gmail.read did not respond in time..."}
{"severity":"INFO","service":"agentos.tool","toolName":"gmail.read","arguments":{"query":"is:unread newer_than:1d","userId":"[REDACTED]"},"attempt":2,"startedAt":1743271523000,"durationMs":892,"result":"success","retryable":false}
```

---

## 7. The Wrapper Function: `executeTool`

This is the main entry point that composes all four middleware components.

```typescript
// app/lib/runtime/middleware/executor.ts

import { TimeoutError } from './timeout'
import { translateToolError } from './errors'
import { withRetry, RetryConfig, DEFAULT_RETRY_CONFIG, defaultRetryable } from './retry'
import { ToolCallLogger } from './logger'
import type { ToolCallLog } from './logger'

export interface ToolCallConfig {
  /** Per-tool timeout in ms. Defaults to 30s. */
  timeoutMs?: number
  /** Override retry config. Defaults to DEFAULT_RETRY_CONFIG. */
  retryConfig?: Partial<RetryConfig>
  /** Logger instance. Defaults to new ToolCallLogger(). */
  logger?: ToolCallLogger
}

export interface ToolResult {
  /** The actual return value from the tool */
  data: unknown
  /** LLM-readable message (success or translated error) */
  llmMessage: string
  /** User-facing message */
  userMessage: string
  /** true only if the call ultimately failed after all retries */
  failed: boolean
  /** Error code if the call failed */
  errorCode?: string
}

/**
 * Default per-tool timeout overrides.
 * Tools that need different defaults can be configured here.
 */
const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
  'gmail.read': 30_000,   // 30s
  'gmail.send': 20_000,   // 20s
  'web.search': 15_000,   // 15s
  'llm': 60_000,          // 60s (LLM calls can be slow)
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * executeTool is the reliability middleware that wraps every tool call.
 *
 * Lifecycle:
 *  1. Log start (with sanitized args)
 *  2. Execute with timeout
 *  3. If error:
 *     a. Check if retryable
 *     b. If retryable and retries remain: backoff + retry (via withRetry)
 *     c. If not retryable or retries exhausted: translate error
 *  4. Log completion
 *  5. Return ToolResult
 */
export async function executeTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  toolFn: () => Promise<T>,
  config: ToolCallConfig = {}
): Promise<ToolResult> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TOOL_TIMEOUTS[toolName] ?? DEFAULT_TIMEOUT_MS
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig }
  const logger = config.logger ?? new ToolCallLogger()

  let attempt = 1
  let finalError: any = null
  let finalTranslated: ReturnType<typeof translateToolError> | null = null
  let result: T | undefined

  // Outer retry loop — manages retries with backoff
  while (attempt <= retryConfig.maxRetries + 1) {
    const attemptStart = Date.now()
    logger.logStart(toolName, args, attempt)

    try {
      // Execute with per-attempt timeout
      result = await withTimeout(
        toolName,
        toolFn(),
        timeoutMs
      )

      // Success
      const durationMs = Date.now() - attemptStart
      logger.logEnd({
        toolName,
        arguments: args,
        attempt,
        startedAt: attemptStart,
        durationMs,
        result: 'success',
        retryable: false,
      })

      return {
        data: result,
        llmMessage: `OK`,
        userMessage: `Success`,
        failed: false,
      }

    } catch (err: any) {
      finalError = err

      // Classify the error
      finalTranslated = translateToolError(err, toolName)

      // Determine if we should retry this attempt
      const shouldRetry =
        finalTranslated.retryable &&
        attempt <= retryConfig.maxRetries

      const durationMs = Date.now() - attemptStart
      logger.logEnd({
        toolName,
        arguments: args,
        attempt,
        startedAt: attemptStart,
        durationMs,
        result: err instanceof TimeoutError ? 'timeout' : 'error',
        errorType: err?.constructor?.name ?? 'Error',
        errorCode: finalTranslated.errorCode,
        retryable: finalTranslated.retryable,
        llmMessage: finalTranslated.llmMessage,
      })

      if (!shouldRetry) {
        break
      }

      // Compute backoff delay before next attempt
      const delay = calculateBackoffDelay(attempt, retryConfig)
      await new Promise(resolve => setTimeout(resolve, delay))
      attempt++
    }
  }

  // All retries exhausted (or non-retryable error reached here)
  return {
    data: null,
    llmMessage: finalTranslated?.llmMessage ?? `Tool ${toolName} failed: ${finalError?.message ?? 'Unknown error'}`,
    userMessage: finalTranslated?.userMessage ?? `${toolName} failed. Please try again.`,
    failed: true,
    errorCode: finalTranslated?.errorCode,
  }
}

function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1)
  const capped = Math.min(exponential, config.maxDelay)
  if (!config.jitter) return capped
  return Math.random() * capped
}
```

**Return value contract:** `executeTool` always resolves (never throws). Callers receive a `ToolResult` where `failed: false` means success, `failed: true` means the error was translated and logged. The LLM always receives a meaningful `llmMessage`.

---

## 8. Contrast with Current `runner.ts`

| Aspect | Current `runner.ts` | With Reliability Middleware |
|--------|--------------------|----------------------------|
| Tool execution | Direct `await gmailReadTool(...)` | `executeTool('gmail.read', args, () => gmailReadTool(...))` |
| Retries | None | Up to 3 with exponential backoff |
| Jitter | N/A | Uniform random in [0, delay] |
| Timeout | None (infinite hang possible) | Per-tool, default 30s |
| Error handling | `catch (err) { error: err.message }` raw string | Translated `ToolResult` with `llmMessage`, `userMessage`, `errorCode` |
| 401 response | `Error: 401 Unauthorized` goes to LLM | "Gmail access expired. Please reconnect..." |
| 429 response | `Error: 429 Too Many Requests` goes to LLM | Backoff + retry automatically |
| Network failure | `TypeError: fetch failed` goes to LLM | "Could not reach Gmail. Check your connection..." with retry |
| Logging | Only runner-level `durationMs` in onDone | Per-tool, per-attempt structured `ToolCallLog` with sanitized args |
| Caller change required | None | Replace `await toolFn()` with `await executeTool('tool.name', args, toolFn)` |
| Stack for 5 retries | N/A | 5 separate Promise.race + setTimeout cycles |
| Failure after retries | Error propogates, run fails | `ToolResult { failed: true, llmMessage }` returned; runner can continue |

**Current runner error path (lines 156-174):**

```typescript
} catch (err: any) {
  errored++
  const output: AgentOutput = {
    agentId,
    role: agent.role,
    status: 'error',
    data: null,
    error: err.message   // ← raw, untranslated, API-centric error string
  }
```

**New error path using `executeTool`:**

```typescript
const result = await executeTool('gmail.read', args, () => gmailReadTool(args.query, args.userId))

if (result.failed) {
  // result.llmMessage is already LLM-readable
  // result.userMessage is already user-readable
  // result.errorCode is 'UNAUTHORIZED' | 'RATE_LIMITED' | etc.
  const output: AgentOutput = {
    agentId,
    role: agent.role,
    status: 'error',
    data: null,
    error: result.llmMessage  // ← LLM can understand and potentially recover
  }
}
```

---

## 9. File Structure

```
app/lib/runtime/
├── runner.ts                      # Unchanged — orchestrates agent graph execution
├── middleware/
│   ├── executor.ts                 # executeTool() — main entry point
│   ├── retry.ts                   # withRetry(), RetryConfig, defaultRetryable
│   ├── timeout.ts                 # withTimeout(), TimeoutError
│   ├── errors.ts                  # translateToolError(), TranslatedError, ErrorCode
│   └── logger.ts                  # ToolCallLogger, ToolCallLog, sanitizeArgs()
└── tools/
    └── (existing tools unchanged)  # gmail.ts, web.ts, llm.ts stay as-is
```

---

## 10. Implementation Notes

1. **Tools stay unchanged.** The middleware wraps tool calls externally. Tools themselves do not need to change. This means `gmailReadTool`, `gmailSendTool`, `webSearchTool`, `llmTool` remain pure functions that throw on error.

2. **Runner change is minimal.** In `executeAgent`, replace direct tool calls with `executeTool`. The runner continues to manage the agent graph, concurrency, and fan-in/fan-out — it just gets back structured results instead of raw throws.

3. **`retryable` is per-error-type, not per-tool.** The `defaultRetryable` function classifies errors by HTTP status and error code. Tool-specific retry logic (e.g., "gmail.read on 403 is always non-retryable") is consistent across all tools.

4. **PII redaction in logs.** `sanitizeArgs` scrubs argument values where the key name suggests PII (`email`, `to`, `from`, `subject`, `body`). Subject and body are redacted because email subjects can contain sensitive info. This is a best-effort heuristic; true PII redaction needs a proper data classification library.

5. **Timeout vs. retry interaction.** A timeout fires within a single attempt. If the error is retryable, the retry loop catches the `TimeoutError`, translates it, and retries the full `withTimeout(toolFn())` call. Each attempt gets a fresh timeout.

6. **AbortSignal support.** The current runner has a `signal?: AbortSignal` field for cancellation. `executeTool` should accept an optional `AbortSignal` and check it before starting each retry attempt. If `signal.aborted`, return immediately with `{ failed: true, llmMessage: 'Run was cancelled', errorCode: 'CANCELLED' }`.
