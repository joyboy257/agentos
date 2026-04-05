import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { sql } from '@vercel/postgres'

/**
 * POST /api/push — register Pushover user key
 * Body: { pushoverUserKey: string }
 * Requires auth session.
 *
 * Validates Pushover user key format (30-char alphanumeric) before storage.
 * The user's Pushover API token is their own user key from pushover.net.
 */
export async function POST(request: Request) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pushoverUserKey } = await request.json()

  // Validate Pushover user key format (30-char alphanumeric)
  if (!pushoverUserKey || typeof pushoverUserKey !== 'string' || !/^[a-zA-Z0-9]{30}$/.test(pushoverUserKey)) {
    return NextResponse.json({ error: 'Invalid Pushover user key format' }, { status: 400 })
  }

  await sql`UPDATE users SET pushover_user_key = ${pushoverUserKey} WHERE id = ${session.user_id}`

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/push — clear Pushover user key
 * Requires auth session.
 */
export async function DELETE() {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await sql`UPDATE users SET pushover_user_key = NULL WHERE id = ${session.user_id}`

  return NextResponse.json({ success: true })
}
