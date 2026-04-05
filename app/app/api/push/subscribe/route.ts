import { NextRequest, NextResponse } from 'next/server'
import { savePushSubscription } from '@/lib/push-notifications'
import { getSessionFromCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { endpoint, keys } = await req.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  await savePushSubscription({
    userId: session.user_id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  })

  return NextResponse.json({ ok: true })
}
