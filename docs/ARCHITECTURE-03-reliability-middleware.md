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
| Concurrent agents hit 429 | Each agent independently retries, flooding the target further |

**The core issue:** Raw API errors are unfiltered. They go straight into the agent's error handler (runner.ts line 156-174), which stuffs the raw message into `output.error` and continues. The LLM then sees unstructured, API-centric error messages that it cannot interpret or recover from.

---

## 2. The Solution

Wrap every tool call in a **reliability middleware layer** (`ToolExecutor`) that sits between the runner and the raw tool implementations.

```
Runner                     ToolExecutor                   Raw Tool
──────                     ─────────────                   ────────
executeAgent() ──────────► executeTool() ──────────────► gmailReadTool()
                              │
                              ├── withAbortSignal()        (AbortController/AbortSignal)
                              │
                              ├── withTimeout()            (AbortController)
                              │
                              ├── withRetryBudget()        (shared RetryBudget token bucket)
                              │
                              ├── withRetry()              (exponential backoff + jitter)
                              │
                              └── translateToolError()    (401/403/429/500/network → structured)
                              │
                         ToolResult
                         { llmMessage, userMessage, retryable, data, partialData, retriesAttempted }
```

**Five components:**

1. **`withAbortSignal`** — checks `AbortSignal` before each attempt; cancels in-flight HTTP requests on abort
2. **`withRetry`** — retry loop with exponential backoff + jitter
3. **`withTimeout`** — per-call deadline via `AbortController`
4. **`translateToolError`** — error classification and human-readable translation
5. **`executeTool`** — the orchestrator that composes the above four

---

## 3. Retry Coordination — `RetryBudget`

When multiple concurrent agents run and one hits a 429, they should share retry budget via a token bucket so they decorrelate their retry windows instead of independently flooding the target.

```typescript
// app/lib/runtime/middleware/retryBudget.ts

/**
 * Shared retry budget for coordinating rate-limited requests across concurrent agents.
 * Uses a token-bucket algorithm. Tokens refill at fillRate per second.
 * When bucket is empty, all requesters receive null (signalling: wait before retrying).
 */
export interface RetryBudget {
  /** Unique identifier for this budget domain (e.g., 'gmail', 'salesforce') */
  domain: string
  /** Maximum tokens in the bucket (max concurrent retries allowed) */
  maxTokens: number
  /** Current available tokens */
  availableTokens: number
  /** How many ms to wait when bucket is empty before checking again */
  waitMs: number
  /** Attempt to acquire a token. Returns true if acquired, false if bucket is empty. */
  tryAcquire(): boolean
  /** Release a token back to the bucket (call when retry succeeds or gives up) */
  release(): void
  /** Returns estimated ms until next token is available (0 if now) */
  waitTime(): number
}

export function createRetryBudget(domain: string, maxTokens: number = 1, waitMs: number = 1000): RetryBudget {
  let availableTokens = maxTokens
  let nextRefillAt = Date.now()

  return {
    domain,
    maxTokens,
    availableTokens,
    waitMs,

    tryAcquire(): boolean {
      if (availableTokens > 0) {
        availableTokens--
        return true
      }
      return false
    },

    release(): void {
      if (availableTokens < maxTokens) {
        availableTokens++
      }
    },

    waitTime(): number {
      if (availableTokens > 0) return 0
      const elapsed = Date.now() - nextRefillAt
      if (elapsed >= waitMs) {
        // Refill now
        availableTokens = Math.min(maxTokens, availableTokens + 1)
        nextRefillAt = Date.now()
        return 0
      }
      return waitMs - elapsed
    },
  }
}

/** Global registry of RetryBudget instances, keyed by domain. */
const budgetRegistry = new Map<string, RetryBudget>()

export function getRetryBudget(domain: string, maxTokens: number = 1): RetryBudget {
  if (!budgetRegistry.has(domain)) {
    budgetRegistry.set(domain, createRetryBudget(domain, maxTokens))
  }
  return budgetRegistry.get(domain)!
}
```

