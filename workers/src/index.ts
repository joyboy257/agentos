/**
 * AgentOS NL Interpretation Worker
 *
 * Stateless Cloudflare Worker that interprets Maria's natural language goal
 * and returns a canvas graph (agents + connections).
 *
 * Routes through Cloudflare AI Gateway for prompt caching and cost reduction.
 */

import { Ai } from '@cloudflare/workers-types'
import { ZodError, z } from "zod"
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt'

// ---------------------------------------------------------------------------
// Environment bindings
// ---------------------------------------------------------------------------

interface Env {
  AI_GATEWAY_API_KEY: string
  OPENAI_API_KEY: string
  AI: Ai
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

const CanvasAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['team-lead', 'worker']),
  archetype: z.enum(['Ingest', 'Process', 'Distill']).optional(),
  tools: z.array(z.string()),
  description: z.string().optional(),
  position_x: z.number(),
  position_y: z.number(),
})

const CanvasConnectionSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
})

const InterpretRequestSchema = z.object({
  teamId: z.string(),
  goal: z.string().min(1).max(500),
  existingNodes: z.array(CanvasAgentSchema).optional(),
  existingEdges: z.array(CanvasConnectionSchema).optional(),
})

type InterpretRequest = z.infer<typeof InterpretRequestSchema>

// AI Gateway response schema (matches OpenAI chat completions shape)
const InterpretationResponseSchema = z.object({
  agents: z.array(z.object({
    id: z.string(),
    role: z.string(),
    tools: z.array(z.string()),
    name: z.string(),
    description: z.string(),
  })),
  connections: z.array(z.object({
    from: z.string(),
    to: z.string(),
  })),
  clarification: z.object({
    question: z.string(),
    options: z.array(z.object({
      label: z.string(),
      goal: z.string(),
    })),
  }).optional(),
})

type InterpretationResponse = z.infer<typeof InterpretationResponseSchema>

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

