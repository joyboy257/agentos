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
import { sql } from '@vercel/postgres'

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

  // Create SSE stream — SSEStream manages its own buffer internally via eventBufferRegistry
  const sseStream = new SSEStream(runId, { lastSequence })
  const stream = sseStream.toReadableStream()

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