---

## 4. Retry with Exponential Backoff + Jitter

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
  // HTTP status codes — use coerceStatus to handle string/number mismatch
  const status = coerceStatus(err.status ?? err.response?.status)
  if (status) {
    return [429, 500, 502, 503, 504].includes(status)
  }
  // GCP/AWS/Node.js timeout errors
  const code = err.code
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNABORTED') return true
  return false
}

/**
 * Coerce status to a number. Handles "401" string vs 401 number,
 * undefined, null, and non-numeric values.
 */
function coerceStatus(status: unknown): number | null {
  if (status == null) return null
  const n = Number(status)
  return Number.isInteger(n) && n > 0 ? n : null
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
  retryable: (err: any) => boolean = defaultRetryable,
  budget?: RetryBudget | null
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // If a shared budget exists and is exhausted, wait first
      if (budget) {
        const waitTime = budget.waitTime()
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
        if (!budget.tryAcquire()) {
          // Budget still empty; wait and retry checking
          await new Promise(resolve => setTimeout(resolve, budget.waitMs))
          if (!budget.tryAcquire()) {
            // Give up on this attempt — treat as non-retryable rate limit
            throw Object.assign(new Error('RATE_LIMITED_BUDGET_EXHAUSTED'), { code: 'RATE_LIMITED_BUDGET_EXHAUSTED' })
          }
        }
      }

      return await fn()
    } catch (err: any) {
      lastError = err
      if (budget) budget.release()

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
| ECONNABORTED | YES | Request aborted (often a timeout variant) |

---

## 5. Timeout Enforcement

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
 * The AbortController signal is returned so callers (e.g., fetch/axios)
 * can pass it to in-flight HTTP requests for genuine cancellation.
 */
export async function withTimeout<T>(
  toolName: string,
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  abortSignal?: AbortSignal | null
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>
  const controller = new AbortController()

  // If caller passed a signal, wire it to our controller so
  // callers can call controller.abort() on the outer abortSignal.
  // We do NOT call controller.abort() ourselves on the outer signal —
  // that is the responsibility of the withAbortSignal wrapper.
  const signal = abortSignal
    ? mergeAbortSignal(abortSignal, controller.signal)
    : controller.signal

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(toolName, timeoutMs))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timeoutHandle!)
    // Ensure any in-flight HTTP request is cancelled
    controller.abort()
  }
}

/**
 * Returns an AbortSignal that fires when either input signal aborts.
 */
function mergeAbortSignal(a: AbortSignal, b: AbortController['signal']): AbortSignal {
  // If either is already aborted, the merged signal is immediately aborted
  if (a.aborted || b.aborted) {
    return AbortSignal.abort()
  }
  const controller = new AbortController()
  a.addEventListener('abort', () => controller.abort(), { once: true })
  b.addEventListener('abort', () => controller.abort(), { once: true })
  return controller.signal
}
```

**Key design decisions:**

- `TimeoutError` is a named error type so `translateToolError` can classify it as retryable (timeouts are typically transient network issues).
- The `setTimeout` is cleared on both success and failure to prevent memory leaks.
- `withTimeout` returns an `AbortController` whose signal can be passed to `fetch()` or `axios` for genuine in-flight request cancellation.
- Per-tool timeout overrides: `gmail.read` might need 30s, `llm` needs 120s minimum. The `executeTool` config carries the per-tool timeout.

---

## 6. AbortSignal Cancellation

Every `executeTool` call accepts an optional `AbortSignal`. The signal is checked **before each retry attempt** and **before starting each new attempt**. When the signal fires, in-flight HTTP requests (fetch/axios) are cancelled via the `AbortController` passed into `withTimeout`.

```typescript
// app/lib/runtime/middleware/abort.ts

