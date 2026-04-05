/**
 * Get the authenticated user ID from a request.
 * Checks session cookie first, falls back to x-user-id header (for internal service calls).
 * Throws an error with status 401 if neither is present.
 */
import { NextResponse } from 'next/server'
import { getSessionFromCookie } from './session'

export async function getUserId(req: Request): Promise<string> {
  // Check session cookie first — getSessionFromCookie reads from cookies() directly
  const session = await getSessionFromCookie()
  if (session?.userId) {
    return session.userId
  }

  // Fallback to x-user-id header for internal service-to-service calls
  // (middleware sets this from session cookie on incoming requests)
  const headerUserId = req.headers.get('x-user-id')
  if (headerUserId) {
    return headerUserId
  }

  throw new Error('Unauthorized: no session or x-user-id header')
}

/**
 * Require authenticated user — returns userId or throws a 401 NextResponse.
 * For use in route handlers directly.
 */
export async function requireUserId(req: Request): Promise<string> {
  try {
    return await getUserId(req)
  } catch {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
