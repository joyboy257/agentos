import OpenAI from 'openai'
import { AgentGraph, InterpretResult } from './types'
import { AVAILABLE_TOOLS } from './agent-registry'
import { buildUserPrompt, SYSTEM_PROMPT } from './prompts'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _client
}

export interface ExistingCanvas {
  agents: Array<{ id: string; role: string; name: string; tools: string[]; description?: string }>
  connections: Array<{ from: string; to: string }>
}

interface InterpretOptions {
  timeoutMs?: number
  existingCanvas?: ExistingCanvas
}

export async function interpret(
  goal: string,
  options: InterpretOptions = {}
): Promise<InterpretResult> {
  const { timeoutMs = 5000, existingCanvas } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const userPrompt = buildUserPrompt(goal, existingCanvas)
    const response = await getClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
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
                    description: { type: 'string' }
                  },
                  required: ['id', 'role', 'tools', 'name', 'description']
                }
              },
              connections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' }
                  },
                  required: ['from', 'to']
                }
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
                        goal: { type: 'string' }
                      },
                      required: ['label', 'goal']
                    }
                  }
                },
                required: ['question', 'options']
              }
            },
            allOf: [
              { required: ['agents', 'connections'] },
              { not: { required: ['clarification'] } }
            ],
            additionalProperties: false
          }
        }
      },
      max_tokens: 1024,
      temperature: 0.1,
    }, { signal: controller.signal })

    clearTimeout(timeout)

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('No response from GPT-4o')

    let parsed: any
    let parseSuccess = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        parsed = JSON.parse(raw)
        parseSuccess = true
        break
      } catch (err) {
        if (attempt < 2) {
          console.warn(`JSON parse attempt ${attempt + 1} failed, retrying...`)
          continue
        }
        return { ok: false, error: true, message: "I couldn't understand that. Try rephrasing." }
      }
    }
    // If GPT returns clarification
    if ('clarification' in parsed && parsed.clarification) {
      return {
        ok: false,
        clarification: true,
        question: parsed.question,
        options: parsed.options
      }
    }

    // Validate DAG
    const graph = parsed as AgentGraph
    const validation = validateDAG(graph)
    if (!validation.valid) {
      return { ok: false, error: true, message: validation.message! }
    }

    // Cap agents at 5
    if (graph.agents.length > 5) {
      graph.agents = graph.agents.slice(0, 5)
    }

    // Validate tools
    for (const agent of graph.agents) {
      for (const tool of agent.tools) {
        if (!AVAILABLE_TOOLS.includes(tool as any)) {
          return {
            ok: false,
            error: true,
            message: `Agent ${agent.name} uses tool ${tool} which is not available in Phase 1.`
          }
        }
      }
    }

    return { ok: true, graph }

  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError' || err.message?.includes('timeout')) {
      return { ok: false, error: true, message: "Taking longer than expected. Try rephrasing your goal." }
    }
    if (err.message?.includes('JSON')) {
      return { ok: false, error: true, message: "I couldn't understand that. Try rephrasing." }
    }
    console.error('interpret error:', err)
    return { ok: false, error: true, message: "Something went wrong. Please try again." }
  }
}

function validateDAG(graph: AgentGraph): { valid: boolean; message?: string } {
  // Check no cycles using DFS
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
    for (const neighbor of adj.get(id) || []) {
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

  // Check all connections reference valid agents
  const agentIds = new Set(graph.agents.map(a => a.id))
  for (const conn of graph.connections) {
    if (!agentIds.has(conn.from)) {
      return { valid: false, message: `Invalid connection: agent ${conn.from} not found.` }
    }
    if (!agentIds.has(conn.to)) {
      return { valid: false, message: `Invalid connection: agent ${conn.to} not found.` }
    }
  }

  // Check at least one root (agent with no incoming connections)
  const hasRoot = graph.agents.some(agent =>
    !graph.connections.some(conn => conn.to === agent.id)
  )
  if (!hasRoot && graph.agents.length > 0) {
    return { valid: false, message: "Could not determine the starting point. Please try a different goal." }
  }

  return { valid: true }
}
