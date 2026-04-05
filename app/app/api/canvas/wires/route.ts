/**
 * Canvas wire (edge) API.
 * POST  /api/canvas/wires          — create a wire
 * GET   /api/canvas/wires?teamId=  — list wires for a team
 * DELETE /api/canvas/wires?id=&teamId= — delete a wire
 */
import { NextRequest, NextResponse } from 'next/server'
import { ulid } from 'ulid'
import { sql } from '@vercel/postgres'
import { getUserId } from '@/lib/auth/middleware-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detects a cycle if we add an edge from sourceId → targetId.
 * Uses DFS on the existing adjacency list (excluding the edge being checked).
 * Returns true if adding the edge would create a cycle.
 */
async function wouldCreateCycle(
  teamId: string,
  sourceId: string,
  targetId: string
): Promise<boolean> {
  // Self-loops are not allowed
  if (sourceId === targetId) return true

  // Fetch existing edges for the team
  const { rows } = await sql`
    SELECT source_id, target_id FROM canvas_wires WHERE team_id = ${teamId}
  `
  const adj = new Map<string, string[]>()
  for (const row of rows) {
    adj.get(row.source_id)?.push(row.target_id) ?? adj.set(row.source_id, [row.target_id])
  }

  // Add the proposed edge
  adj.get(sourceId)?.push(targetId) ?? adj.set(sourceId, [targetId])

  // DFS from sourceId to see if we can reach sourceId again (cycle)
  const visited = new Set<string>()
  const stack = [sourceId]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === sourceId && visited.size > 0) return true // cycle detected
    if (visited.has(node)) continue
    visited.add(node)
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) stack.push(neighbor)
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// POST — create a wire
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { teamId: string; sourceId: string; targetId: string; label?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { teamId, sourceId, targetId, label } = body
  if (!teamId || !sourceId || !targetId) {
    return NextResponse.json({ error: 'teamId, sourceId, and targetId are required' }, { status: 400 })
  }

  // Cycle detection
  const cycle = await wouldCreateCycle(teamId, sourceId, targetId)
  if (cycle) {
    return NextResponse.json(
      { error: 'Adding this connection would create a cycle in the agent flow' },
      { status: 422 }
    )
  }

  const id = ulid()
  try {
    const { rows } = await sql`
      INSERT INTO canvas_wires (id, team_id, source_id, target_id, label)
      VALUES (${id}, ${teamId}, ${sourceId}, ${targetId}, ${label ?? null})
      RETURNING *
    `
    return NextResponse.json({ wire: rows[0] }, { status: 201 })
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'This connection already exists' }, { status: 409 })
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// GET — list wires for a team
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  await getUserId(req) // Auth only

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }

  const { rows } = await sql`
    SELECT * FROM canvas_wires WHERE team_id = ${teamId} ORDER BY created_at ASC
  `
  return NextResponse.json({ wires: rows })
}

// ---------------------------------------------------------------------------
// DELETE — remove a wire
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const teamId = searchParams.get('teamId')

  if (!id || !teamId) {
    return NextResponse.json({ error: 'id and teamId are required' }, { status: 400 })
  }

  const { rowCount } = await sql`
    DELETE FROM canvas_wires WHERE id = ${id} AND team_id = ${teamId}
  `

  if (!rowCount) {
    return NextResponse.json({ error: 'Wire not found' }, { status: 404 })
  }

  return NextResponse.json({ deleted: true })
}
