import { NextRequest, NextResponse } from 'next/server'
import { deletePushSubscription } from '@/lib/push-notifications'
import { getSessionFromCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { endpoint } = await req.json()
  if (!endpoint) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  await deletePushSubscription(endpoint)
  return NextResponse.json({ ok: true })
}
