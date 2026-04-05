import { NextRequest, NextResponse } from 'next/server'
import { getEscalationSuggestionsForRun, resolveEscalationSuggestion } from '@/lib/db/queries'
import { getUserId } from '@/lib/auth/middleware-helpers'

export async function GET(req: NextRequest) {
  const userId = await getUserId(req)

  const runId = req.nextUrl.searchParams.get('runId')
  if (!runId) {
    return NextResponse.json({ error: 'Missing required query param: runId' }, { status: 400 })
  }

  const suggestions = await getEscalationSuggestionsForRun(runId)
  return NextResponse.json({ suggestions })
}

export async function POST(req: NextRequest) {
  await getUserId(req) // Auth only, userId not used in this handler

  let body: { id: string; action: 'accepted' | 'dismissed' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, action } = body
  if (!id || !action) {
    return NextResponse.json({ error: 'Missing required fields: id, action' }, { status: 400 })
  }

  if (!['accepted', 'dismissed'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action. Must be "accepted" or "dismissed"' }, { status: 400 })
  }

  try {
    await resolveEscalationSuggestion(id, action)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[escalation-suggestions] resolveEscalationSuggestion error:', err)
    return NextResponse.json({ error: 'Failed to resolve suggestion' }, { status: 500 })
  }
}
