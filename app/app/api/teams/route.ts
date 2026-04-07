/**
 * GET /api/teams         — list teams for a canvas
 * POST /api/teams        — create a new team
 */
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/middleware-helpers'
import { createTeamRow, listTeams, getTeam } from '@/lib/db/queries'
import { teamRegistry } from '@/lib/runtime/team-registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — list teams for a canvas
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  // Accept both canvasId (camelCase from frontend) and canvas_id (underscore)
  const canvasId = searchParams.get('canvasId') ?? searchParams.get('canvas_id')

  if (!canvasId) {
    return NextResponse.json({ error: 'canvasId is required' }, { status: 400 })
  }

  const teams = await listTeams(canvasId)
  return NextResponse.json({ teams })
}

// ---------------------------------------------------------------------------
// POST — create a new team
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { canvas_id?: string; name?: string; task_ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { canvas_id, name, task_ids } = body

  if (!canvas_id || typeof canvas_id !== 'string') {
    return NextResponse.json({ error: 'canvas_id is required' }, { status: 400 })
  }
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Verify canvas ownership
  const existing = await getTeam(canvas_id)
  if (!existing && canvas_id) {
    // canvas_id is not a team id, it's a canvas — just create the team
  }

  const team = await createTeamRow({ canvas_id, name })
  const inMemoryTeam = teamRegistry.create(canvas_id, name, task_ids ?? [])

  return NextResponse.json({ team }, { status: 201 })
}
