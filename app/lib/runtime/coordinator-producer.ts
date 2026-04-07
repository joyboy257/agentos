/**
 * Coordinator Producer — BullMQ FlowProducer for parent-child job orchestration.
 *
 * Replaces the in-process fan-out loop in `DurableRunner.execute()` with
 * distributed BullMQ parent + child jobs via FlowProducer + moveToWaitingChildren.
 *
 * Parent job (agent-run):
 *   step=Initial  → enqueues children via FlowProducer, moveToWaitingChildren
 *   step=ChildrenEnqueued → waits for children to complete, aggregates results
 *   step=Finish → updates run status, fires post-run reflection
 *
 * Resume path: worker re-acquires parent lock, moves to WaitingChildren state.
 * Existing checkpoint query pattern in `DurableRunner.resume()` is preserved.
 */

import { FlowProducer } from 'bullmq'
import { getRedisConnection } from '../scheduler/client'
import { COORDINATOR_QUEUE, WORKER_QUEUE } from '../scheduler/queues'
import type { ChildJobPayload, ChildJobResult } from './child-job-handler'

// Re-export queue constants so tests can import from coordinator-producer
export { COORDINATOR_QUEUE, WORKER_QUEUE }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parent job data shape kept in BullMQ job data. */
export interface CoordinatorJobData {
  runId: string
  agentId: string          // root agent (coordinator)
  userId: string
  sessionId: string
  args: Record<string, unknown>
  /** step: 0=Initial, 1=ChildrenEnqueued, 2=Finish */
  step: number
  elapsedMs: number
  childrenData?: ChildSpec[]
}

export enum CoordinatorStep {
  Initial = 0,
  ChildrenEnqueued = 1,
  Finish = 2,
}

export interface ChildSpec {
  agentId: string
  sessionId: string
  args: Record<string, unknown>
  stepOffset: number
  elapsedMs: number
  userId: string
  orgId: string
}

// ---------------------------------------------------------------------------
// FlowProducer singleton
// ---------------------------------------------------------------------------

let flowProducer: FlowProducer | null = null

export function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    flowProducer = new FlowProducer({ connection: getRedisConnection() })
  }
  return flowProducer
}

export async function closeFlowProducer(): Promise<void> {
  if (flowProducer) {
    await flowProducer.close()
    flowProducer = null
  }
}

// ---------------------------------------------------------------------------
// Child enqueuing
// ---------------------------------------------------------------------------

/**
 * Build the FlowProducer children array for a single root agent.
 * In Phase 3, this will be extended to build a tree from canvas wires.
 */
export function buildChildSpecs(
  rootAgentId: string,
  runId: string,
  sessionId: string,
  args: Record<string, unknown>,
  userId: string,
  orgId: string
): ChildSpec[] {
  // For MVP: single child = the root agent execution
  return [
    {
      agentId: rootAgentId,
      sessionId,
      args,
      stepOffset: 0,
      elapsedMs: 0,
      userId,
      orgId,
    },
  ]
}

/**
 * Enqueue a coordinator parent job and its children via FlowProducer.
 * Returns the parent job id so the caller can track it.
 */
export async function enqueueCoordinatorJob(
  runId: string,
  agentId: string,
  userId: string,
  sessionId: string,
  args: Record<string, unknown>,
  orgId: string = ''
): Promise<string> {
  const flow = getFlowProducer()

  const children = buildChildSpecs(agentId, runId, sessionId, args, userId, orgId)

  const flowResult = await flow.add({
    name: 'agent-run',
    queueName: COORDINATOR_QUEUE,
    data: {
      runId,
      agentId,
      userId,
      sessionId,
      args,
      step: CoordinatorStep.Initial,
      elapsedMs: 0,
      childrenData: children,
    } satisfies CoordinatorJobData,
    children: children.map((child, i) => ({
      name: `agent-child-${i}`,
      queueName: WORKER_QUEUE,
      data: {
        agentId: child.agentId,
        runId,
        sessionId: child.sessionId,
        args: child.args,
        stepOffset: child.stepOffset,
        elapsedMs: child.elapsedMs,
        userId: child.userId,
        orgId: child.orgId,
      } satisfies ChildJobPayload,
    })),
  })

  // flow.add returns a JobNode (child chain) — extract the parent job id
  const parentJobId = typeof flowResult === 'string'
    ? flowResult
    : (flowResult as import('bullmq').JobNode).job?.id ?? 'unknown'

  return parentJobId
}

// ---------------------------------------------------------------------------
// Result aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate child job results and determine the parent's final exit reason.
 */
export function aggregateChildResults(results: ChildJobResult[]): {
  status: 'completed' | 'child_failed' | 'child_timed_out' | 'partial_completion' | 'budget_exceeded'
  failedChildIds: string[]
} {
  const failedChildIds: string[] = []
  let hasBudgetExceeded = false

  for (const result of results) {
    if (result.status === 'budget_exceeded') {
      hasBudgetExceeded = true
    }
    if (result.status === 'error') {
      failedChildIds.push(result.error ?? 'unknown')
    }
  }

  if (hasBudgetExceeded) {
    return { status: 'budget_exceeded', failedChildIds }
  }

  const errorCount = failedChildIds.length
  if (errorCount === results.length) {
    return { status: 'child_failed', failedChildIds }
  }
  if (errorCount > 0) {
    return { status: 'partial_completion', failedChildIds }
  }

  return { status: 'completed', failedChildIds: [] }
}
