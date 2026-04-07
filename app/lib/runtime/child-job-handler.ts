/**
 * Child job handler — executes a single agent as a BullMQ child job.
 *
 * This is `DurableRunner.executeAgent()` extracted so it can run inside a
 * BullMQ worker process rather than in-process. The parent job uses
 * FlowProducer to create children, and each child runs this handler.
 *
 * Child job data shape:
 *   { agentId, runId, sessionId, args, stepOffset, elapsedMs }
 *
 * Result shape:
 *   { status: 'completed'|'error'|'approval_required'|'budget_exceeded', output?: unknown, error?: string }
 */

import { Job } from 'bullmq'
import {
  getAgent,
  updateAgentStatus,
  createCheckpoint,
  updateRunStatus,
  getPendingApprovalsForRun,
} from '../db/queries'
import { getHookRegistry } from '../hooks/hook-registry'
import { streamingToolExecutor, type ReasoningEvent } from './streaming-tool-executor'
import { generateIdempotencyKey } from './idempotency'
import { postRunReflection } from './post-run-reflection'
import { getAgentContext } from '../memory/memory-client'
import { capabilityRegistry } from '../capability-registry'
import type { ToolContext } from '../capability-registry/types'

// ---------------------------------------------------------------------------
// Child job payload & result
// ---------------------------------------------------------------------------

export interface ChildJobPayload {
  agentId: string
  runId: string
  sessionId: string
  args: Record<string, unknown>
  stepOffset: number
  elapsedMs: number
  userId?: string
  orgId?: string
}

export interface ChildJobResult {
  status: 'completed' | 'error' | 'approval_required' | 'budget_exceeded'
  output?: unknown
  error?: string
  elapsedMs: number
  stopReason?: string
}

// ---------------------------------------------------------------------------
// Helper — emit reasoning events as hooks
// ---------------------------------------------------------------------------

