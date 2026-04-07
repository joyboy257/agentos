/**
 * GET /api/teams/{teamId}/lane-events
 *
 * SSE stream of lane events for a team.
 * Team Lead and canvas UI subscribe to this stream to observe worker progress in real-time.
 */

import { getLaneEmitter } from '@/lib/runtime/lane-events'
import type { LaneEvent } from '@/lib/runtime/lane-events'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params

  const emitter = getLaneEmitter(teamId)

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      // Send an initial heartbeat comment to confirm connection
      controller.enqueue(encoder.encode(': connected\n\n'))

      // Subscribe to lane events
      const unsubscribe = emitter.subscribe((event: LaneEvent) => {
        try {
          const data = JSON.stringify(event)
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch (err) {
          console.error('[LaneEvents SSE] Failed to enqueue event:', err)
        }
      })

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          // Stream closed — clean up
          clearInterval(keepAlive)
        }
      }, 30_000)

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
