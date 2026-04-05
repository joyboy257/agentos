/**
 * PATCH /api/governance/[actionId] — approve or deny a governance action
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { resolveGovernanceAction } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { actionId } = await params

  let body: { status: 'approved' | 'denied' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status } = body

  if (!['approved', 'denied'].includes(status)) {
    return NextResponse.json({ error: 'status must be approved or denied' }, { status: 400 })
  }

  if (!actionId) {
    return NextResponse.json({ error: 'actionId is required' }, { status: 400 })
  }

  try {
    await resolveGovernanceAction(actionId, session.userId, status)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[governance] resolveGovernanceAction error:', err)
    return NextResponse.json({ error: 'Failed to resolve governance action' }, { status: 500 })
  }
}
