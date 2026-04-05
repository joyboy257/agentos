import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent, AgentOutput } from '@/lib/nl/types'
import { executeTool, resetAllRetryBudgets } from '@/lib/middleware'
import { llmTool } from './tools/llm'
import { webSearchTool } from './tools/web'
import { createTraceEmitter } from '@/lib/tracing/trace-emitter'
import { runSecretRegistry } from '@/lib/tracing/hmac-signing'
import { requestApproval } from '@/lib/approval/approval-manager'
import type { ResolvedApproval } from '@/lib/approval/approval-manager'
import { getHookRegistry } from '@/lib/hooks'
import type { HookContext } from '@/lib/hooks/types'
import { getAgentContext } from '@/lib/memory/memory-client'

// ---------------------------------------------------------------------------
// Capability approval configuration (Unit 5)
// Defines which tools require human approval before execution.
// Replace with Capability Registry (Unit 2) once available.
// ---------------------------------------------------------------------------

const APPROVAL_REQUIRED_TOOLS = new Set<string>([
  'stripe.charge', // Payments
  'stripe.refund',
  'admin.panel',  // Admin operations
  'exec.code',    // Code execution
])

function requiresApproval(toolName: string): boolean {
  return APPROVAL_REQUIRED_TOOLS.has(toolName)
}

// ---------------------------------------------------------------------------
// Build plain-English summary for a tool call
// ---------------------------------------------------------------------------

function buildToolSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'stripe.charge': {
      return `Charge $${args.amount ?? 0} to customer`
    }
    case 'stripe.refund': {
      return `Issue refund of $${args.amount ?? 0}`
    }
    case 'admin.panel': {
      return 'Access admin panel'
    }
    case 'exec.code': {
      return 'Execute code'
    }
    default:
      return `Run ${toolName}`
  }
}

// ---------------------------------------------------------------------------
// Extract fields for the approval modal
// ---------------------------------------------------------------------------

function buildApprovalFields(toolName: string, args: Record<string, unknown>): Array<{ name: string; value: unknown; label?: string }> {
  const labels: Record<string, string> = {
    to: 'Recipients',
    subject: 'Subject',
    body: 'Body',
    amount: 'Amount (cents)',
    query: 'Search Query',
    limit: 'Result Limit',
  }
  return Object.entries(args).map(([name, value]) => ({ name, value, label: labels[name] ?? name }))
}

export type ExecutionCallbacks = {
  onStatus: (event: AgentStatusEvent) => void
  onDone: (event: RunDoneEvent) => void
  onError: (event: RunErrorEvent) => void
}

export type RunOptions = {
  runId: string
  graph: AgentGraph
  signal?: AbortSignal
  /** AgentOS user ID — used to retrieve memory context before the run */
  userId?: string
  /** Current goal/task description — used to search relevant memories */
  agentGoal?: string
}

export interface Runner {
  execute(callbacks: ExecutionCallbacks, options: RunOptions): Promise<void>
}

// Signal-aware tool wrappers
// Tools must accept optional AbortSignal for genuine in-flight cancellation

async function webSearchWithSignal(args: { query: string; limit: number }, signal?: AbortSignal) {
  return await webSearchTool(args.query, args.limit)
}

async function llmWithSignal(args: { prompt: string; system?: string }, signal?: AbortSignal) {
  return await llmTool(args.prompt, args.system)
}