export class AbortError extends Error {
  constructor(message: string = 'Operation was cancelled') {
    super(message)
    this.name = 'AbortError'
  }
}

/**
 * Check if the given AbortSignal is aborted. If so, throw AbortError immediately.
 * Call this before each retry attempt.
 */
export function checkAbortSignal(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw new AbortError()
  }
}
```

**Orphaned in-flight HTTP requests:** When `AbortSignal` fires (e.g., user cancelled the run), `withTimeout`'s `AbortController.abort()` is called, which triggers `fetch()` or `axios` to cancel the in-flight request. This must be documented as a requirement: all HTTP calls made by tools MUST accept and respect an `AbortSignal`.

---

## 7. Error Translation

This is the most critical piece. Raw API errors MUST NOT reach the LLM. Never embed `error.message` directly in `llmMessage` — it may contain stack traces, file paths, internal IPs, or other sensitive details.

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
  | 'ABORTED'            // Run was cancelled
  | 'UNKNOWN_ERROR'

/**
 * Coerce status to a number. Handles "401" string vs 401 number,
 * undefined, null, and non-numeric values.
 */
function coerceStatus(status: unknown): number | null {
  if (status == null) return null
  const n = Number(status)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Extract HTTP status from an error, checking all common axios/fetch locations.
 * Axios errors place status on err.response.status (not err.status).
 * Also handles ECONNABORTED as a timeout.
 */
function extractStatus(err: any): number | string | null {
  // Axios wraps the response: err.response?.status
  if (err.response?.status != null) return err.response.status
  // fetch/native errors: err.status
  if (err.status != null) return err.status
  // ECONNABORTED — treat as timeout
  if (err.code === 'ECONNABORTED') return 'TIMEOUT'
  return null
}

export function translateToolError(error: any, toolName: string): TranslatedError {
  // AbortError — never retry
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      llmMessage: `The ${toolName} operation was cancelled.`,
      userMessage: `Cancelled.`,
      retryable: false,
      errorCode: 'ABORTED',
    }
  }

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

  // ECONNABORTED — axios timeout variant
  if (error?.code === 'ECONNABORTED') {
    return {
      llmMessage: `The ${toolName} request timed out. Consider retrying.`,
      userMessage: `${toolName} request timed out. Please try again.`,
      retryable: true,
      errorCode: 'TIMEOUT',
    }
  }

  // HTTP status code check — use coerceStatus for string/number safety
  const rawStatus = extractStatus(error)
  const status = coerceStatus(rawStatus)

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
    const retryAfter = error?.response?.headers?.get?.('Retry-After')
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
    // NOTE: We use errorCode only in llmMessage — never error.message directly
    return {
      llmMessage: `${toolName} received a malformed request. Check the request parameters.`,
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

  // Default: unknown error — use errorCode only, never raw error.message
  return {
    llmMessage: `${toolName} failed with error code ${error?.code ?? 'UNKNOWN_ERROR'}.`,
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
| `ECONNABORTED` | "The Gmail request timed out..." | "Gmail request timed out..." | YES |

**Critical: Never use `error.message` in `llmMessage`.** Raw error messages may contain stack traces (`at gmailReadTool (/app/lib/runtime/tools/gmail.ts:42:15)`), internal IP addresses, file paths, or database connection strings. Always use `errorCode` instead.

---

## 8. PII Redaction

The `sanitizeArgs` function must recursively traverse nested objects and arrays, redact by value content (not just key name), and be applied to error messages and log outputs — not just top-level args.

```typescript
// app/lib/runtime/middleware/pii.ts

/**
 * PII patterns for value-based redaction.
 * Values matching these patterns (regardless of key name) are redacted.
 */
const PII_VALUE_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,          // email
  /\+?[\d\s\-\(\)]{10,}/,                                      // phone number
  /\d{3}[-\s]?\d{2}[-\s]?\d{4}/,                              // SSN-like
  /[A-Z]{1,2}\d{2}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/,        // credit card
  /(?i)(secret|password|token|api[_-]?key|auth)[=:][^\s,}]+/, // secrets in strings
]

