/**
 * DurableRunner — implements durable execution with checkpoint/resume.
 *
 * Key durable execution properties:
 * - Checkpoints are written before and after every tool call
 * - Runs survive server restarts via Postgres state
 * - Resume replays from the last incomplete checkpoint
 * - ULID-based idempotency keys prevent duplicate tool execution
 */

import type { Runner, RunResult, ExecuteOptions } from './runner-interface'
import { generateIdempotencyKey } from './idempotency'
import {
  createRun,
  getRun,
  getAgent,
  updateRunStatus,
  updateAgentStatus,
  createCheckpoint,
  getCheckpointsForRun,
  createApproval,
  getPendingApprovalsForRun,
} from '../db/queries'
import { getHookRegistry } from '../hooks/hook-registry'
import { WorkingMemory } from './working-memory'
import { capabilityRegistry } from '../capability-registry'
import { streamingToolExecutor, type ReasoningEvent } from './streaming-tool-executor'
import { postRunReflection } from './post-run-reflection'
import type { ToolContext } from '../capability-registry/types'

// ---------------------------------------------------------------------------
// Helper — maps ReasoningEvent to existing hook events
// ---------------------------------------------------------------------------

function emitFromReasoningEvent(
  hooks: ReturnType<typeof getHookRegistry>,
  runId: string,
  agentId: string,
  event: ReasoningEvent
) {
  switch (event.type) {
    case 'status':
      // Status updates are transient — no hook needed for thinking
      break
    case 'action':
      void hooks.emit('postToolCall', {
        runId,
        agentId,
        timestamp: Date.now(),
        toolName: event.tool,
        postToolCall: { toolName: event.tool!, result: event.result, durationMs: 0 },
      })
      break
    case 'approval_required':
      void hooks.emit('preApproval', {
        runId,
        agentId,
        timestamp: Date.now(),
        preApproval: { toolName: event.tool!, summary: `Approval required for ${event.tool}`, fields: [] },
      })
      break
    case 'error':
      void hooks.emit('runError', {
        runId,
        agentId,
        timestamp: Date.now(),
        runError: { error: event.error ?? 'unknown' },
      })
      break
    case 'done':
      // Agent done — handled via postAgentRun below
      break
    case 'budget_exceeded':
      void hooks.emit('budgetPaused', {
        runId,
        agentId,
        timestamp: Date.now(),
        budgetPaused: { elapsedMs: 0, budgetMs: 0 },
      })
      break
    // paused_budget is a DB/canvas status, not a reasoning event type — no hook needed
  }
}

export class DurableRunner implements Runner {
  private workingMemory: WorkingMemory | null = null