function assignPositions(
  newAgents: Array<{ id: string; name: string; role: string; tools: string[]; description?: string }>,
  existingNodes: InterpretRequest['existingNodes'] = []
): Array<{ id: string; name: string; role: 'worker' | 'team-lead'; archetype?: 'Ingest' | 'Process' | 'Distill'; tools: string[]; description?: string; position_x: number; position_y: number }> {
  const COL_OFFSET = 260
  const ROW_OFFSET = 180
  const START_X = 100
  const START_Y = 300
  const existingIds = new Set(existingNodes?.map(n => n.id) ?? [])

  return newAgents.map((agent, idx) => {
    const existing = existingNodes?.find(n => n.id === agent.id)
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

function buildExplanation(graph: { agents: Array<{ name: string }> }): string {
  const agentNames = graph.agents.map(a => a.name)
  const lastAgent = agentNames[agentNames.length - 1] ?? 'the worker'
  if (graph.agents.length === 1) {
    return `I'll set up ${agentNames[0]} to handle this task.`
  }
  return `I'll set up a team: ${agentNames.join(', ')}. ${lastAgent} will be the final step.`
}

function validateDAG(graph: InterpretationResponse): { valid: boolean; message?: string } {
  const adj = new Map<string, string[]>()
  for (const agent of graph.agents) adj.set(agent.id, [])
  for (const conn of graph.connections) {
    adj.get(conn.from)?.push(conn.to)
  }

  const visited = new Set<string>()
  const recStack = new Set<string>()

  function hasCycle(id: string): boolean {
    visited.add(id)
    recStack.add(id)
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true
      } else if (recStack.has(neighbor)) {
        return true
      }
    }
    recStack.delete(id)
    return false
  }

  for (const agent of graph.agents) {
    if (!visited.has(agent.id) && hasCycle(agent.id)) {
      return { valid: false, message: "The agent workflow has a cycle. Please try a different goal." }
    }
  }

  const agentIds = new Set(graph.agents.map(a => a.id))
  for (const conn of graph.connections) {
    if (!agentIds.has(conn.from)) {
      return { valid: false, message: `Invalid connection: agent ${conn.from} not found.` }
    }
    if (!agentIds.has(conn.to)) {
      return { valid: false, message: `Invalid connection: agent ${conn.to} not found.` }
    }
  }

  const hasRoot = graph.agents.some(agent =>
    !graph.connections.some(conn => conn.to === agent.id)
  )
  if (!hasRoot && graph.agents.length > 0) {
    return { valid: false, message: "Could not determine the starting point. Please try a different goal." }
  }

  return { valid: true }
}

// ---------------------------------------------------------------------------
// Main Worker handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed. Use POST.' },
        { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Parse + validate request body
    let body: InterpretRequest
    try {
      const json = await request.json()
      body = InterpretRequestSchema.parse(json)
    } catch (err) {
      if (err instanceof ZodError) {
        return Response.json(
          { error: 'Invalid request body', details: err.errors },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
      return Response.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Build existing canvas context
    const existingCanvas = (body.existingNodes ?? []).map(n => ({
      id: n.id,
      role: n.role === 'team-lead' ? 'team_lead' : 'worker',
      name: n.name,
      tools: n.tools ?? [],
      description: n.description ?? '',
    }))

    const userPrompt = buildUserPrompt(body.goal, existingCanvas.length > 0 ? { agents: existingCanvas, connections: [] } : undefined)

    // Call LLM via AI Gateway (OpenAI-compatible endpoint)
    // AI Gateway URL: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/openai
    // For now, call direct OpenAI with AI_GATEWAY_API_KEY as bearer token
    const gatewayUrl = env.AI_GATEWAY_API_KEY
      ? `https://gateway.ai.cloudflare.com/v1/gateway/openai`
      : null

    let llmResponse: Response
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      }

      // If using AI Gateway, add gateway-specific headers
      if (gatewayUrl) {
        headers['CF-Auth-Email'] = '' // Set via wrangler secret or env
        headers['CF-Auth-Key'] = env.AI_GATEWAY_API_KEY
      }

      const apiEndpoint = gatewayUrl
        ? `${gatewayUrl}/chat/completions`
        : 'https://api.openai.com/v1/chat/completions'

      llmResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'AgentGraph',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  agents: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        role: { type: 'string' },
                        tools: { type: 'array', items: { type: 'string' } },
                        name: { type: 'string' },
                        description: { type: 'string' },
                      },
                      required: ['id', 'role', 'tools', 'name', 'description'],
                    },
                  },
                  connections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        from: { type: 'string' },
                        to: { type: 'string' },
                      },
                      required: ['from', 'to'],
                    },
                  },
                  clarification: {
                    type: 'object',
                    properties: {
                      question: { type: 'string' },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            label: { type: 'string' },
                            goal: { type: 'string' },
                          },
                          required: ['label', 'goal'],
                        },
                      },
                    },
                    required: ['question', 'options'],
                  },
                },
                allOf: [
                  { required: ['agents', 'connections'] },
                  { not: { required: ['clarification'] } },
                ],
                additionalProperties: false,
              },
            },
          },
          max_tokens: 1024,
          temperature: 0.1,
        }),
      })
    } catch (err) {
      console.error('LLM fetch error:', err)
      return Response.json(
        { error: 'Failed to reach interpretation service. Please try again.' },
        { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text()
      console.error('LLM API error:', llmResponse.status, errorText)
      return Response.json(
        { error: 'Interpretation service error. Please try again.' },
        { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const llmJson = await llmResponse.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = llmJson.choices?.[0]?.message?.content
    if (!raw) {
      return Response.json(
        { error: 'Empty response from interpretation service.' },
        { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Parse LLM response
    let parsed: InterpretationResponse
    try {
      parsed = InterpretationResponseSchema.parse(JSON.parse(raw))
    } catch (err) {
      console.error('Failed to parse LLM response:', raw)
      return Response.json(
        { error: "I couldn't understand that. Try rephrasing." },
        { status: 422, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Handle clarification request
    if (parsed.clarification) {
      return Response.json({
        needsClarification: true,
        question: parsed.clarification.question,
        options: parsed.clarification.options,
        explanation: "I'm not sure I understood correctly. Did you mean one of these?",
        confidence: 0,
      }, { headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    // Validate DAG
    const dagValidation = validateDAG(parsed)
    if (!dagValidation.valid) {
      return Response.json(
        { error: dagValidation.message, explanation: '', confidence: 0 },
        { status: 422, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Cap agents at 5
    if (parsed.agents.length > 5) {
      parsed.agents = parsed.agents.slice(0, 5)
    }

    // Assign positions
    const positionedAgents = assignPositions(parsed.agents, body.existingNodes)

    const graph = {
      agents: positionedAgents.map(a => ({
        id: a.id,
        role: a.role,
        name: a.name,
        tools: a.tools,
        description: a.description ?? '',
      })),
      connections: parsed.connections,
    }

    const explanation = buildExplanation(graph)

    return Response.json({
      graph,
      explanation,
      confidence: 1,
    }, { headers: { 'Access-Control-Allow-Origin': '*' } })
  },
}
