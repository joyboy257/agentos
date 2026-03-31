/**
 * AbortSignal utilities for reliability middleware.
 * Checks if a signal is already aborted before each retry attempt.
 */

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