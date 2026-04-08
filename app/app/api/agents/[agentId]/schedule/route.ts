/**
 * PATCH /api/agents/[agentId]/schedule
 *
 * Set or clear the cron schedule for an agent.
 * PATCH { cronExpression: string | null }
 *
 * When a cron is set: registers the agent with the BullMQ proactive scheduler.
 * When cron is null: removes the agent's schedule from BullMQ.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getAgent, updateAgentSchedule } from '@/lib/db/queries'
import { registerAgentSchedule, cancelAgentSchedule } from '@/lib/runtime/proactive-scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { agentId } = await params

  const agent = await getAgent(agentId)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  if (agent.user_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { cronExpression: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { cronExpression } = body

  // Validate cron expression if provided
  if (cronExpression !== null) {
    // Basic 5-field cron validation
    const parts = cronExpression.trim().split(/\s+/)
    if (parts.length !== 5) {
      return NextResponse.json(
        { error: 'Invalid cron expression — must be 5 fields (minute hour day month weekday)' },
        { status: 400 }
      )
    }
  }

  // Update DB
  await updateAgentSchedule(agentId, cronExpression)

  // Update BullMQ scheduler
  if (cronExpression === null) {
    await cancelAgentSchedule(agentId)
  } else {
    await registerAgentSchedule(agentId, cronExpression)
  }

  return NextResponse.json({ ok: true, cronExpression })
}