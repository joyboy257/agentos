/**
 * Timeout enforcement for tool execution.
 * Uses AbortController-based timeout that can cancel in-flight HTTP requests.
 */

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

export const DEFAULT_TIMEOUT_MS = 30_000 // 30 seconds

/**
 * Wraps a Promise with an AbortController-based timeout.
 * The AbortController's signal is returned so callers can pass it to in-flight HTTP requests.
 */
export async function withTimeout<T>(
  toolName: string,
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  abortSignal?: AbortSignal | null
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>
  const controller = new AbortController()

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
    controller.abort()
  }
}

/**
 * Returns an AbortSignal that fires when either input signal aborts.
 */
function mergeAbortSignal(a: AbortSignal, b: AbortController['signal']): AbortSignal {
  if (a.aborted || b.aborted) {
    return AbortSignal.abort()
  }
  const controller = new AbortController()
  a.addEventListener('abort', () => controller.abort(), { once: true })
  b.addEventListener('abort', () => controller.abort(), { once: true })
  return controller.signal
}