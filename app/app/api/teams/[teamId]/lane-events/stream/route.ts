/**
 * POST /api/teams/{teamId}/lane-events/stream
 *
 * Workers call this endpoint to emit lane events.
 * Body: LaneEvent
 * Response: 200 OK
 */

import { getLaneEmitter } from '@/lib/runtime/lane-events'
import type { LaneEvent } from '@/lib/runtime/lane-events'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params

  try {
    const event: LaneEvent = await request.json()

    // Validate required fields
    if (!event.type || !event.task_id || !event.agent_id || !event.status) {
      return Response.json(
        { error: 'Missing required fields: type, task_id, agent_id, status' },
        { status: 400 }
      )
    }

    // Ensure team_id matches URL
    const validatedEvent: LaneEvent = {
      ...event,
      team_id: teamId,
      timestamp: event.timestamp ?? Date.now(),
    }

    const emitter = getLaneEmitter(teamId)
    emitter.emit(validatedEvent)

    return new Response(null, { status: 200 })
  } catch (err) {
    console.error('[LaneEvents] Failed to emit event:', err)
    return Response.json({ error: 'Failed to emit event' }, { status: 500 })
  }
}