/**
 * Keys that suggest PII even if the value does not match a pattern.
 */
const PII_KEY_NAMES = new Set([
  'email', 'to', 'from', 'cc', 'bcc', 'phone', 'address', 'name',
  'subject', 'body', 'content', 'message', 'password', 'secret',
  'token', 'api_key', 'apikey', 'auth', 'ssn', 'credit_card',
])

const REDACTED = '[REDACTED]'
const TRUNCATE_LENGTH = 200

/**
 * Returns true if the given string likely contains PII.
 */
function looksLikePII(value: string): boolean {
  if (value.length < 3) return false
  for (const pattern of PII_VALUE_PATTERNS) {
    if (pattern.test(value)) return true
  }
  return false
}

/**
 * Returns true if the given key name suggests PII.
 */
function isPIIKey(key: string): boolean {
  const lower = key.toLowerCase()
  return PII_KEY_NAMES.has(lower) || lower.includes('email') || lower.includes('phone')
}

/**
 * Recursively sanitize a value, handling objects, arrays, and primitives.
 * - Strings matching PII patterns are redacted
 * - Strings longer than TRUNCATE_LENGTH are truncated
 * - Object keys matching PII key names have their values redacted
 * - Arrays are traversed recursively
 */
export function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    if (looksLikePII(value)) return REDACTED
    if (value.length > TRUNCATE_LENGTH) return value.slice(0, TRUNCATE_LENGTH) + '...[TRUNCATED]'
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item))
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isPIIKey(key)) {
        result[key] = REDACTED
      } else {
        result[key] = sanitizeValue(val)
      }
    }
    return result
  }

  return value
}

/**
 * Redact PII from any value (not just Record<string, unknown>).
 * Handles error objects, nested structures, arrays, etc.
 */
export function redactPII(value: unknown): unknown {
  return sanitizeValue(value)
}

/**
 * Redact PII from an error for safe inclusion in logs/llmMessage.
 * Only the errorCode is used — this is for structured logging safety.
 */
export function sanitizeErrorForLog(error: any): Record<string, unknown> {
  if (!error) return {}
  return {
    code: error?.code ?? null,
    status: error?.status ?? error?.response?.status ?? null,
    // Never include error.message in logs — it may contain internal paths/IPs
    name: error?.name ?? error?.constructor?.name ?? null,
  }
}
```

---

## 9. Structured Logging

Every tool call emits a `ToolCallLog` entry. Logs are written to a structured logger (e.g., console with JSON output, or a logger abstraction).

```typescript
// app/lib/runtime/middleware/logger.ts

export type ToolCallResult = 'success' | 'error' | 'timeout' | 'cancelled'

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
  /** Number of retries attempted for this tool call (0 if succeeded on first try) */
  retriesAttempted: number
}

export class ToolCallLogger {
  constructor(private readonly serviceName: string = 'agentos.tool') {}

  /**
   * Log the start of a tool call attempt.
   * Does NOT emit a result: the result is emitted by logEnd only.
   * This avoids false "success" log entries when a retry ultimately fails.
   */
  logStart(toolName: string, args: Record<string, unknown>, attempt: number, retriesAttempted: number): void {
    const entry: ToolCallLog = {
      toolName,
      arguments: sanitizeArgs(args),
      attempt,
      startedAt: Date.now(),
      durationMs: 0,
      result: 'success', // placeholder; updated on logEnd
      retryable: false,
      retriesAttempted,
    }
    console.log(JSON.stringify({ severity: 'DEBUG', service: this.serviceName, ...entry }))
  }

  logEnd(log: Omit<ToolCallLog, 'startedAt' | 'durationMs'>): void {
    const durationMs = Date.now() - log.startedAt
    const entry: ToolCallLog = { ...log, durationMs }
    const severity = log.result === 'error' ? 'ERROR' : log.result === 'timeout' ? 'WARN' : log.result === 'cancelled' ? 'WARN' : 'INFO'
    console.log(JSON.stringify({ severity, service: this.serviceName, ...entry }))
  }
}

