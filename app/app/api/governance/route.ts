/**
 * GET /api/governance — list pending governance actions
 * POST /api/governance — create a new governance action
 */
import { NextRequest, NextResponse } from 'next/server'
import { ulid } from 'ulid'
import { getSessionFromCookie } from '@/lib/auth/session'
import { createGovernanceAction, listGovernanceActions } from '@/lib/db/queries'
import type { GovernanceAction } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — list pending governance actions
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as GovernanceAction['status'] | null

  try {
    const actions = await listGovernanceActions(
      session.userId,
      status ?? undefined
    )
    return NextResponse.json({ actions })
  } catch (err) {
    console.error('[governance] listGovernanceActions error:', err)
    return NextResponse.json({ error: 'Failed to list governance actions' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST — create a new governance action
// ---------------------------------------------------------------------------

interface CreateGovernanceActionBody {
  canvas_id?: string | null
  action_type: GovernanceAction['action_type']
  payload_json: string
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateGovernanceActionBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { canvas_id, action_type, payload_json } = body

  if (!action_type || !payload_json) {
    return NextResponse.json(
      { error: 'action_type and payload_json are required' },
      { status: 400 }
    )
  }

  if (!['new_agent', 'new_tool', 'schema_change'].includes(action_type)) {
    return NextResponse.json({ error: 'Invalid action_type' }, { status: 400 })
  }

  try {
    const action = await createGovernanceAction({
      id: ulid(),
      user_id: session.userId,
      canvas_id: canvas_id ?? null,
      action_type,
      payload_json,
    })
    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    console.error('[governance] createGovernanceAction error:', err)
    return NextResponse.json({ error: 'Failed to create governance action' }, { status: 500 })
  }
}
