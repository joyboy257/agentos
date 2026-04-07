import { NextRequest, NextResponse } from 'next/server'
import { DurableRunner } from '@/lib/runtime/durable-runner'
import { getAgent, getRunsByAgent, updateAgentStatus } from '@/lib/db/queries'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params

  // 1. Look up the agent
  const agent = await getAgent(agentId)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // 2. Verify the agent status is 'paused_budget'
  if (agent.status !== 'paused_budget') {
    return NextResponse.json(
      { error: 'Agent is not paused on budget' },
      { status: 400 }
    )
  }

  // 3. Find the most recent run for this agent to resume
  const runs = await getRunsByAgent(agentId)
  const lastRun = runs.find((r) => r.status === 'running' || r.status === 'paused')
  if (!lastRun) {
    return NextResponse.json({ error: 'No paused run found to resume' }, { status: 404 })
  }

  const runner = new DurableRunner()

  try {
    // 4. Resume the agent from its last checkpoint
    const result = await runner.resume(lastRun.id)

    // 5. On success, update agent status back to 'running'
    if (result.status === 'completed' || result.status === 'waiting_for_approval') {
      await updateAgentStatus(agentId, 'running')
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
