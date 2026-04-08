/**
 * GET  /api/agents            — list all agents for the authenticated user
 * POST /api/agents            — create an agent (used by NL flow)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { listAgents, createAgent } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — list agents
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agents = await listAgents(session.userId)
  return NextResponse.json({ agents })
}

// ---------------------------------------------------------------------------
// POST — create agent
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    name: string
    role?: 'research_agent' | 'support_agent'
    config?: Record<string, unknown>
    schedule?: string | null
    budget_ms?: number | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const agent = await createAgent({
    user_id: session.userId,
    name: body.name.trim(),
    role: body.role ?? 'research_agent',
    config: body.config ?? {},
    schedule: body.schedule ?? null,
    budget_ms: body.budget_ms ?? null,
  })

  return NextResponse.json({ agent }, { status: 201 })
}