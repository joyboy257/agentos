import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/middleware-helpers'
import { sql } from '@vercel/postgres'

export async function POST(req: NextRequest) {
  const userId = await requireUserId(req as any)
  const { sourceId, targetId } = await req.json()

  if (!sourceId || !targetId) {
    return NextResponse.json({ error: 'Missing sourceId or targetId' }, { status: 400 })
  }

  // Prevent self-connections
  if (sourceId === targetId) {
    return NextResponse.json({ error: 'Cannot connect an agent to itself' }, { status: 400 })
  }

  // Cycle detection: BFS from targetId following outgoing edges
  // If we can reach sourceId from targetId, adding sourceId→targetId creates a cycle
  const cycleExists = await detectCycle(sourceId, targetId, userId)
  if (cycleExists) {
    return NextResponse.json({ error: 'Cannot create wire: would create a circular dependency' }, { status: 400 })
  }

  // Verify user owns the source agent
  const agentCheck = await sql`
    SELECT org_id FROM agents WHERE id = ${sourceId} AND user_id = ${userId}
  `
  if (agentCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const orgId = agentCheck.rows[0].org_id

  const result = await sql`
    INSERT INTO wires (id, org_id, source_id, target_id)
    VALUES (gen_random_uuid(), ${orgId}, ${sourceId}, ${targetId})
    RETURNING *
  `

  return NextResponse.json({ wire: result.rows[0] })
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUserId(req as any)
  const { wireId } = await req.json()

  // Verify ownership before deleting
  const result = await sql`
    DELETE FROM wires w
    USING agents a
    WHERE w.id = ${wireId}
    AND w.source_id = a.id
    AND a.user_id = ${userId}
    RETURNING w.*
  `

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

async function detectCycle(sourceId: string, targetId: string, userId: string): Promise<boolean> {
  // BFS from targetId following outgoing edges
  // If we reach sourceId, a cycle would exist
  const visited = new Set<string>()
  const queue: string[] = [targetId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === sourceId) return true
    if (visited.has(current)) continue
    visited.add(current)

    const result = await sql`
      SELECT w.target_id
      FROM wires w
      JOIN agents a ON a.id = w.source_id
      WHERE w.source_id = ${current}
      AND a.user_id = ${userId}
    `
    for (const row of result.rows as { target_id: string }[]) {
      queue.push(row.target_id)
    }
  }
  return false
}
