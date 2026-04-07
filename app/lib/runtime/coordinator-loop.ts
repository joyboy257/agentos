/**
 * Coordinator loop — fan-out execution for multi-agent teams.
 *
 * Executes agents in topological order driven by canvas wires.
 * Root agents (no incoming wires) run first. Downstream agents run
 * when all their upstream dependencies have completed and produced artifacts.
 *
 * Based on docs/plans/2026-04-07-009-feat-agentos-multi-agent-orchestration-plan.md
 */

import { listCanvasWiresForTeam, getTaskOutput, upsertTaskOutput } from '../db/queries'
import { isArtifact, formatArtifactForPrompt, type Artifact } from './artifacts'
import { getLaneEmitter } from './lane-events'
import { evaluateEscalation } from './team-escalation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasAgent {
  id: string
  name: string
  role: string
  tools: string[]
  config?: Record<string, unknown>
}

export interface AgentContext {
  agentId: string
  agentName: string
  systemPrompt: string
  tools: string[]
  config?: Record<string, unknown>
}

export interface Wire {
  source_id: string
  target_id: string
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

/**
 * Return agents that have no incoming wires (root nodes).
 */
export function findRootAgents(agents: CanvasAgent[], wires: Wire[]): CanvasAgent[] {
  const hasIncoming = new Set(wires.map(w => w.target_id))
  return agents.filter(a => !hasIncoming.has(a.id))
}

/**
 * Return agents that have no outgoing wires (leaf nodes).
 */
export function findLeafAgents(agents: CanvasAgent[], wires: Wire[]): CanvasAgent[] {
  const hasOutgoing = new Set(wires.map(w => w.source_id))
  return agents.filter(a => !hasOutgoing.has(a.id))
}

/**
 * Get all downstream agent IDs for a given source agent.
 */
export function getDownstreamAgents(sourceId: string, wires: Wire[]): string[] {
  return wires.filter(w => w.source_id === sourceId).map(w => w.target_id)
}

/**
 * Get all upstream agent IDs for a given target agent.
 */
export function getUpstreamAgents(targetId: string, wires: Wire[]): string[] {
  return wires.filter(w => w.target_id === targetId).map(w => w.source_id)
}

/**
 * Build agent context — injects upstream artifact into system prompt when present.
 */
export function buildAgentContext(agent: CanvasAgent, upstreamArtifact?: unknown): AgentContext {
  let systemPrompt = (agent.config?.systemPrompt as string) ?? `You are ${agent.name}.`

  if (upstreamArtifact && isArtifact(upstreamArtifact)) {
    systemPrompt += `\n\n## Input from previous step\n${formatArtifactForPrompt(upstreamArtifact)}`
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    systemPrompt,
    tools: agent.tools,
    config: agent.config,
  }
}

// ---------------------------------------------------------------------------
// Fan-out coordinator
// ---------------------------------------------------------------------------

export interface TaskRecord {
  taskId: string
  agentId: string
  status: 'created' | 'running' | 'blocked' | 'completed' | 'failed'
  outputArtifact?: unknown
  blockReason?: string
}

export interface CoordinatorOptions {
  teamId: string
  agents: CanvasAgent[]
  /** Defaults to reading from task_outputs table via getTaskOutput */
  getArtifact?: (taskId: string) => Promise<unknown | null>
  onAgentStart?: (agentId: string) => void
  onAgentComplete?: (agentId: string, artifact: unknown) => void
  onAgentBlocked?: (agentId: string, reason: string, artifact: unknown) => void
  onAgentError?: (agentId: string, error: Error) => void
  maxConcurrent?: number
}

/**
 * Fan-out loop: runs agents in topological order driven by wires.
 *
 * - Root agents (no incoming wires) are enqueued first
 * - Max `maxConcurrent` agents run concurrently (default 2)
 * - Downstream agents are enqueued when ALL upstream tasks are complete
 * - Artifacts from upstream tasks are passed to downstream agents
 */
export async function runCoordinator(options: CoordinatorOptions): Promise<void> {
  const {
    teamId,
    agents,
    getArtifact = getTaskOutput,
    onAgentStart,
    onAgentComplete,
    onAgentBlocked,
    onAgentError,
    maxConcurrent = 2,
  } = options

  const laneEmitter = getLaneEmitter(teamId)
  const allLaneEvents: import('./lane-events').LaneEvent[] = []

  // Load wires for this team
  const wires = await listCanvasWiresForTeam(teamId)

  // Task records — track completion and output
  const tasks = new Map<string, TaskRecord>()
  for (const agent of agents) {
    tasks.set(agent.id, { taskId: agent.id, agentId: agent.id, status: 'created' })
  }

  // Build adjacency: agent → its downstream agents
  const downstream = new Map<string, string[]>()
  for (const wire of wires) {
    downstream.get(wire.source_id)?.push(wire.target_id) ??
      downstream.set(wire.source_id, [wire.target_id])
  }

  // Build incoming count: how many upstream agents each agent depends on
  const upstreamCount = new Map<string, number>()
  for (const agent of agents) {
    upstreamCount.set(agent.id, getUpstreamAgents(agent.id, wires).length)
  }

  // Ready queue: agents with 0 incoming wires (roots)
  const queue: string[] = findRootAgents(agents, wires).map(a => a.id)
  const running = new Set<string>()

  // Helper: check if an agent's inputs are all satisfied
  const inputsSatisfied = (agentId: string): boolean => {
    const upstreams = getUpstreamAgents(agentId, wires)
    return upstreams.every(uid => tasks.get(uid)?.status === 'completed')
  }

  while (queue.length > 0 || running.size > 0) {
    // Fill running queue up to maxConcurrent
    while (queue.length > 0 && running.size < maxConcurrent) {
      const agentId = queue.shift()!

      // Re-check inputs (may have changed since enqueue)
      if (!inputsSatisfied(agentId)) {
        // Put back — inputs not yet satisfied
        queue.unshift(agentId)
        await new Promise(r => setTimeout(r, 10))
        break
      }

      const task = tasks.get(agentId)!
      task.status = 'running'
      running.add(agentId)

      // Fetch upstream artifact to pass to this agent
      const upstreams = getUpstreamAgents(agentId, wires)
      let upstreamArtifact: unknown = undefined
      if (upstreams.length === 1) {
        const upstreamTask = tasks.get(upstreams[0])
        upstreamArtifact = upstreamTask?.outputArtifact ?? undefined
      } else if (upstreams.length > 1) {
        // Multiple upstreams — pass an array of artifacts
        upstreamArtifact = upstreams
          .map(uid => tasks.get(uid)?.outputArtifact)
          .filter(Boolean)
      }

      onAgentStart?.(agentId)
      laneEmitter.started(agentId, agentId)

      // Execute agent (non-blocking)
      executeAgentWithArtifact(agentId, upstreamArtifact, getArtifact)
        .then(async ({ artifact }) => {
          const t = tasks.get(agentId)!
          t.status = 'completed'
          t.outputArtifact = artifact
          running.delete(agentId)

          // Emit lane.completed event
          laneEmitter.completed(agentId, agentId, artifact, 0, 0)

          // Persist artifact to DB so downstream agents can retrieve it
          await upsertTaskOutput(agentId, artifact).catch(err => {
            console.warn(`[Coordinator] Failed to persist artifact for task ${agentId}:`, err)
          })

          onAgentComplete?.(agentId, artifact)

          // Enqueue downstream agents whose inputs are now all satisfied
          for (const downstreamId of downstream.get(agentId) ?? []) {
            const remaining = (upstreamCount.get(downstreamId) ?? 1) - 1
            upstreamCount.set(downstreamId, remaining)
            if (remaining <= 0 && !queue.includes(downstreamId) && !running.has(downstreamId)) {
              queue.push(downstreamId)
              // Emit lane.waiting so the canvas shows "Needs input" on queued workers
              laneEmitter.waiting(downstreamId, downstreamId)
            }
          }
        })
        .catch((err: Error) => {
          const t = tasks.get(agentId)!
          t.status = 'failed'
          running.delete(agentId)

          // Emit lane.failed event
          laneEmitter.failed(agentId, agentId, err.message)

          // Build blocked event for Team Lead escalation evaluation
          const blockedEvent: import('./lane-events').LaneEvent = {
            type: 'lane.blocked',
            team_id: teamId,
            task_id: agentId,
            agent_id: agentId,
            status: 'blocked',
            timestamp: Date.now(),
            payload: { error: err.message, artifact: t.outputArtifact },
          }

          const recommendation = evaluateEscalation(
            blockedEvent,
            t.outputArtifact as import('./artifacts').Artifact | undefined,
            allLaneEvents
          )

          if (recommendation.shouldEscalate) {
            laneEmitter.blocked(agentId, agentId, recommendation.reason)
            onAgentBlocked?.(agentId, recommendation.reason, t.outputArtifact)
          }

          onAgentError?.(agentId, err)
        })
    }

    // Yield to event loop
    if (queue.length > 0 || running.size > 0) {
      await new Promise(r => setTimeout(r, 10))
    }
  }

  // All agents finished — team run is complete
  // (lane.completed events already emitted per-agent)
}

interface ExecuteResult {
  artifact: unknown
}

/**
 * Execute a single agent and return its output artifact.
 * Uses DurableRunner.executeSingleAgent to run the agent with the given upstream context.
 * Artifacts are stored in the DB via upsertTaskOutput and retrieved via getArtifact.
 */
async function executeAgentWithArtifact(
  agentId: string,
  upstreamArtifact: unknown,
  _getArtifact: (taskId: string) => Promise<unknown | null>
): Promise<ExecuteResult> {
  const { DurableRunner } = await import('./durable-runner')
  const runner = new DurableRunner()

  // Build the prompt from upstream artifact — injected into the agent's context
  const artifactSection = upstreamArtifact
    ? `\n\n## Context from previous step\n${JSON.stringify(upstreamArtifact, null, 2)}`
    : undefined

  const prompt = artifactSection ?? 'Begin.'

  try {
    const artifact = await runner.executeSingleAgent({
      agentId,
      prompt,
      upstreamArtifact,
    })
    return { artifact: artifact ?? undefined }
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
}
