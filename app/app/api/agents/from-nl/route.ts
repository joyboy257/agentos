import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { createAgent, updateAgentSchedule } from '@/lib/db/queries'
import { registerAgentSchedule } from '@/lib/runtime/proactive-scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface NLAgent {
  id: string
  name: string
  role: string
  archetype?: 'Ingest' | 'Process' | 'Distill'
  tools: string[]
  description?: string
  schedule?: string | null   // cron expression, e.g. '0 7 * * 1-5'
  position_x: number
  position_y: number
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { agents: NLAgent[]; canvasId: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.agents?.length) {
    return NextResponse.json({ agents: [] })
  }

  const dbRole = 'research_agent'

  const created = await Promise.all(
    body.agents.map(async (agent) => {
      const createdAgent = await createAgent({
        user_id: session.userId,
        name: agent.name,
        role: dbRole,
        config: {
          archetype: agent.archetype ?? null,
          canvas_id: body.canvasId ?? null,
          nl_agent_id: agent.id,
          tools: agent.tools,
          description: agent.description ?? null,
        },
        schedule: agent.schedule ?? null,
      })

      // If a schedule was provided, register it with the proactive scheduler
      if (agent.schedule) {
        await updateAgentSchedule(createdAgent.id, agent.schedule)
        // Fire and forget — failure to schedule doesn't fail agent creation
        void registerAgentSchedule(createdAgent.id, agent.schedule).catch(err => {
          console.warn(`[from-nl] Failed to register schedule for agent ${createdAgent.id}:`, err)
        })
      }

      return {
        id: createdAgent.id,
        nl_agent_id: agent.id,
        name: agent.name,
        role: dbRole,
        tools: agent.tools,
      }
    })
  )

  return NextResponse.json({ agents: created })
}
