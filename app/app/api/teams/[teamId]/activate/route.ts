/**
 * POST /api/teams/[teamId]/activate
 *
 * Activates a team: calls DurableRunner.executeTeam(teamId) to start
 * the multi-agent fan-out. Lane events are emitted via the coordinator-loop
 * and streamed to the canvas UI via SSE at /api/teams/[teamId]/lane-events.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/middleware-helpers'
import { getTeam } from '@/lib/db/queries'
import { DurableRunner } from '@/lib/runtime/durable-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  // Prevent concurrent activations — if team is already running, return 409
  if (team.status === 'running') {
    return NextResponse.json({ error: 'Team is already running' }, { status: 409 })
  }

  try {
    const runner = new DurableRunner()

    // executeTeam is async — it returns immediately after starting the fan-out.
    // Lane events from coordinator-loop are emitted to the SSE stream at
    // /api/teams/[teamId]/lane-events which CanvasProvider subscribes to.
    await runner.executeTeam(teamId)

    return NextResponse.json({ teamId, status: 'running' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[TeamActivate] executeTeam failed:', message)
    return NextResponse.json({ error: `Failed to activate team: ${message}` }, { status: 500 })
  }
}
