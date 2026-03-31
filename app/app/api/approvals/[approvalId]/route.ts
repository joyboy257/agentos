/**
 * PUT /api/approvals/[approvalId]
 *
 * Resolves a pending human approval.
 *
 * Body:
 *  { runId, toolCallId, decision: 'approved'|'edited'|'skipped'|'cancelled', revisedArgs?, reason? }
 *
 * DOC-04: ownership check — run.userId === session.userId on every approval PUT.
 *
 * After resolution, the pending promise in approval-manager is resolved and the
 * runner's blocked tool call resumes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveApproval } from '@/lib/approval/approval-manager'
import type { ApprovalDecision } from '@/lib/approval/approval-manager'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ approvalId: string }> }
) {
  const { approvalId } = await params

  let body: {
    runId: string
    toolCallId: string
    decision: ApprovalDecision
    revisedArgs?: Record<string, unknown>
    reason?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { runId, toolCallId, decision, revisedArgs, reason } = body

  if (!runId || !toolCallId || !decision) {
    return NextResponse.json(
      { error: 'Missing required fields: runId, toolCallId, decision' },
      { status: 400 }
    )
  }

  if (!['approved', 'edited', 'skipped', 'cancelled', 'timeout'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  }

  // TODO: DOC-04 ownership check
  // const session = await getSession(req)
  // const run = await db.getRun(runId)
  // if (run.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const result = resolveApproval({
      runId,
      agentId: '', // agentId is not needed here since toolCallId is globally unique in our Map
      toolCallId,
      decision,
      revisedArgs,
      reason,
    })

    return NextResponse.json({ ok: true, decision: result.decision, revisedArgs: result.revisedArgs })
  } catch (err) {
    console.error('[approvals] resolveApproval error:', err)
    return NextResponse.json({ error: 'Failed to resolve approval' }, { status: 500 })
  }
}
