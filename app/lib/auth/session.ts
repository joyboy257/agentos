/**
 * Session compat layer — delegates to BetterAuth while keeping
 * the same function signatures used throughout the app.
 */
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function getSessionFromCookie() {
  // Use next/headers cookies - works in server context
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  if (!cookieHeader) return null
  const result = await auth.api.getSession({ headers: { cookie: cookieHeader } })
  return result?.session ?? null
}

export async function createSessionForUser(userId: string) {
  // BetterAuth creates sessions internally during email verification.
  // This function is kept for compatibility but sessions are created
  // via the magic link verification flow.
  const cookieStore = await cookies()
  // Trigger session creation by calling getSession which will refresh
  const cookieHeader = cookieStore.toString()
  await auth.api.getSession({ headers: { cookie: cookieHeader } })
}

export async function deleteSessionCookie() {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  if (cookieHeader) {
    await auth.api.signOut({ headers: { cookie: cookieHeader } })
  }
  cookieStore.delete('agentos_session')
}
