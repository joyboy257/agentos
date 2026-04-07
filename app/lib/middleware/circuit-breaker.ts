/**
 * Circuit Breaker — prevents cascading failures by stopping calls to a failing service.
 *
 * State machine:
 *   closed → open (after threshold consecutive failures)
 *   open → half-open (after resetTimeoutMs elapsed)
 *   half-open → closed (on success)
 *   half-open → open (on failure)
 */

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreaker {
  name: string
  state: CircuitState
  failureCount: number
  lastFailure: number | null
  lastSuccess: number | null
  threshold: number
  resetTimeoutMs: number
}

export interface CircuitBreakerConfig {
  threshold?: number
  resetTimeoutMs?: number
}

const DEFAULT_THRESHOLD = 3
const DEFAULT_RESET_TIMEOUT_MS = 30_000

/**
 * Create a new circuit breaker instance.
 */
export function createCircuitBreaker(
  name: string,
  config: CircuitBreakerConfig = {}
): CircuitBreaker {
  return {
    name,
    state: 'closed',
    failureCount: 0,
    lastFailure: null,
    lastSuccess: null,
    threshold: config.threshold ?? DEFAULT_THRESHOLD,
    resetTimeoutMs: config.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS,
  }
}

/**
 * Record a successful call — reset failure count and transition to closed.
 */
export function circuitBreakerSuccess(breaker: CircuitBreaker): void {
  breaker.failureCount = 0
  breaker.lastSuccess = Date.now()
  breaker.state = 'closed'
}

/**
 * Record a failed call — increment counter and potentially open the circuit.
 */
export function circuitBreakerFailure(breaker: CircuitBreaker): void {
  breaker.failureCount++
  breaker.lastFailure = Date.now()

  if (breaker.failureCount >= breaker.threshold) {
    breaker.state = 'open'
  }
}

/**
 * Check if the circuit allows a call (not open, or open but timeout elapsed).
 * If timeout elapsed while open, transitions to half-open.
 */
export function circuitBreakerCanAttempt(breaker: CircuitBreaker): boolean {
  if (breaker.state === 'closed') {
    return true
  }

  if (breaker.state === 'open') {
    const elapsed = Date.now() - (breaker.lastFailure ?? 0)
    if (elapsed >= breaker.resetTimeoutMs) {
      breaker.state = 'half-open'
      return true
    }
    return false
  }

  // half-open — allow exactly one test call
  return true
}

/**
 * Wrap an async function with circuit breaker protection.
 * Throws Error('CIRCUIT_OPEN') when the circuit is open.
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  breaker: CircuitBreaker
): Promise<T> {
  if (!circuitBreakerCanAttempt(breaker)) {
    throw Object.assign(new Error('CIRCUIT_OPEN'), { code: 'CIRCUIT_OPEN' })
  }

  try {
    const result = await fn()
    circuitBreakerSuccess(breaker)
    return result
  } catch (err) {
    circuitBreakerFailure(breaker)
    throw err
  }
}

/**
 * Get current circuit breaker status for a given tool name.
 */
export function getCircuitBreakerStatus(breaker: CircuitBreaker): {
  state: CircuitState
  failureCount: number
  lastFailure: number | null
  lastSuccess: number | null
} {
  return {
    state: breaker.state,
    failureCount: breaker.failureCount,
    lastFailure: breaker.lastFailure,
    lastSuccess: breaker.lastSuccess,
  }
}

// Pre-configured circuit breakers per tool type
export const circuitBreakers: Record<string, CircuitBreaker> = {
  gmail: createCircuitBreaker('gmail', { threshold: 3, resetTimeoutMs: 30_000 }),
  hubspot: createCircuitBreaker('hubspot', { threshold: 3, resetTimeoutMs: 30_000 }),
  web: createCircuitBreaker('web', { threshold: 5, resetTimeoutMs: 15_000 }),
  llm: createCircuitBreaker('llm', { threshold: 10, resetTimeoutMs: 60_000 }),
  'google-calendar': createCircuitBreaker('google-calendar', { threshold: 3, resetTimeoutMs: 30_000 }),
  calendar: createCircuitBreaker('calendar', { threshold: 3, resetTimeoutMs: 30_000 }),
  stripe: createCircuitBreaker('stripe', { threshold: 3, resetTimeoutMs: 30_000 }),
  twilio: createCircuitBreaker('twilio', { threshold: 3, resetTimeoutMs: 30_000 }),
  quickbooks: createCircuitBreaker('quickbooks', { threshold: 3, resetTimeoutMs: 30_000 }),
}

/**
 * Get the appropriate circuit breaker for a tool name.
 * Falls back to 'gmail' for gmail.read/gmail.send, etc.
 */
export function getCircuitBreakerForTool(toolName: string): CircuitBreaker {
  const prefix = toolName.split('.')[0]
  return circuitBreakers[prefix] ?? circuitBreakers['gmail']
}
