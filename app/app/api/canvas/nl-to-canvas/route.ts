import { NextRequest, NextResponse } from 'next/server'
import { interpret } from '@/lib/nl/interpret'
import { getUserId } from '@/lib/auth/middleware-helpers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { ulid } from 'ulid'
import { createGovernanceAction } from '@/lib/db/queries'
import type { AgentGraph, Connection, Agent, ClarificationOption, AgentRole } from '@/lib/nl/types'
import { AVAILABLE_TOOLS } from '@/lib/nl/agent-registry'
import { capabilityRegistry } from '@/lib/capability-registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CanvasAgent {
  id: string
  name: string
  role: 'team-lead' | 'worker'
  archetype?: 'Ingest' | 'Process' | 'Distill'
  tools: string[]
  description?: string
  position_x: number
  position_y: number
}

interface CanvasConnection {
  id?: string
  source: string
  target: string
  label?: string
}

export interface NLToCanvasRequest {
  teamId: string
  goal: string
  existingNodes?: CanvasAgent[]
  existingEdges?: CanvasConnection[]
}

export interface NLToCanvasResponse {
  graph?: {
    agents: Agent[]
    connections: Connection[]
  }
  explanation: string
  confidence?: number
  ambiguousFields?: string[]
  needsClarification?: boolean
  question?: string
  options?: ClarificationOption[]
  error?: string
  governance_required?: boolean
  governanceActionId?: string
  new_tools?: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleToArchetype(role: string): 'Ingest' | 'Process' | 'Distill' | undefined {
  const ingestRoles = ['email_reader', 'ticket_reader', 'lead_researcher', 'lead_enricher']
  const processRoles = ['response_drafter', 'faq_responder', 'escalation_triage']
  if (ingestRoles.includes(role)) return 'Ingest'
  if (processRoles.includes(role)) return 'Process'
  if (role === 'llm') return 'Distill'
  return undefined
}

/**
 * Assigns default positions to new agents in a cascade layout.
 * Existing agents preserve their positions.
 */
function assignPositions(
  newAgents: Agent[],
  existingNodes: CanvasAgent[] = []
): CanvasAgent[] {
  const COL_OFFSET = 260
  const ROW_OFFSET = 180
  const START_X = 100
  const START_Y = 300
  const existingIds = new Set(existingNodes.map(n => n.id))

  return newAgents.map((agent, idx) => {
    const existing = existingNodes.find(n => n.id === agent.id)
    if (existing) {
      return {
        id: agent.id,
        name: agent.name,
        role: 'worker' as const,
        archetype: roleToArchetype(agent.role),
        tools: agent.tools,
        description: agent.description,
        position_x: existing.position_x,
        position_y: existing.position_y,
      }
    }
    return {
      id: agent.id,
      name: agent.name,
      role: 'worker' as const,
      archetype: roleToArchetype(agent.role),
      tools: agent.tools,
      description: agent.description,
      position_x: START_X + (idx % 3) * COL_OFFSET,
      position_y: START_Y + Math.floor(idx / 3) * ROW_OFFSET,
    }
  })
}

/**
 * Builds a plain English explanation from the agent graph.
 */
function buildExplanation(graph: { agents: { name: string }[] }): string {
  const agentNames = graph.agents.map(a => a.name)
  const lastAgent = agentNames[agentNames.length - 1] ?? 'the worker'

  if (graph.agents.length === 1) {
    return `I'll set up ${agentNames[0]} to handle this task.`
  }

  return `I'll set up a team: ${agentNames.join(', ')}. ${lastAgent} will be the final step.`
}

// ---------------------------------------------------------------------------
// GET — return current canvas state for context
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  await getUserId(req) // Auth only, userId not used in this handler

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }

  // TODO: Load from DB via queries.ts when teams table is wired up
  // For now, return empty canvas (client manages state via CanvasProvider)
  return NextResponse.json({ agents: [], connections: [] })
}

// ---------------------------------------------------------------------------
// POST — interpret goal and return preview
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: NLToCanvasRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.teamId || !body.goal?.trim()) {
    return NextResponse.json({ error: 'teamId and goal are required' }, { status: 400 })
  }

  if (body.goal.length > 500) {
    return NextResponse.json({ error: 'Goal must be 500 characters or fewer' }, { status: 400 })
  }

  // Build existing canvas context for the LLM
  const existingCanvas = (body.existingNodes ?? []).map(n => ({
    id: n.id,
    role: n.role === 'team-lead' ? 'team_lead' : 'worker',
    name: n.name,
    tools: n.tools ?? [],
    description: n.description ?? '',
  }))

  // ---------------------------------------------------------------------------
  // Interpretation — all LLM output validation happens in interpret()
  // ---------------------------------------------------------------------------
  const result = await interpret(body.goal, {
    timeoutMs: 8000,
    existingCanvas: existingCanvas.length > 0 ? { agents: existingCanvas, connections: [] } : undefined,
  })

  if (!result.ok) {
    if ('clarification' in result) {
      return NextResponse.json({
        needsClarification: true,
        question: result.question,
        options: result.options,
        explanation: "I'm not sure I understood correctly. Did you mean one of these?",
        confidence: 0,
      } satisfies NLToCanvasResponse)
    }
    return NextResponse.json(
      { error: result.message, explanation: '', confidence: 0 } satisfies NLToCanvasResponse,
      { status: 422 }
    )
  }

  // ---------------------------------------------------------------------------
  // Governance check: if new agents use tools not in AVAILABLE_TOOLS or tools
  // with permissionLevel 'admin_only', create a governance action and return
  // governance_required instead of proceeding.
  // ---------------------------------------------------------------------------
  const existingTools = new Set(existingCanvas.flatMap(a => a.tools))
  const allTools = result.graph.agents.flatMap(a => a.tools)

  // Tools that are new (not in existing canvas and not in AVAILABLE_TOOLS)
  const unknownTools = allTools.filter(t => !existingTools.has(t) && !AVAILABLE_TOOLS.includes(t as any))

  // Tools with admin_only permission that are new to this user
  const adminTools = allTools.filter(t => {
    if (existingTools.has(t)) return false
    const toolDef = capabilityRegistry.getToolDef(t)
    return toolDef?.permissionLevel === 'admin_only'
  })

  const toolsRequiringGovernance = [...new Set([...unknownTools, ...adminTools])]
  if (toolsRequiringGovernance.length > 0) {
    const governancePayload = JSON.stringify({
      goal: body.goal,
      agents: result.graph.agents,
      new_tools: toolsRequiringGovernance,
      canvas_id: body.teamId,
    })
    const governanceAction = await createGovernanceAction({
      id: ulid(),
      user_id: session.userId,
      canvas_id: body.teamId,
      action_type: 'new_agent',
      payload_json: governancePayload,
    })
    return NextResponse.json({
      governance_required: true,
      governanceActionId: governanceAction.id,
      explanation: 'A new agent needs your approval before it can be activated. It has been added to your Governance Board.',
      new_tools: toolsRequiringGovernance,
    } satisfies NLToCanvasResponse)
  }

  // Assign positions to the new agents
  const positionedAgents = assignPositions(result.graph.agents, body.existingNodes)

  // Build the response graph
  const graph = {
    agents: positionedAgents.map(a => ({
      id: a.id,
      role: (a.role === 'team-lead' ? 'team_lead' : 'worker') as AgentRole,
      name: a.name,
      tools: a.tools,
      description: a.description ?? '',
    })),
    connections: result.graph.connections,
  }

  const explanation = buildExplanation(graph)

  return NextResponse.json({
    graph,
    explanation,
    confidence: 1,
  } satisfies NLToCanvasResponse)
}
