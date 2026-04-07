/**
 * GET /api/teams/[teamId]/tasks     — list tasks for a team
 * POST /api/teams/[teamId]/tasks   — create a new task
 */
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/middleware-helpers'
import { getTeam, createTask, listTasks, getTask } from '@/lib/db/queries'
import { taskRegistry } from '@/lib/runtime/team-registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — list tasks for a team
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { teamId } = await params

  const team = await getTeam(teamId)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const tasks = await listTasks(teamId)
  return NextResponse.json({ tasks })
}

// ---------------------------------------------------------------------------
// POST — create a new task
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { teamId } = await params

  const team = await getTeam(teamId)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  let body: { agent_id?: string; parent_session_id?: string; branch_name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { agent_id, parent_session_id, branch_name } = body

  if (!agent_id || typeof agent_id !== 'string') {
    return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
  }

  const task = await createTask({
    team_id: teamId,
    agent_id,
    parent_session_id: parent_session_id ?? null,
    branch_name: branch_name ?? null,
  })

  taskRegistry.create({
    team_id: teamId,
    agent_id,
    parent_session_id,
    branch_name,
  })

  return NextResponse.json({ task }, { status: 201 })
}