/**
 * Backwards-compatible alias — used by logStart's internal entry construction.
 */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(args) as Record<string, unknown>
}
```

**Example log output:**

```json
{"severity":"DEBUG","service":"agentos.tool","toolName":"gmail.read","arguments":{"query":"is:unread newer_than:1d","userId":"[REDACTED]"},"attempt":1,"startedAt":1743270000000,"durationMs":0,"result":"success","retryable":false,"retriesAttempted":0}
{"severity":"WARN","service":"agentos.tool","toolName":"gmail.read","arguments":{"query":"is:unread newer_than:1d","userId":"[REDACTED]"},"attempt":1,"startedAt":1743270000000,"durationMs":1523,"result":"timeout","errorType":"TimeoutError","errorCode":"TIMEOUT","retryable":true,"llmMessage":"gmail.read did not respond in time...","retriesAttempted":0}
{"severity":"INFO","service":"agentos.tool","toolName":"gmail.read","arguments":{"query":"is:unread newer_than:1d","userId":"[REDACTED]"},"attempt":2,"startedAt":1743271523000,"durationMs":892,"result":"success","retryable":false,"retriesAttempted":1}
```

**Minor fix: No duplicate log entries.** Previously `logStart` emitted a "success" placeholder that caused false success logs when a retry ultimately failed. Now `logStart` does not emit a separate entry — only `logEnd` emits the final result entry per attempt. Attempt-level entries are emitted via `logEnd` with the correct result status.

---

## 10. The Wrapper Function: `executeTool`

This is the main entry point that composes all middleware components.

```typescript
// app/lib/runtime/middleware/executor.ts

import { TimeoutError } from './timeout'
import { translateToolError } from './errors'
import { withRetry, RetryConfig, DEFAULT_RETRY_CONFIG, defaultRetryable } from './retry'
import { ToolCallLogger, ToolCallLog } from './logger'
import { checkAbortSignal, AbortError } from './abort'
import { getRetryBudget, RetryBudget } from './retryBudget'
import { redactPII, sanitizeErrorForLog } from './pii'

export interface ToolCallConfig {
  /** Per-tool timeout in ms. Defaults vary by tool (see DEFAULT_TOOL_TIMEOUTS). */
  timeoutMs?: number
  /** Override retry config. Defaults to DEFAULT_RETRY_CONFIG. */
  retryConfig?: Partial<RetryConfig>
  /** Logger instance. Defaults to new ToolCallLogger(). */
  logger?: ToolCallLogger
  /**
   * AbortSignal for cancellation. Checked before each retry attempt.
   * When fired, in-flight HTTP requests are cancelled via AbortController.
   */
  abortSignal?: AbortSignal | null
  /**
   * Domain name for shared RetryBudget across concurrent agents.
   * e.g., 'gmail', 'salesforce', 'jira'. If omitted, no shared budget is used.
   */
  retryBudgetDomain?: string
  /**
   * Max tokens for the shared RetryBudget (only used when budget is first created).
   * Default 1 (one agent retries at a time per domain).
   */
  retryBudgetMaxTokens?: number
}

export interface ToolResult {
  /** The actual return value from the tool. null if all retries exhausted or non-retryable error. */
  data: unknown
  /**
   * True if the call returned data even though retries were attempted.
   * Distinguishes "legitimate empty result" from "retry-exhausted null".
   * Only non-null when the tool returned data on a later retry attempt.
   */
  partialData: boolean
  /**
   * The 1-indexed attempt number that ultimately succeeded.
   * null if failed or succeeded on first attempt (0).
   */
  attemptSucceededOn: number | null
  /** LLM-readable message (success or translated error) */
  llmMessage: string
  /** User-facing message */
  userMessage: string
  /** true only if the call ultimately failed after all retries */
  failed: boolean
  /** Error code if the call failed */
  errorCode?: string
  /**
   * Number of retries attempted (0 if succeeded on first attempt or failed without retrying).
   * Useful for distinguishing "fast fail" from "slow fail".
   */
  retriesAttempted: number
}