function emitFromReasoningEvent(
  hooks: ReturnType<typeof getHookRegistry>,
  runId: string,
  agentId: string,
  event: ReasoningEvent
) {
  switch (event.type) {
    case 'status':
      break
    case 'action':
      void hooks.emit('postToolCall', {
        runId,
        agentId,
        timestamp: Date.now(),
        toolName: event.tool!,
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
    case 'budget_exceeded':
      void hooks.emit('budgetPaused', {
        runId,
        agentId,
        timestamp: Date.now(),
        budgetPaused: { elapsedMs: 0, budgetMs: 0 },
      })
      break
  }
}

// ---------------------------------------------------------------------------
// Child job processor
// ---------------------------------------------------------------------------

/**
 * Process a single child agent job.
 * Called by the BullMQ worker when a child job is picked up.
 */
export async function processChildJob(job: Job<ChildJobPayload, ChildJobResult>): Promise<ChildJobResult> {
  const { agentId, runId, sessionId, args, stepOffset, elapsedMs: initialElapsedMs } = job.data

  let step = stepOffset

  // Load the agent from the database
  const agent = await getAgent(agentId)
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`)
  }

  const agentConfig = agent.config as Record<string, unknown> ?? {}
  const savedMessages = (agentConfig.messages as Array<{ role: 'user' | 'assistant'; content: unknown }>) ?? []

  const agentTools = (agentConfig.tools as string[]) ??
    [...capabilityRegistry.getCapabilitiesByArchetype('ingest'), ...capabilityRegistry.getCapabilitiesByArchetype('process')].map(c => c.id)

  const userMessage = {
    role: 'user' as const,
    content: typeof args.prompt === 'string' ? args.prompt : JSON.stringify(args),
  }

  // Memory context injection
  let memorySystemPrompt: string | undefined
  const memoryUserId = args?.userId as string ?? agent.user_id
  const memoryGoal = typeof args.prompt === 'string' ? args.prompt : JSON.stringify(args)
  if (memoryUserId) {
    const memoryResult = await getAgentContext(memoryUserId, memoryGoal, 5).catch(err => {
      console.warn('[Memory] getAgentContext failed:', err)
      return null
    })
    if (memoryResult && memoryResult.facts.length > 0) {
      memorySystemPrompt = `Known facts about this user:\n${memoryResult.facts.map((f: string) => `- ${f}`).join('\n')}`
    }
  }

  const allMessages = [
    ...savedMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
    userMessage,
  ]

  // Initial checkpoint
  const startIdempotencyKey = generateIdempotencyKey()
  await createCheckpoint({
    run_id: runId,
    step,
    state_before: { agentId, messages: allMessages, elapsedMs: initialElapsedMs },
    tool_call_id: startIdempotencyKey,
    child_job_id: job.id ?? null,
  })

  const hooks = getHookRegistry()
  const onEvent = (event: ReasoningEvent) => {
    emitFromReasoningEvent(hooks, runId, agentId, event)
  }

  const context: ToolContext = {
    runId,
    agentId,
    userId: args?.userId as string ?? agent.user_id,
    orgId: args?.orgId as string ?? '',
    signal: undefined,
  }

  const onBudgetExceeded = async (elapsed: number, budgetMs: number) => {
    console.warn(`[ChildJob] Agent ${agentId} exceeded budget: ${elapsed}ms / ${budgetMs}ms`)
    await updateAgentStatus(agentId, 'paused_budget')
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
      systemPrompt: memorySystemPrompt,
      budgetMs: agent.budget_ms,
      elapsedMs: initialElapsedMs,
      onEvent,
      onBudgetExceeded,
      signal: context.signal,
    })

    const finalStopReason = result.stopReason
    const resultMessages = result.messages
    const finalElapsedMs = result.elapsedMs

    if (finalStopReason === 'approval_required') {
      await updateRunStatus(runId, 'waiting_for_approval')
      void hooks.emit('postAgentRun', {
        runId,
        agentId,
        timestamp: Date.now(),
        postAgentRun: { agentRole: agent.role, status: 'completed', output: null },
      })
      return { status: 'approval_required', elapsedMs: finalElapsedMs, stopReason: finalStopReason }
    }

    if (finalStopReason === 'budget_exceeded') {
      await createCheckpoint({
        run_id: runId,
        step,
        state_after: { agentId, messages: resultMessages, budgetExceeded: true, stopReason: 'budget_exceeded', elapsedMs: finalElapsedMs },
        tool_result: { budgetExceeded: true, elapsedMs: finalElapsedMs },
        tool_call_id: generateIdempotencyKey(),
        child_job_id: job.id ?? null,
      })
      return { status: 'budget_exceeded', elapsedMs: finalElapsedMs, stopReason: finalStopReason }
    }

    // Final checkpoint
    await createCheckpoint({
      run_id: runId,
      step,
      state_after: { agentId, messages: resultMessages, completed: true, stopReason: finalStopReason },
      tool_call_id: generateIdempotencyKey(),
      child_job_id: job.id ?? null,
    })

    void hooks.emit('postAgentRun', {
      runId,
      agentId,
      timestamp: Date.now(),
      postAgentRun: { agentRole: agent.role, status: 'completed', output: null },
    })

    return { status: 'completed', output: resultMessages, elapsedMs: finalElapsedMs, stopReason: finalStopReason }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await createCheckpoint({
      run_id: runId,
      step,
      state_after: { agentId, messages: [], failed: true, error: errorMessage },
      tool_result: { error: errorMessage },
      tool_call_id: generateIdempotencyKey(),
      child_job_id: job.id ?? null,
    })
    void hooks.emit('postAgentRun', {
      runId,
      agentId,
      timestamp: Date.now(),
      postAgentRun: { agentRole: agent.role, status: 'error', output: errorMessage },
    })
    return { status: 'error', error: errorMessage, elapsedMs: initialElapsedMs }
  }
}
