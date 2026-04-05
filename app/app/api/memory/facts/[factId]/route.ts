/**
 * Route: PATCH /api/memory/facts/[factId]
 *
 * Confirms or denies a fact. When denied, sends feedback to mem0
 * so the extraction model adjusts (feedback loop per R4).
 *
 * Auth: getSessionFromCookie (not getServerSession).
 * Body: { action: 'confirm' | 'deny' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { confirmFact, denyFact, getPendingFacts } from '@/lib/memory/memory-operations'
import { sendFeedbackToMem0 } from '@/lib/memory/memory-client'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ factId: string }> }
) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.userId

  const { factId } = await params

  let body: { action: 'confirm' | 'deny' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action } = body
  if (!action || !['confirm', 'deny'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Must be "confirm" or "deny"' },
      { status: 400 }
    )
  }

  try {
    if (action === 'confirm') {
      await confirmFact(factId, userId)
    } else {
      await denyFact(factId, userId)
      // Fire-and-forget: send feedback to mem0 so extraction improves over time
      sendFeedbackToMem0(factId).catch((err) =>
        console.error('[memory] sendFeedbackToMem0 failed:', err)
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[memory/facts] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update fact' }, { status: 500 })
  }
}

/**
 * Route: GET /api/memory/facts/[factId]
 *
 * Returns a single fact by ID for review UI.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ factId: string }> }
) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.userId

  const { factId } = await params

  try {
    const { getFactById } = await import('@/lib/memory/memory-operations')
    const fact = await getFactById(factId, userId)
    if (!fact) {
      return NextResponse.json({ error: 'Fact not found' }, { status: 404 })
    }
    return NextResponse.json({ fact })
  } catch (err) {
    console.error('[memory/facts] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch fact' }, { status: 500 })
  }
}
