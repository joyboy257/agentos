/**
 * GET /api/canvases         — list all canvases for the authenticated user
 * POST /api/canvases        — create a new canvas
 */
import { NextRequest, NextResponse } from 'next/server'
import { ulid } from 'ulid'
import { sql } from '@vercel/postgres'
import { getUserId } from '@/lib/auth/middleware-helpers'
import type { Canvas } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — list canvases
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { rows } = await sql`
    SELECT * FROM canvases WHERE user_id = ${userId} ORDER BY created_at DESC
  `

  return NextResponse.json({ canvases: rows as Canvas[] })
}

// ---------------------------------------------------------------------------
// POST — create canvas
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await getUserId(req)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: string; domain?: string; agents_json?: unknown[]; connections_json?: unknown[]; is_default?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, domain, agents_json, connections_json, is_default } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const id = ulid()

  // If this is set as default, unset any existing default first
  if (is_default) {
    await sql`UPDATE canvases SET is_default = false WHERE user_id = ${userId} AND is_default = true`
  }

  const { rows } = await sql`
    INSERT INTO canvases (id, user_id, name, domain, agents_json, connections_json, is_default)
    VALUES (
      ${id},
      ${userId},
      ${name},
      ${domain ?? null},
      ${JSON.stringify(agents_json ?? [])},
      ${JSON.stringify(connections_json ?? [])},
      ${is_default ?? false}
    )
    RETURNING *
  `

  return NextResponse.json({ canvas: rows[0] as Canvas }, { status: 201 })
}
