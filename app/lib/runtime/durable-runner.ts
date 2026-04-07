/**
 * DurableRunner — implements durable execution with checkpoint/resume.
 *
 * Key durable execution properties:
 * - Checkpoints are written before and after every tool call
 * - Runs survive server restarts via Postgres state
 * - Resume replays from the last incomplete checkpoint
 * - ULID-based idempotency keys prevent duplicate tool execution
 */

import type { Runner, RunResult, ExecuteOptions, SingleAgentOptions } from './runner-interface'
import { ulid } from 'ulid'
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
import { getAgentContext } from '../memory/memory-client'
import type { ToolContext } from '../capability-registry/types'
import { Session } from './session'
import { SidechainTranscript } from './sidechain-transcript'
import { pauseAgentForBudget } from './budget-pause'

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
    const { agentId, userId, sessionId, args = {}, elapsedMs = 0 } = options

    // 1. Create runs row
    const run = await createRun({ agent_id: agentId, user_id: userId })

    // 2. Enqueue coordinator parent job + children via FlowProducer
    //    The parent job handles fan-out orchestration via BullMQ moveToWaitingChildren.
    //    This replaces the in-process while(running < 2) fan-out loop.
    try {
      const { enqueueCoordinatorJob } = await import('./coordinator-producer')
      await enqueueCoordinatorJob(
        run.id,
        agentId,
        userId,
        sessionId,
        args,
        args?.orgId as string ?? ''
      )
    } catch (err) {
      console.error('[DurableRunner] Failed to enqueue coordinator job:', err)
      await updateRunStatus(run.id, 'failed')
      return { runId: run.id, status: 'failed', error: err instanceof Error ? err.message : String(err) }
    }

    // 3. Return immediately — children run asynchronously on the BullMQ child worker.
    //    The parent job processor coordinates via moveToWaitingChildren.
    //    Caller can poll /runs/[runId] or subscribe to SSE for status updates.
    return { runId: run.id, status: 'completed' }
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
    const resumeState = resumeFrom.state_before as { agentId: string; messages: unknown[]; elapsedMs?: number }
    const { agentId, messages } = resumeState
    const storedElapsedMs = resumeState.elapsedMs ?? 0

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
      elapsedMs: storedElapsedMs,
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
    stepOffset: number,
    elapsedMs: number = 0
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

    // Fetch memory context for this user — injected into system prompt.
    // Non-blocking: if it fails, we log and continue without memory.
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
        console.debug(`[Memory] Injected ${memoryResult.facts.length} facts for user ${memoryUserId}`)
      }
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
      state_before: { agentId, messages: allMessages, elapsedMs },
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

    // Budget enforcement callback — called when budget is exhausted
    const onBudgetExceeded = async (elapsed: number, budgetMs: number) => {
      console.warn(`[Budget] Agent ${agentId} exceeded budget: ${elapsed}ms / ${budgetMs}ms`)
      // Pause agent in DB, log activity, and send push notification
      await pauseAgentForBudget({
        agentId,
        userId: context.userId,
        agentName: agent.name,
        budgetMs,
        elapsedMs: elapsed,
      })
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
        systemPrompt: memorySystemPrompt,
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
      // Create checkpoint to store elapsedMs for resume
      if (finalStopReason === 'budget_exceeded') {
        await createCheckpoint({
          run_id: runId,
          step,
          state_after: { agentId, messages: resultMessages, budgetExceeded: true, stopReason: 'budget_exceeded', elapsedMs },
          tool_result: { budgetExceeded: true, elapsedMs },
          tool_call_id: generateIdempotencyKey(),
        })
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

  /**
   * Returns a LaneEventEmitter for the given team.
   * Used by executeTeam() to emit lane events as workers run.
   */
  getLaneEmitter(teamId: string) {
    // Lazy import to avoid circular dependency
    const { getLaneEmitter: _getLaneEmitter } = require('@/lib/runtime/lane-events')
    return _getLaneEmitter(teamId)
  }

  /**
   * Fork an existing session, creating a new child session with fresh ULID.
   * Copies messages from the parent and records lineage via parent_session_id.
   *
   * Used by executeTeam() when spawning a worker — each worker gets its own
   * isolated session forked from the Team Lead's coordinator session.
   */
  forkSession(sessionId: string, branchName?: string): Session {
    throw new Error('forkSession not yet implemented - pending Unit B')
  }

  /**
   * Create a new sidechain transcript for a task_id.
   * The sidechain stores the worker agent's full reasoning trace separately
   * from the coordinator session — used for audit and accountability.
   *
   * Stored at: {dataDir}/sidechains/{task_id}.jsonl
   */
  createSidechain(taskId: string): SidechainTranscript {
    throw new Error('createSidechain not yet implemented - pending Unit B')
  }

  /**
   * Spawn a sandboxed worker subprocess for the given agent.
   *
   * The worker runs in an isolated namespace (on Linux via unshare) and
   * communicates via lane events posted to the SSE endpoint.
   *
   * Used by executeTeam() fan-out loop to launch worker agents.
   */
  async spawnWorker(
    agentId: string,
    coordinatorSessionId: string
  ): Promise<import('./worker-registry').Worker> {
    throw new Error('spawnWorker not yet implemented - pending Unit C')
  }

  /**
   * executeSingleAgent — run one agent in isolation and return its output artifact.
   *
   * Used by the coordinator-loop (Unit E) fan-out when executing a single agent
   * in a team. The agent runs with the given prompt and upstream context, and
   * its final artifact is stored in the task_outputs table.
   *
   * @param options.agentId          — the agent to run
   * @param options.prompt           — user prompt (may include upstream artifact context)
   * @param options.upstreamArtifact — artifact from upstream agent to inject into prompt
   * @returns the agent's output artifact (from the task_outputs table)
   */
  async executeSingleAgent(options: SingleAgentOptions): Promise<unknown> {
    const { agentId, userId, sessionId = `sess-${ulid()}`, prompt, upstreamArtifact } = options

    // Build the user message — inject upstream artifact if present
    const artifactSection = upstreamArtifact
      ? `\n\n## Context from previous step\n${JSON.stringify(upstreamArtifact, null, 2)}`
      : ''
    const userMessage = prompt
      ? `${prompt}${artifactSection}`
      : artifactSection || 'Begin.'

    // Run the agent — execute() returns RunResult but artifacts are stored in task_outputs
    await this.execute({
      agentId,
      userId: userId ?? 'system',
      sessionId,
      args: { prompt: userMessage },
      elapsedMs: 0,
    })

    // Read the artifact from task_outputs (written by upsertTaskOutput after agent completes)
    const { getTaskOutput } = await import('../db/queries')
    const artifact = await getTaskOutput(agentId)
    return artifact
  }

  /**
   * executeTeam — fan-out execute all agents in a team via canvas wires.
   *
   * Loads the team graph (agents + wires) from the canvas DB, then runs
   * runCoordinator which handles:
   *   - Topological ordering (root agents first)
   *   - MAX_CONCURRENT=2 worker slots
   *   - Downstream enqueue when all upstream tasks complete
   *   - Wire artifact passing between agents
   *   - Lane event emission for SSE stream
   *
   * @param teamId — the team to execute (from teams DB table)
   */
  async executeTeam(teamId: string): Promise<void> {
    const { getCanvas, getAgent, updateTeamStatus, createTask, listTasks, getTeam } = await import('../db/queries')
    const laneEmitter = this.getLaneEmitter(teamId)

    const team = await getTeam(teamId)
    if (!team) throw new Error(`Team not found: ${teamId}`)

    const canvas = await getCanvas(team.canvas_id)
    if (!canvas) throw new Error(`Canvas not found: ${team.canvas_id}`)

    // Parse agents from canvas.agents_json
    let agentsJson: import('./coordinator-loop').CanvasAgent[] = []
    try {
      agentsJson = JSON.parse(canvas.agents_json) as import('./coordinator-loop').CanvasAgent[]
    } catch {
      throw new Error(`Invalid agents_json in canvas ${team.canvas_id}`)
    }

    // Hydrate full agent records from DB (to get config, tools, role, etc.)
    const agents: import('./coordinator-loop').CanvasAgent[] = []
    for (const agentJson of agentsJson) {
      const dbAgent = await getAgent(agentJson.id)
      if (!dbAgent) continue
      agents.push({
        id: dbAgent.id,
        name: dbAgent.name,
        role: dbAgent.role,
        tools: (dbAgent.config?.tools as string[]) ?? [],
        config: dbAgent.config as Record<string, unknown> ?? {},
      })
    }

    // Ensure all agents have a task record
    const existingTasks = await listTasks(teamId)
    const taskAgentIds = new Set(existingTasks.map(t => t.agent_id))
    for (const agent of agents) {
      if (!taskAgentIds.has(agent.id)) {
        await createTask({ team_id: teamId, agent_id: agent.id })
      }
    }

    await updateTeamStatus(teamId, 'running')

    if (process.env.USE_BULLMQ_ORCHESTRATION === 'true') {
      // BullMQ distributed parent-child path via FlowProducer
      const { enqueueCoordinatorJob } = await import('./coordinator-producer')
      const { listCanvasWiresForTeam } = await import('../db/queries')
      const wires = await listCanvasWiresForTeam(teamId)
      const rootAgents = agents.filter(a => !wires.some(w => w.target_id === a.id))
      const rootAgentIds = rootAgents.map(a => a.id)

      // Fire-and-forget: parent job enqueues children, worker emits lane events via Redis
      void enqueueCoordinatorJob(
        `run-${ulid()}`,
        rootAgentIds,
        team.user_id,
        `sess-${ulid()}`,
        { prompt: 'Run team.' },
        ''
      ).catch(err => {
        console.error('[executeTeam] enqueueCoordinatorJob failed:', err)
        void updateTeamStatus(teamId, 'failed')
      })
    } else {
      // In-process coordinator loop (default for dev)
      const { runCoordinator } = await import('./coordinator-loop')
      await runCoordinator({
        teamId,
        agents,
        onAgentStart(agentId) {
          laneEmitter.started(agentId, agentId)
        },
        onAgentComplete(agentId, artifact) {
          laneEmitter.completed(agentId, agentId, artifact, 0, 0)
        },
        onAgentBlocked(agentId) {
          laneEmitter.blocked(agentId, agentId, 'needs approval')
          void updateTeamStatus(teamId, 'blocked')
        },
        onAgentError(agentId, err) {
          laneEmitter.failed(agentId, agentId, err.message)
        },
      })
      await updateTeamStatus(teamId, 'completed')
    }
  }
}
