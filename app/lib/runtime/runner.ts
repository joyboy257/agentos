import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent, AgentOutput } from '@/lib/nl/types'
import { executeTool, resetAllRetryBudgets } from '@/lib/middleware'
import { gmailReadTool, gmailSendTool } from './tools/gmail'
import { llmTool } from './tools/llm'
import { webSearchTool } from './tools/web'
import { createTraceEmitter } from '@/lib/tracing/trace-emitter'
import { runSecretRegistry } from '@/lib/tracing/hmac-signing'
import { requestApproval } from '@/lib/approval/approval-manager'
import type { ResolvedApproval } from '@/lib/approval/approval-manager'

// ---------------------------------------------------------------------------
// Capability approval configuration (Unit 5)
// Defines which tools require human approval before execution.
// Replace with Capability Registry (Unit 2) once available.
// ---------------------------------------------------------------------------

const APPROVAL_REQUIRED_TOOLS = new Set<string>([
  'gmail.send',   // Sends emails — sensitive action
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
    case 'gmail.send': {
      const to = Array.isArray(args.to) ? args.to : [args.to]
      const count = to.length
      return `Send email to ${count} recipient${count !== 1 ? 's' : ''}: ${to.slice(0, 3).join(', ')}${count > 3 ? ` and ${count - 3} more` : ''}`
    }
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
}

export interface Runner {
  execute(callbacks: ExecutionCallbacks, options: RunOptions): Promise<void>
}

// Signal-aware tool wrappers
// Tools must accept optional AbortSignal for genuine in-flight cancellation

async function gmailReadWithSignal(args: { query: string; userId: string }, _signal?: AbortSignal) {
  // gmailReadTool currently doesn't accept signal — wrap it
  // When tools are updated to accept signal, this wrapper passes it through
  const result = await gmailReadTool(args.query, args.userId)
  // If the tool returned an error object, throw so executeTool can handle it
  if (result && typeof result === 'object' && 'error' in result && result.error === true) {
    const err = new Error((result as any).message || 'Gmail read failed') as any
    err.status = 500 // treat as server error for retry classification
    throw err
  }
  return result
}

async function gmailSendWithSignal(args: { to: string; subject: string; body: string; userId: string }, _signal?: AbortSignal) {
  const result = await gmailSendTool(args.to, args.subject, args.body, args.userId)
  if (result && typeof result === 'object' && 'error' in result && result.error === true) {
    const err = new Error((result as any).message || 'Gmail send failed') as any
    err.status = 500
    throw err
  }
  return result
}

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
    const { runId, graph, signal } = options
    const startTime = Date.now()

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
          trace.emitAction('Reading emails', { query: 'is:unread newer_than:1d' })
          const result = await executeTool(
            'gmail.read',
            { query: 'is:unread newer_than:1d', userId: 'demo' },
            (sig) => gmailReadWithSignal({ query: 'is:unread newer_than:1d', userId: 'demo' }, sig),
            { abortSignal: signal, retryBudgetDomain: 'gmail' }
          )
          if (result.failed) {
            output = { agentId, role: agent.role, status: 'error', data: null, error: result.llmMessage }
          } else {
            output = { agentId, role: agent.role, status: 'completed', data: result.data }
          }
          totalRetries += result.retriesAttempted
        } else if (tools.includes('gmail.send')) {
          // gmail.send needs the draft email from upstream fan-in data
          const upstreamOutputs = completions.get(agentId) || []
          const draftData = upstreamOutputs.find(o => o.data?.kind === 'draft_email')?.data
          if (draftData) {
            const toolName = 'gmail.send'
            const toolArgs = { to: draftData.draft.to, subject: draftData.draft.subject, body: draftData.draft.body, userId: 'demo' }

            // R5 Human-in-the-loop: check if this tool requires approval
            if (requiresApproval(toolName)) {
              trace.emitObservation(`Requesting approval to send email to ${draftData.draft.to}`)
              callbacks.onStatus({
                event: 'status',
                runId,
                agentId,
                status: 'waiting',
                timestamp: Date.now()
              })

              let approvalResult: ResolvedApproval
              try {
                approvalResult = await requestApproval({
                  runId,
                  agentId,
                  toolName,
                  args: toolArgs,
                  summary: buildToolSummary(toolName, toolArgs),
                  fields: buildApprovalFields(toolName, toolArgs),
                })
              } catch (err) {
                // Approval system error — treat as skip
                trace.emitWarning(`Approval error: ${(err as Error).message}. Skipping tool.`, 'high')
                output = { agentId, role: agent.role, status: 'error', data: null, error: `Approval error: ${(err as Error).message}` }
                completions.set(agentId, [output])
                callbacks.onStatus({ event: 'status', runId, agentId, status: 'error', result: output, timestamp: Date.now() })
                return
              }

              if (approvalResult.decision === 'cancelled' || approvalResult.decision === 'skipped' || approvalResult.decision === 'timeout') {
                trace.emitWarning(`Approval ${approvalResult.decision}. Tool skipped.`, 'medium')
                output = { agentId, role: agent.role, status: 'completed', data: { skipped: true, reason: approvalResult.decision, partialInputs: toolArgs } }
                completions.set(agentId, [output])
                callbacks.onStatus({ event: 'status', runId, agentId, status: 'completed', result: output, timestamp: Date.now() })
                return
              }

              // approved or edited — use (possibly revised) args
              if (approvalResult.revisedArgs) {
                Object.assign(draftData.draft, approvalResult.revisedArgs)
                trace.emitAction('Sending email (approved with edits)', { to: draftData.draft.to, subject: draftData.draft.subject })
              } else {
                trace.emitAction('Sending email (approved)', { to: draftData.draft.to, subject: draftData.draft.subject })
              }
            } else {
              trace.emitAction('Sending email', { to: draftData.draft.to, subject: draftData.draft.subject })
            }

            const result = await executeTool(
              'gmail.send',
              { to: draftData.draft.to, subject: draftData.draft.subject, body: draftData.draft.body, userId: 'demo' },
              (sig) => gmailSendWithSignal(draftData.draft, sig),
              { abortSignal: signal, retryBudgetDomain: 'gmail' }
            )
            if (result.failed) {
              trace.emitWarning(`Email send failed: ${result.llmMessage}`, 'high')
              output = { agentId, role: agent.role, status: 'error', data: null, error: result.llmMessage }
            } else {
              output = { agentId, role: agent.role, status: 'completed', data: result.data }
            }
            totalRetries += result.retriesAttempted
          } else {
            trace.emitWarning('No draft email found from upstream', 'medium')
            output = { agentId, role: agent.role, status: 'error', data: null, error: 'No draft email found from upstream' }
          }
        } else if (tools.includes('web.search')) {
          trace.emitAction('Searching the web', { query: 'research leads' })
          const result = await executeTool(
            'web.search',
            { query: 'research leads', limit: 10 },
            (sig) => webSearchWithSignal({ query: 'research leads', limit: 10 }, sig),
            { abortSignal: signal, retryBudgetDomain: 'web' }
          )
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
          const upstreamOutputs = completions.get(agentId) || []
          const context = upstreamOutputs.map(o => JSON.stringify(o.data)).join('\n')
          const system = systemPrompts[agent.role] || 'You are a helpful AI assistant.'

          const result = await executeTool(
            'llm',
            { prompt: `Context:\n${context}\n\nTask: ${agent.description}`, system },
            (sig) => llmWithSignal({ prompt: `Context:\n${context}\n\nTask: ${agent.description}`, system }, sig),
            { abortSignal: signal, retryBudgetDomain: 'llm', timeoutMs: 120_000 }
          )
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