export class InProcessRunner implements Runner {
  async execute(
    callbacks: ExecutionCallbacks,
    options: RunOptions
  ): Promise<void> {
    const { runId, graph, signal, userId, agentGoal } = options
    const startTime = Date.now()
    const hooks = getHookRegistry()

    // Reset retry budgets at start of each run
    resetAllRetryBudgets()

    // Initialize HMAC signing for this run
    const signingContext = runSecretRegistry.create(runId)
    void signingContext // used by TraceEmitter inside executeAgent

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
    let totalRetries = 0

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
      const trace = createTraceEmitter(runId, agentId)

      // Emit agent starting
      trace.emitObservation(`Starting agent: ${agent.name || agent.role}`)

      callbacks.onStatus({
        event: 'status',
        runId,
        agentId,
        status: 'running',
        timestamp: Date.now()
      })

      // preAgentRun hook — fire and forget, does not block agent execution
      const preAgentCtx: HookContext = {
        runId,
        agentId,
        timestamp: Date.now(),
        preAgentRun: {
          agentRole: agent.role,
          tools: agent.tools,
        },
      }
      void hooks.emit('preAgentRun', preAgentCtx)

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

        if (tools.includes('web.search')) {
          trace.emitAction('Searching the web', { query: 'research leads' })
          const result = await executeTool(
            'web.search',
            { query: 'research leads', limit: 10 },
            (sig) => webSearchWithSignal({ query: 'research leads', limit: 10 }, sig),
            { abortSignal: signal, retryBudgetDomain: 'web' }
          )
          void hooks.emit('postToolCall', {
            runId,
            agentId,
            toolName: 'web.search',
            timestamp: Date.now(),
            postToolCall: {
              toolName: 'web.search',
              result: result.data,
              durationMs: 0,
            },
          })
          if (result.failed) {
            trace.emitWarning(`Web search failed: ${result.llmMessage}`, 'medium')
            output = { agentId, role: agent.role, status: 'error', data: null, error: result.llmMessage }
          } else {
            output = { agentId, role: agent.role, status: 'completed', data: result.data }
          }
          totalRetries += result.retriesAttempted
        } else if (tools.includes('llm')) {
          trace.emitObservation(`Running LLM task: ${agent.description}`)
          // For LLM agents, generate a response based on role
          const systemPrompts: Record<string, string> = {
            response_drafter: 'You are an expert email response drafter. Given an email, write a professional reply.',
            faq_responder: 'You are a customer support FAQ responder. Answer common questions professionally.',
            escalation_triage: 'You are an escalation triage agent. Determine if a ticket needs human escalation.',
          }

          // Inject long-term memory context if userId and goal are available
          let memorySection = ''
          if (userId && agentGoal) {
            try {
              const ctx = await getAgentContext(userId, agentGoal, 5)
              if (ctx.facts.length > 0) {
                const factsList = ctx.facts.map(f => `- ${f}`).join('\n')
                memorySection = `\n\n## What Maria has told us\n${factsList}`
                trace.emitObservation(`Injected ${ctx.count} memory facts into context`)
              }
            } catch (err) {
              // Non-fatal: memory retrieval failures should not block the run
              trace.emitWarning(`Memory context injection failed: ${String(err)}`, 'low')
            }
          }

          const upstreamOutputs = completions.get(agentId) || []
          const context = upstreamOutputs.map(o => JSON.stringify(o.data)).join('\n')
          const baseSystem = systemPrompts[agent.role] || 'You are a helpful AI assistant.'
          const system = baseSystem + memorySection

          const result = await executeTool(
            'llm',
            { prompt: `Context:\n${context}\n\nTask: ${agent.description}`, system },
            (sig) => llmWithSignal({ prompt: `Context:\n${context}\n\nTask: ${agent.description}`, system }, sig),
            { abortSignal: signal, retryBudgetDomain: 'llm', timeoutMs: 120_000 }
          )
          void hooks.emit('postToolCall', {
            runId,
            agentId,
            toolName: 'llm',
            timestamp: Date.now(),
            postToolCall: {
              toolName: 'llm',
              result: result.data,
              durationMs: 0,
            },
          })
          if (result.failed) {
            trace.emitWarning(`LLM call failed: ${result.llmMessage}`, 'high')
            output = { agentId, role: agent.role, status: 'error', data: null, error: result.llmMessage }
          } else {
            output = { agentId, role: agent.role, status: 'completed', data: { kind: 'llm', response: (result.data as any)?.text, model: 'gpt-4o' } }
          }
          totalRetries += result.retriesAttempted
        } else {
          output = { agentId, role: agent.role, status: 'completed', data: {} }
        }

        completions.set(agentId, [output])
        if (output.status === 'completed') completed++
        else errored++

        // postAgentRun hook — fire and forget
        void hooks.emit('postAgentRun', {
          runId,
          agentId,
          timestamp: Date.now(),
          postAgentRun: {
            agentRole: agent.role,
            status: output.status,
            output: output.data,
          },
        })

        callbacks.onStatus({
          event: 'status',
          runId,
          agentId,
          status: output.status,
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
        trace.emitWarning(`Agent error: ${err.message}`, 'high')

        // runError hook
        void hooks.emit('runError', {
          runId,
          agentId,
          timestamp: Date.now(),
          runError: { error: err.message },
        })

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
      } finally {
        trace.close()
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

    // runComplete hook — fire and forget
    void hooks.emit('runComplete', {
      runId,
      timestamp: Date.now(),
      runComplete: {
        agentsCompleted: completed,
        agentsErrored: errored,
        durationMs: Date.now() - startTime,
      },
    })

    callbacks.onDone({
      event: 'done',
      runId,
      summary: `Run completed: ${completed} agents succeeded, ${errored} failed, ${totalRetries} total retries.`,
      agentsCompleted: completed,
      agentsErrored: errored,
      durationMs: Date.now() - startTime,
      timestamp: Date.now()
    })
  }
}