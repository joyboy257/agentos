/**
 * Retry with exponential backoff + jitter.
 * Coordinates with RetryBudget for shared rate-limiting across concurrent agents.
 */

export interface RetryConfig {
  maxRetries: number      // default 3
  baseDelay: number      // ms, default 1000
  backoffFactor: number  // default 2 (exponential)
  maxDelay: number       // ms, default 30000
  jitter: boolean        // random jitter to prevent thundering herd
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
 */
export function defaultRetryable(err: any): boolean {
  if (!err) return false
  if (err instanceof TypeError && err.message.includes('fetch')) return true
  const status = coerceStatus(err.status ?? err.response?.status)
  if (status) {
    return [429, 500, 502, 503, 504].includes(status)
  }
  const code = err.code
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNABORTED') return true
  return false
}

/**
 * Coerce status to a number. Handles "401" string vs 401 number.
 */
function coerceStatus(status: unknown): number | null {
  if (status == null) return null
  const n = Number(status)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Calculate delay with exponential backoff and optional jitter.
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelay * Math.pow(config.backoffFactor, attempt)
  const capped = Math.min(exponential, config.maxDelay)
  if (!config.jitter) return capped
  return Math.random() * capped
}

/**
 * Retry budget interface for coordinating rate-limited requests across concurrent agents.
 */
export interface RetryBudget {
  domain: string
  maxTokens: number
  availableTokens: number
  waitMs: number
  tryAcquire(): boolean
  release(): void
  waitTime(): number
}

/**
 * Global registry of RetryBudget instances, keyed by domain.
 */
const budgetRegistry = new Map<string, RetryBudget>()

export function getRetryBudget(domain: string, maxTokens: number = 1): RetryBudget {
  if (!budgetRegistry.has(domain)) {
    budgetRegistry.set(domain, createRetryBudget(domain, maxTokens))
  }
  return budgetRegistry.get(domain)!
}

function createRetryBudget(domain: string, maxTokens: number = 1, waitMs: number = 1000): RetryBudget {
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
        availableTokens = Math.min(maxTokens, availableTokens + 1)
        nextRefillAt = Date.now()
        return 0
      }
      return waitMs - elapsed
    },
  }
}

/**
 * Reset all retry budgets. Call this at the start of each run.
 */
export function resetAllRetryBudgets(): void {
  budgetRegistry.clear()
}