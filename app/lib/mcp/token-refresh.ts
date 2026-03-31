/**
 * Token Refresh — Atomic token refresh with distributed lock
 * ARCHITECTURE-02-mcp-client.md §Token Refresh
 *
 * Uses a Map of in-flight refresh Promises to ensure only one concurrent
 * refresh per userId. Others wait for the same Promise.
 */

const refreshLocks = new Map<string, Promise<TokenRefreshResult>>()

export interface TokenRefreshResult {
  accessToken: string
  expiresAt: Date | null
}

/**
 * Atomic token refresh: only one refresh runs per userId at a time.
 * Concurrent callers receive the same Promise and wait for the same result.
 *
 * @param userId       - User whose token needs refresh
 * @param refreshToken  - The refresh token to use
 * @param refreshFn     - Async function that performs the actual refresh and returns { accessToken, expiresAt }
 */
export async function atomicTokenRefresh(
  userId: string,
  refreshToken: string,
  refreshFn: (token: string) => Promise<TokenRefreshResult>
): Promise<TokenRefreshResult> {
  // If a refresh is already in flight for this user, wait for it
  const existing = refreshLocks.get(userId)
  if (existing !== undefined) {
    // Wait for the in-flight refresh to complete, then return its result
    const result = await existing
    return result
  }

  // Otherwise, start a new refresh and store the Promise
  const refreshPromise = (async () => {
    try {
      const result = await refreshFn(refreshToken)
      return result
    } finally {
      // Always release the lock when done
      refreshLocks.delete(userId)
    }
  })()

  refreshLocks.set(userId, refreshPromise)
  return refreshPromise
}