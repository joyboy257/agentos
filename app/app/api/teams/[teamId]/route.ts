/**
 * GET /api/teams/[teamId]      — get a team
 * PATCH /api/teams/[teamId]    — update team status
 * DELETE /api/teams/[teamId]   — soft-delete a team
 */
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/middleware-helpers'
import { getTeam, updateTeamStatus } from '@/lib/db/queries'
import { teamRegistry } from '@/lib/runtime/team-registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — fetch a team
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

  return NextResponse.json({ team })
}

// ---------------------------------------------------------------------------
// PATCH — update team (status or coordinator session)
// ---------------------------------------------------------------------------

export async function PATCH(
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

  let body: { status?: 'created' | 'running' | 'completed' | 'deleted'; coordinator_session_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.status) {
    await updateTeamStatus(teamId, body.status)
    teamRegistry.updateStatus(teamId, body.status)
  }

  if (body.coordinator_session_id) {
    teamRegistry.setCoordinatorSession(teamId, body.coordinator_session_id)
  }

  const updated = await getTeam(teamId)
  return NextResponse.json({ team: updated })
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete a team
// ---------------------------------------------------------------------------

export async function DELETE(
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

  await updateTeamStatus(teamId, 'deleted')
  teamRegistry.delete(teamId)

  return NextResponse.json({ deleted: true })
}
