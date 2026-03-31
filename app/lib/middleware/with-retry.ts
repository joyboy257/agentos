/**
 * Retry with exponential backoff + jitter.
 * Respects shared RetryBudget for coordinated rate-limiting.
 */

import type { RetryConfig, RetryBudget } from './retry-budget'
import { DEFAULT_RETRY_CONFIG, defaultRetryable, calculateDelay, getRetryBudget, resetAllRetryBudgets } from './retry-budget'

export type { RetryConfig }
export { DEFAULT_RETRY_CONFIG, defaultRetryable, calculateDelay, getRetryBudget, resetAllRetryBudgets }
export type { RetryBudget }

/**
 * Execute a function with retry logic.
 * If a RetryBudget is provided, coordinates with it for shared rate-limiting.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  retryable: (err: any) => boolean = defaultRetryable,
  budget?: RetryBudget | null
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (budget) {
        const waitTime = budget.waitTime()
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
        if (!budget.tryAcquire()) {
          await new Promise(resolve => setTimeout(resolve, budget.waitMs))
          if (!budget.tryAcquire()) {
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
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}