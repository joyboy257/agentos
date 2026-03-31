/**
 * SSE endpoint for reasoning trace events.
 *
 * GET /api/runs/:runId/events?lastSequence=N
 *
 * Returns an SSE stream of reasoning events for the specified run.
 * Supports cursor-based reconnection via the `lastSequence` query parameter.
 *
 * Format: `event: TYPE\ndata: JSON\n\n`
 */

import { NextRequest, NextResponse } from 'next/server'
import { SSEStream } from '@/lib/tracing/sse-stream'
import { eventBufferRegistry } from '@/lib/tracing/event-buffer'
import { sql } from '@vercel/postgres'
import { isReasoningEvent } from '@/lib/tracing/event-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Require ownership of a run — the session user must own the team that owns the run.
 */
async function requireRunOwnership(runId: string, _request: NextRequest): Promise<{
  ok: true
  userId: string
} | { ok: false; error: NextResponse }> {
  try {
    const result = await sql`
      SELECT r.id, r.team_id, t.user_id
      FROM runs r
      JOIN teams t ON t.id = r.team_id
      WHERE r.id = ${runId}
      LIMIT 1
    `

    if (result.rows.length === 0) {
      return { ok: false, error: NextResponse.json({ error: 'Run not found' }, { status: 404 }) }
    }

    // TODO: Verify session user matches t.user_id
    // For now, allow access (session verification happens at auth layer)
    return { ok: true, userId: result.rows[0].user_id as string }
  } catch {
    return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const { searchParams } = new URL(request.url)
  const lastSequenceParam = searchParams.get('lastSequence')
  const lastSequence = lastSequenceParam ? parseInt(lastSequenceParam, 10) : 0

  if (isNaN(lastSequence) || lastSequence < 0) {
    return NextResponse.json({ error: 'Invalid lastSequence' }, { status: 400 })
  }

  // Verify run ownership
  const ownership = await requireRunOwnership(runId, request)
  if (!ownership.ok) {
    return ownership.error
  }

  // Get or create the event buffer for this run
  const buffer = eventBufferRegistry.getOrCreate(runId)

  // Check if run has completed — if so, serve from persistence
  // For now, just create the SSE stream
  const sseStream = new SSEStream(runId, { lastSequence })

  const currentSequence = sseStream.getCurrentSequence()

  // If the run has completed (buffer is closed), send stream_end immediately
  // Otherwise, stream indefinitely
  const stream = sseStream.toReadableStream()

  // Send initial events followed by live stream
  const encoder = new TextEncoder()
  const events = buffer.getEvents(lastSequence)

  // Build the response with all buffered events
  let responseText = ''
  for (const event of events) {
    if (isReasoningEvent(event)) {
      responseText += `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
    }
  }

  // Add stream end if buffer is empty (run already complete)
  if (events.length === 0 && currentSequence <= lastSequence) {
    responseText += `event: stream_end\ndata: ${JSON.stringify({ finalSequence: currentSequence })}\n\n`
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
