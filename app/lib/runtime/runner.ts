import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent, AgentOutput } from '@/lib/nl/types'
import { gmailReadTool, gmailSendTool } from './tools/gmail'
import { llmTool } from './tools/llm'
import { webSearchTool } from './tools/web'

export type ExecutionCallbacks = {
  onStatus: (event: AgentStatusEvent) => void
  onDone: (event: RunDoneEvent) => void
  onError: (event: RunErrorEvent) => void
}

export type RunOptions = {
  runId: string
  graph: AgentGraph
  signal?: AbortSignal
}

export interface Runner {
  execute(callbacks: ExecutionCallbacks, options: RunOptions): Promise<void>
}

export class InProcessRunner implements Runner {
  async execute(
    callbacks: ExecutionCallbacks,
    options: RunOptions
  ): Promise<void> {
    const { runId, graph, signal } = options
    const startTime = Date.now()

    // Build adjacency list
    const adj = new Map<string, string[]>()
    const inDegree = new Map<string, number>()
    for (const agent of graph.agents) {
      adj.set(agent.id, [])
      inDegree.set(agent.id, 0)
    }
    for (const conn of graph.connections) {
      adj.get(conn.from)?.push(conn.to)
      inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1)
    }

    // Find roots (agents with no incoming)
    const roots = graph.agents.filter(a => (inDegree.get(a.id) || 0) === 0)

    // Track completions for fan-in
    const completions = new Map<string, AgentOutput[]>()
    let completed = 0
    let errored = 0

    // Helper: check if agent can run (all upstream done)
    const canRun = (agentId: string): boolean => {
      for (const conn of graph.connections) {
        if (conn.to === agentId) {
          const upstream = completions.get(conn.from)
          if (!upstream || upstream.length === 0) return false
        }
      }
      return true
    }

    // Emit ready status for all agents
    for (const agent of graph.agents) {
      callbacks.onStatus({
        event: 'status',
        runId,
        agentId: agent.id,
        status: 'ready',
        timestamp: Date.now()
      })
    }

    // Execute agents with max 2 concurrent
    const running = new Set<string>()
    const queue = [...roots.map(a => a.id)]
    const agentMap = new Map(graph.agents.map(a => [a.id, a]))

    const executeAgent = async (agentId: string): Promise<void> => {
      if (signal?.aborted) return

      const agent = agentMap.get(agentId)!

      callbacks.onStatus({
        event: 'status',
        runId,
        agentId,
        status: 'running',
        timestamp: Date.now()
      })

      try {
        const tools = agent.tools
        let output: AgentOutput

        if (signal?.aborted) {
          callbacks.onError({
            event: 'error',
            runId,
            message: 'Run was cancelled',
            agentId,
            timestamp: Date.now()
          })
          return
        }

        if (tools.includes('gmail.read')) {
          const result = await gmailReadTool('is:unread newer_than:1d', 'demo')
          output = { agentId, role: agent.role, status: 'completed', data: result }
        } else if (tools.includes('gmail.send')) {
          // gmail.send needs the draft email from upstream fan-in data
          const upstreamOutputs = completions.get(agentId) || []
          const draftData = upstreamOutputs.find(o => o.data?.kind === 'draft_email')?.data
          if (draftData) {
            const result = await gmailSendTool(draftData.draft.to, draftData.draft.subject, draftData.draft.body, 'demo')
            output = { agentId, role: agent.role, status: 'completed', data: result }
          } else {
            output = { agentId, role: agent.role, status: 'error', data: null, error: 'No draft email found from upstream' }
          }
        } else if (tools.includes('web.search')) {
          const result = await webSearchTool('research leads', 10)
          output = { agentId, role: agent.role, status: 'completed', data: result }
        } else if (tools.includes('llm')) {
          // For LLM agents, generate a response based on role
          const systemPrompts: Record<string, string> = {
            response_drafter: 'You are an expert email response drafter. Given an email, write a professional reply.',
            faq_responder: 'You are a customer support FAQ responder. Answer common questions professionally.',
            escalation_triage: 'You are an escalation triage agent. Determine if a ticket needs human escalation.',
          }
          const upstreamOutputs = completions.get(agentId) || []
          const context = upstreamOutputs.map(o => JSON.stringify(o.data)).join('\n')
          const system = systemPrompts[agent.role] || 'You are a helpful AI assistant.'
          const result = await llmTool(`Context:\n${context}\n\nTask: ${agent.description}`, system)
          output = { agentId, role: agent.role, status: 'completed', data: { kind: 'llm', response: result.text, model: 'gpt-4o' } }
        } else {
          output = { agentId, role: agent.role, status: 'completed', data: {} }
        }

        completions.set(agentId, [output])
        completed++

        callbacks.onStatus({
          event: 'status',
          runId,
          agentId,
          status: 'completed',
          result: output,
          timestamp: Date.now()
        })

        // Queue downstream agents that are now ready
        for (const downstreamId of adj.get(agentId) || []) {
          if (canRun(downstreamId)) {
            queue.push(downstreamId)
          }
        }

      } catch (err: any) {
        errored++
        const output: AgentOutput = {
          agentId,
          role: agent.role,
          status: 'error',
          data: null,
          error: err.message
        }

        callbacks.onStatus({
          event: 'status',
          runId,
          agentId,
          status: 'error',
          result: output,
          timestamp: Date.now()
        })
      }
    }

    // Process queue with concurrency limit
    while (queue.length > 0 || running.size > 0) {
      while (queue.length > 0 && running.size < 2) {
        const agentId = queue.shift()!
        running.add(agentId)
        executeAgent(agentId).finally(() => running.delete(agentId))
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    callbacks.onDone({
      event: 'done',
      runId,
      summary: `Run completed: ${completed} agents succeeded, ${errored} failed.`,
      agentsCompleted: completed,
      agentsErrored: errored,
      durationMs: Date.now() - startTime,
      timestamp: Date.now()
    })
  }
}

