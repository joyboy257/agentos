import { cookies } from 'next/headers'
import { getSession, deleteSession } from '@/lib/db/queries'
import { createSession } from '@/lib/db/queries'
import { nanoid } from 'nanoid'

const SESSION_COOKIE = 'agentos_session'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function getSessionFromCookie() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value
  if (!sessionId) return null
  return getSession(sessionId)
}

export async function createSessionForUser(userId: string) {
  const cookieStore = await cookies()
  const sessionId = nanoid(32)
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await createSession(sessionId, userId, expiresAt)

  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })

  return sessionId
}

export async function deleteSessionCookie() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value
  if (sessionId) {
    await deleteSession(sessionId)
  }
  cookieStore.delete(SESSION_COOKIE)
}