/**
 * Default per-tool timeout overrides.
 * LLM tool requires 120s minimum — model inference can be slow.
 */
const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
  'gmail.read': 30_000,   // 30s
  'gmail.send': 20_000,  // 20s
  'web.search': 15_000,   // 15s
  'llm': 120_000,         // 120s (2 minutes — minimum for LLM inference)
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * executeTool is the reliability middleware that wraps every tool call.
 *
 * Lifecycle:
 *  1. Check abortSignal (throw AbortError if already aborted)
 *  2. Log start (with sanitized args)
 *  3. Execute with timeout + abort signal
 *  4. If error:
 *     a. Check if retryable
 *     b. If retryable and retries remain and not aborted: backoff + retry (via withRetry)
 *     c. If not retryable or retries exhausted: translate error
 *  5. Log completion
 *  6. Return ToolResult
 *
 * All HTTP calls made by tools MUST accept and pass through an AbortSignal
 * so that cancelled runs can terminate in-flight requests promptly.
 */
export async function executeTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  toolFn: (signal?: AbortSignal) => Promise<T>,  // tools must accept AbortSignal
  config: ToolCallConfig = {}
): Promise<ToolResult> {
  // CRITICAL: Check cancellation BEFORE any work is done
  checkAbortSignal(config.abortSignal)

  const timeoutMs = config.timeoutMs ?? DEFAULT_TOOL_TIMEOUTS[toolName] ?? DEFAULT_TIMEOUT_MS
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig }
  const logger = config.logger ?? new ToolCallLogger()
  const budget = config.retryBudgetDomain ? getRetryBudget(config.retryBudgetDomain, config.retryBudgetMaxTokens ?? 1) : undefined

  let attempt = 1
  let finalError: any = null
  let finalTranslated: ReturnType<typeof translateToolError> | null = null
  let result: T | undefined
  let attemptSucceededOn: number | null = null
  let retriesAttempted = 0

  // Build per-attempt abort controller that is also driven by the outer signal
  // This is created fresh for each attempt so multiple attempts each get their own controller
  const outerSignal = config.abortSignal
  let currentController: AbortController | undefined

  // Outer retry loop — manages retries with backoff
  while (attempt <= retryConfig.maxRetries + 1) {
    // CRITICAL: Check cancellation BEFORE each retry attempt
    checkAbortSignal(outerSignal)

    const attemptStart = Date.now()
    // NOTE: logStart no longer emits a standalone "success" entry — only logEnd does
    logger.logStart(toolName, args, attempt, retriesAttempted)

    try {
      // Create a fresh AbortController per attempt
      currentController = new AbortController()

      // Wire outer abortSignal to this attempt's controller
      if (outerSignal) {
        if (outerSignal.aborted) throw new AbortError()
        outerSignal.addEventListener('abort', () => currentController!.abort(), { once: true })
      }

      // Execute with per-attempt timeout and abort signal
      // Pass the controller's signal to the tool so it can cancel in-flight HTTP requests
      result = await withTimeout(
        toolName,
        toolFn(currentController.signal),
        timeoutMs,
        currentController.signal
      )

      // Success
      attemptSucceededOn = attempt
      retriesAttempted = attempt - 1

      const durationMs = Date.now() - attemptStart
      logger.logEnd({
        toolName,
        arguments: args,
        attempt,
        startedAt: attemptStart,
        durationMs,
        result: 'success',
        retryable: false,
        retriesAttempted,
      })

      return {
        data: result,
        partialData: retriesAttempted > 0,
        attemptSucceededOn: attempt,
        llmMessage: `OK`,
        userMessage: `Success`,
        failed: false,
        retriesAttempted,
      }

    } catch (err: any) {
      finalError = err

      // Handle abort separately — do not retry
      if (err instanceof AbortError || (outerSignal?.aborted && err instanceof Error && err.name === 'AbortError')) {
        const durationMs = Date.now() - attemptStart
        const translated = translateToolError(err, toolName)
        logger.logEnd({
          toolName,
          arguments: args,
          attempt,
          startedAt: attemptStart,
          durationMs,
          result: 'cancelled',
          errorType: 'AbortError',
          errorCode: 'ABORTED',
          retryable: false,
          llmMessage: translated.llmMessage,
          retriesAttempted,
        })
        return {
          data: null,
          partialData: false,
          attemptSucceededOn: null,
          llmMessage: translated.llmMessage,
          userMessage: translated.userMessage,
          failed: true,
          errorCode: 'ABORTED',
          retriesAttempted,
        }
      }

      // Classify the error
      finalTranslated = translateToolError(err, toolName)

      // Determine if we should retry this attempt
      const shouldRetry =
        finalTranslated.retryable &&
        attempt <= retryConfig.maxRetries &&
        !(err instanceof TimeoutError && !finalTranslated.retryable)

      retriesAttempted = attempt - 1

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
        retriesAttempted,
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
    partialData: false,
    attemptSucceededOn: null,
    // CRITICAL: Never embed raw error.message — use errorCode only
    llmMessage: finalTranslated?.llmMessage ?? `${toolName} failed with error code ${finalError?.code ?? finalTranslated?.errorCode ?? 'UNKNOWN_ERROR'}.`,
    userMessage: finalTranslated?.userMessage ?? `${toolName} failed. Please try again.`,
    failed: true,
    errorCode: finalTranslated?.errorCode ?? 'UNKNOWN_ERROR',
    retriesAttempted,
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

**Tool signature change:** Tool functions must accept an optional `AbortSignal` parameter `(signal?: AbortSignal) => Promise<T>` so that in-flight HTTP requests can be cancelled when the run is aborted.

---

## 11. Contrast with Current `runner.ts`

| Aspect | Current `runner.ts` | With Reliability Middleware |
|--------|--------------------|----------------------------|
| Tool execution | Direct `await gmailReadTool(...)` | `executeTool('gmail.read', args, (sig) => gmailReadTool(..., sig))` |
| Retries | None | Up to 3 with exponential backoff |
| Jitter | N/A | Uniform random in [0, delay] |
| Timeout | None (infinite hang possible) | Per-tool, default 30s, LLM 120s minimum |
| Error handling | `catch (err) { error: err.message }` raw string | Translated `ToolResult` with `llmMessage`, `userMessage`, `errorCode` |
| 401 response | `Error: 401 Unauthorized` goes to LLM | "Gmail access expired. Please reconnect..." |
| 429 response | `Error: 429 Too Many Requests` goes to LLM | Backoff + retry automatically |
| Network failure | `TypeError: fetch failed` goes to LLM | "Could not reach Gmail. Check your connection..." with retry |
| Concurrent 429 | Each agent independently floods target | Shared `RetryBudget` token bucket across agents |
| Cancellation | No abort support | `AbortSignal` checked before each attempt; in-flight HTTP cancelled |
| Logging | Only runner-level `durationMs` in onDone | Per-tool, per-attempt structured `ToolCallLog` with sanitized args |
| PII redaction | None | Recursive redaction by key name AND value content |
| Caller change required | None | Replace `await toolFn()` with `await executeTool('tool.name', args, toolFn)` |
| Stack for 5 retries | N/A | 5 separate Promise.race + setTimeout cycles |
| Failure after retries | Error propogates, run fails | `ToolResult { failed: true, llmMessage }` returned; runner can continue |
| LLM tool timeout | Default | 120s minimum, configurable via `ToolCallConfig.timeoutMs` |

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
const result = await executeTool('gmail.read', args, (sig) => gmailReadTool(args.query, args.userId, sig))

if (result.failed) {
  // result.llmMessage is already LLM-readable (no raw error.message)
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

## 12. File Structure

```
app/lib/runtime/
├── runner.ts                      # Unchanged — orchestrates agent graph execution
├── middleware/
│   ├── executor.ts                 # executeTool() — main entry point
│   ├── retry.ts                   # withRetry(), RetryConfig, defaultRetryable
│   ├── retryBudget.ts             # RetryBudget interface, createRetryBudget, getRetryBudget
│   ├── timeout.ts                 # withTimeout(), TimeoutError
│   ├── abort.ts                   # checkAbortSignal(), AbortError
│   ├── errors.ts                  # translateToolError(), TranslatedError, ErrorCode
│   ├── pii.ts                     # sanitizeValue(), redactPII(), sanitizeErrorForLog()
│   └── logger.ts                  # ToolCallLogger, ToolCallLog, sanitizeArgs()
└── tools/
    └── (existing tools unchanged, but updated to accept AbortSignal)  # gmail.ts, web.ts, llm.ts
```

---

## 13. Implementation Notes

1. **Tools accept `AbortSignal`.** The middleware wrapper function signature changes from `() => Promise<T>` to `(signal?: AbortSignal) => Promise<T>`. Tools must pass the signal to their HTTP calls (fetch/axios). This is the mechanism by which cancelled runs terminate in-flight requests promptly.

2. **Tools stay mostly unchanged.** The middleware wraps tool calls externally. Tools themselves do not need to change their logic — only their signature and HTTP call sites.

3. **Runner change is minimal.** In `executeAgent`, replace direct tool calls with `executeTool`. The runner continues to manage the agent graph, concurrency, and fan-in/fan-out — it just gets back structured results instead of raw throws.

4. **`retryable` is per-error-type, not per-tool.** The `defaultRetryable` function classifies errors by HTTP status and error code. Tool-specific retry logic (e.g., "gmail.read on 403 is always non-retryable") is consistent across all tools.

5. **PII redaction is recursive and value-based.** `sanitizeValue` traverses nested objects and arrays, redacts strings matching email/phone/secret patterns regardless of key name, and truncates long strings. This is applied to all args before logging. Backwards-compatible: top-level keys that match `PII_KEY_NAMES` are also redacted even if their values don't match patterns.

6. **Timeout vs. retry interaction.** A timeout fires within a single attempt. If the error is retryable, the retry loop catches the `TimeoutError`, translates it, and retries the full `withTimeout(toolFn())` call. Each attempt gets a fresh timeout.

7. **AbortSignal is checked before each retry attempt** via `checkAbortSignal(config.abortSignal)`. If already aborted, returns immediately with `failed: true, errorCode: 'ABORTED'`. The `AbortController` created per attempt is also wired to the outer signal so that if the outer signal fires at any time during an attempt, the in-flight HTTP request is cancelled.

8. **Concurrent agent retry coordination.** When `retryBudgetDomain` is set in `ToolCallConfig`, all agents sharing the same domain share a `RetryBudget` (token bucket). When one agent hits 429 and another is about to retry, the budget ensures they don't simultaneously flood the target. The budget is created lazily and cached globally by domain.

9. **`partialData` and `attemptSucceededOn`** distinguish "legitimate empty result" (e.g., a search that returned 0 results) from "retry-exhausted null". If `attemptSucceededOn > 1`, the tool ultimately succeeded after retries, and `partialData: true` signals that earlier attempts failed.

10. **Never embed `error.message` in `llmMessage`.** Raw messages may contain stack traces, internal file paths, IP addresses, or connection strings. Always use `errorCode` in `llmMessage`. The `sanitizeErrorForLog` function explicitly strips `error.message` from structured log output.
