/**
 * GET /api/canvases/[canvasId]  — get a single canvas
 * PUT /api/canvases/[canvasId]  — update a canvas
 * DELETE /api/canvases/[canvasId] — delete a canvas
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getUserId } from '@/lib/auth/middleware-helpers'
import type { Canvas } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — fetch a canvas
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { canvasId } = await params

  const { rows } = await sql`
    SELECT * FROM canvases WHERE id = ${canvasId} AND user_id = ${userId}
  `

  if (!rows[0]) {
    return NextResponse.json({ error: 'Canvas not found' }, { status: 404 })
  }

  return NextResponse.json({ canvas: rows[0] as Canvas })
}

// ---------------------------------------------------------------------------
// PUT — update a canvas
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { canvasId } = await params

  let body: {
    name?: string
    domain?: string | null
    agents_json?: unknown[]
    connections_json?: unknown[]
    is_default?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Verify ownership
  const { rows: existing } = await sql`
    SELECT * FROM canvases WHERE id = ${canvasId} AND user_id = ${userId}
  `
  if (!existing[0]) {
    return NextResponse.json({ error: 'Canvas not found' }, { status: 404 })
  }

  const current = existing[0] as Record<string, unknown>

  // If setting as default, unset existing default first
  if (body.is_default && !current.is_default) {
    await sql`UPDATE canvases SET is_default = false WHERE user_id = ${userId} AND is_default = true`
  }

  const { rows } = await sql`
    UPDATE canvases SET
      name       = ${body.name ?? (current.name as string)},
      domain     = ${body.domain !== undefined ? body.domain : (current.domain as string | null)},
      agents_json     = ${body.agents_json ? JSON.stringify(body.agents_json) : (current.agents_json as string)},
      connections_json = ${body.connections_json ? JSON.stringify(body.connections_json) : (current.connections_json as string)},
      is_default = ${body.is_default ?? (current.is_default as boolean)},
      updated_at = NOW()
    WHERE id = ${canvasId} AND user_id = ${userId}
    RETURNING *
  `

  return NextResponse.json({ canvas: rows[0] as Canvas })
}

// ---------------------------------------------------------------------------
// DELETE — delete a canvas
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { canvasId } = await params

  const { rowCount } = await sql`
    DELETE FROM canvases WHERE id = ${canvasId} AND user_id = ${userId}
  `

  if (!rowCount) {
    return NextResponse.json({ error: 'Canvas not found' }, { status: 404 })
  }

  return NextResponse.json({ deleted: true })
}