  async execute(options: ExecuteOptions): Promise<RunResult> {
    const { agentId, userId, sessionId, args = {} } = options

    // 1. Create runs row
    const run = await createRun({ agent_id: agentId, user_id: userId })

    // 2. Initialize completions map and queue
    const completions = new Map<string, unknown>()
    const queue: string[] = [agentId] // root agent first
    const running = new Set<string>()

    let step = 0

    // Initialize working memory for this session
    this.workingMemory = new WorkingMemory(sessionId)

    try {
      // 3. Concurrency loop — mirrors InProcessRunner lines 473-481
      while (queue.length > 0 || running.size > 0) {
        // 3a. Fill running queue up to max 2 concurrent
        while (queue.length > 0 && running.size < 2) {
          const agentIdToRun = queue.shift()!
          running.add(agentIdToRun)

          // Start execution of this agent (non-blocking for fan-out)
          this.executeAgent(agentIdToRun, run.id, sessionId, args, completions, running, queue, step).catch((err) => {
            console.error(`Agent ${agentIdToRun} failed:`, err)
            running.delete(agentIdToRun)
          })
        }

        // Small delay to avoid tight loop
        await new Promise((r) => setTimeout(r, 10))
      }

      // 4. Check for pending approvals — if any, return immediately
      const pending = await getPendingApprovalsForRun(run.id)
      if (pending.length > 0) {
        return { runId: run.id, status: 'waiting_for_approval' }
      }

      // 5. Completion
      await updateRunStatus(run.id, 'completed', new Date())

      // Record run summary to working memory
      if (this.workingMemory) {
        await this.workingMemory.setLastRunSummary(`Completed ${step} actions`)
      }

      // 6. Post-Run Reflection — fire-and-forget, never blocks
      void postRunReflection(run.id).catch(err => {
        console.warn(`[PostRunReflection] Run ${run.id} reflection failed:`, err)
      })

      return { runId: run.id, status: 'completed' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await updateRunStatus(run.id, 'failed')
      return { runId: run.id, status: 'failed', error: errorMessage }
    }
  }

  async resume(runId: string): Promise<RunResult> {
    const checkpoints = await getCheckpointsForRun(runId)
    const run = await getRun(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)

    // Sort by step
    checkpoints.sort((a, b) => a.step - b.step)

    // Build completions map from all completed checkpoints
    const completions = new Map<string, unknown>()
    for (const cp of checkpoints) {
      if (cp.tool_result) {
        completions.set(cp.tool_call_id!, cp.tool_result)
      }
    }

    // Find first checkpoint with no state_after — resume point
    const incompleteIndex = checkpoints.findIndex(cp => cp.state_after === null)

    if (incompleteIndex === -1) {
      // All checkpoints completed — run is done
      await updateRunStatus(runId, 'completed', new Date())
      return { runId, status: 'completed' }
    }

    const resumeFrom = checkpoints[incompleteIndex]

    // Check for pending approvals first
    const pending = await getPendingApprovalsForRun(runId)
    if (pending.length > 0) {
      return { runId, status: 'waiting_for_approval', finalState: { pendingApprovals: pending } }
    }

    // Reconstruct state from checkpoint
    const { agentId, messages } = resumeFrom.state_before as { agentId: string; messages: unknown[] }

    // Load agent
    const agent = await getAgent(agentId)
    if (!agent) throw new Error(`Agent not found: ${agentId}`)

    // Re-run from checkpoint state
    // This calls execute() again but starting from the messages at this checkpoint
    const result = await this.execute({
      agentId,
      userId: run.user_id,
      sessionId: run.session_id ?? 'resume',
      args: { resumeFromCheckpoint: true, initialMessages: messages },
    })

    return result
  }

  private async executeAgent(
    agentId: string,
    runId: string,
    sessionId: string,
    args: Record<string, unknown>,
    completions: Map<string, unknown>,
    running: Set<string>,
    queue: string[],
    stepOffset: number
  ): Promise<void> {
    let step = stepOffset

    // Load the agent from the database
    const agent = await getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    // Build the LLM message history from agent config
    // Agent config holds the conversation history for multi-turn durability
    const agentConfig = agent.config as Record<string, unknown> ?? {}
    const savedMessages = (agentConfig.messages as Array<{ role: 'user' | 'assistant'; content: unknown }>) ?? []

    // Determine which tools/capabilities this agent can use
    // Falls back to all registered capabilities if none specified
    const agentTools = (agentConfig.tools as string[]) ??
      [...capabilityRegistry.getCapabilitiesByArchetype('ingest'), ...capabilityRegistry.getCapabilitiesByArchetype('process')].map(c => c.id)

    // Build the user context message
    const userMessage = {
      role: 'user' as const,
      content: typeof args.prompt === 'string' ? args.prompt : JSON.stringify(args),
    }

    // Convert saved messages to the format expected by streamingToolExecutor
    const allMessages = [
      ...savedMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      userMessage,
    ]

    // Create a checkpoint for the agent start — captures full LLM message history at this step
    const startIdempotencyKey = generateIdempotencyKey()
    await createCheckpoint({
      run_id: runId,
      step,
      state_before: { agentId, messages: allMessages },
      tool_call_id: startIdempotencyKey,
    })

    // Set up event handler for reasoning traces
    const hooks = getHookRegistry()
    const onEvent = (event: ReasoningEvent) => {
      emitFromReasoningEvent(hooks, runId, agentId, event)
    }

    // Call the streaming tool executor
    const context: ToolContext = {
      runId,
      agentId,
      userId: args?.userId as string ?? agent.user_id,
      orgId: args?.orgId as string ?? '',
      signal: undefined,
    }

    let finalStopReason = ''
    let agentStatus: 'completed' | 'error' = 'completed'
    let resultMessages: unknown[] = []
    let elapsedMs = 0

    // Budget enforcement callback — called when budget is exhausted
    const onBudgetExceeded = async (elapsed: number, budgetMs: number) => {
      console.warn(`[Budget] Agent ${agentId} exceeded budget: ${elapsed}ms / ${budgetMs}ms`)
      // Pause agent in DB
      await updateAgentStatus(agentId, 'paused_budget')
      // Emit hook event for canvas UI
      void hooks.emit('budgetPaused', {
        runId,
        agentId,
        timestamp: Date.now(),
        budgetPaused: { elapsedMs: elapsed, budgetMs },
      })
    }

    try {
      const result = await streamingToolExecutor({
        runId,
        agentId,
        userId: context.userId,
        orgId: context.orgId,
        messages: allMessages,
        tools: agentTools,
        maxTokens: 4096,
        budgetMs: agent.budget_ms,
        elapsedMs,
        onEvent,
        onBudgetExceeded,
        signal: context.signal,
      })

      finalStopReason = result.stopReason
      resultMessages = result.messages
      elapsedMs = result.elapsedMs

      // Handle approval_required — create pending approval and return
      if (finalStopReason === 'approval_required') {
        await updateRunStatus(runId, 'waiting_for_approval')
        running.delete(agentId)
        return
      }

      // Handle budget exceeded — agent is already paused via onBudgetExceeded callback
      if (finalStopReason === 'budget_exceeded') {
        running.delete(agentId)
        return
      }
    } catch (error) {
      // Tool execution failed
      agentStatus = 'error'
      const errorMessage = error instanceof Error ? error.message : String(error)
      await createCheckpoint({
        run_id: runId,
        step,
        state_after: { agentId, messages: resultMessages, failed: true, error: errorMessage },
        tool_result: { error: errorMessage },
        tool_call_id: generateIdempotencyKey(),
      })
      void hooks.emit('postAgentRun', {
        runId,
        agentId,
        timestamp: Date.now(),
        postAgentRun: { agentRole: agent.role, status: 'error', output: errorMessage },
      })
      running.delete(agentId)
      throw error
    }

    // Final checkpoint for agent completion — captures full LLM message history after execution
    await createCheckpoint({
      run_id: runId,
      step,
      state_after: { agentId, messages: resultMessages, completed: true, stopReason: finalStopReason },
      tool_call_id: generateIdempotencyKey(),
    })

    void hooks.emit('postAgentRun', {
      runId,
      agentId,
      timestamp: Date.now(),
      postAgentRun: { agentRole: agent.role, status: agentStatus, output: null },
    })

    completions.set(agentId, { stopReason: finalStopReason })
    running.delete(agentId)
  }

  /**
   * Enqueue an immediate proactive job for this agent.
   * Used by the gmail_push webhook flow — wakes the agent outside of cron.
   *
   * Note: This is a thin wrapper that delegates to the proactive queue.
   * The actual job processing is handled by getProactiveWorker() in proactive-queue.ts.
   */
  static async enqueueImmediate(
    agentId: string,
    userId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const { enqueueGmailPush } = await import('./proactive-queue')
    await enqueueGmailPush({
      agentId,
      userId,
      threadId: (payload.threadId as string) ?? '',
      messageId: (payload.messageId as string) ?? '',
      from: (payload.from as string) ?? '',
      subject: (payload.subject as string) ?? '',
      snippet: payload.snippet as string | undefined,
    })
  }
}
