import { Worker, WaitingChildrenError } from 'bullmq'
import { getRedisConnection } from './client'
import { DurableRunner } from '../runtime/durable-runner'
import { recoverInterruptedRuns } from '../runtime/startup-recovery'
import { startProactiveWorker } from '../runtime/proactive-queue'
import { COORDINATOR_QUEUE, WORKER_QUEUE } from './queues'
import { processChildJob, type ChildJobPayload, type ChildJobResult } from '../runtime/child-job-handler'
import { CoordinatorStep, type CoordinatorJobData, aggregateChildResults } from '../runtime/coordinator-producer'
import { updateRunStatus, getPendingApprovalsForRun } from '../db/queries'
import { postRunReflection } from '../runtime/post-run-reflection'

let worker: Worker | null = null
let coordinatorWorker: Worker | null = null

// ---------------------------------------------------------------------------
// Heartbeat worker (existing)
// ---------------------------------------------------------------------------

export function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      'agentos-heartbeats',
      async (job) => {
        const { agentId } = job.data
        console.log(`Heartbeat fired for agent ${agentId}`)

        const runner = new DurableRunner()
        const result = await runner.execute({
          agentId,
          userId: job.data.userId ?? 'system',
          sessionId: `heartbeat-${agentId}-${Date.now()}`,
        })

        console.log(`Agent ${agentId} heartbeat completed:`, result.status)
        return result
      },
      {
        connection: getRedisConnection(),
        concurrency: 1,
      }
    )

    worker.on('completed', (job) => {
      console.log(`Heartbeat job ${job.id} completed`)
    })

    worker.on('failed', (job, err) => {
      console.error(`Heartbeat job ${job?.id} failed:`, err.message)
    })
  }
  return worker
}

// ---------------------------------------------------------------------------
// Coordinator worker (new — parent job processor)
// ---------------------------------------------------------------------------

export function getCoordinatorWorker(): Worker<CoordinatorJobData, ChildJobResult> {
  if (!coordinatorWorker) {
    coordinatorWorker = new Worker(
      COORDINATOR_QUEUE,
      async (job) => {
        return await processCoordinatorJob(job)
      },
      {
        connection: getRedisConnection(),
        concurrency: 2,
      }
    )

    coordinatorWorker.on('completed', (job) => {
      console.log(`[Coordinator] Job ${job.id} completed`)
    })

    coordinatorWorker.on('failed', (job, err) => {
      console.error(`[Coordinator] Job ${job?.id} failed:`, err.message)
    })
  }
  return coordinatorWorker
}

// ---------------------------------------------------------------------------
// Coordinator state machine
// ---------------------------------------------------------------------------

async function processCoordinatorJob(
  job: import('bullmq').Job<CoordinatorJobData, ChildJobResult>,
  token?: string
): Promise<ChildJobResult> {
  const { step, runId } = job.data

  // step=0 Initial → children already enqueued by FlowProducer;
  // moveToWaitingChildren to pause until children complete
  if (step === CoordinatorStep.Initial) {
    await job.updateData({ ...job.data, step: CoordinatorStep.ChildrenEnqueued })
    throw new WaitingChildrenError()
  }

  if (step === CoordinatorStep.ChildrenEnqueued) {
    const shouldWait = await job.moveToWaitingChildren(token ?? '')
    if (shouldWait) {
      throw new WaitingChildrenError()
    }

    // All children are done — collect results via getChildrenValues
    const childrenValues = await job.getChildrenValues()
    const childResults: ChildJobResult[] = Object.values(childrenValues) as ChildJobResult[]

    const aggregated = aggregateChildResults(childResults)

    // Check for pending approvals
    const pending = await getPendingApprovalsForRun(runId)
    if (pending.length > 0) {
      await updateRunStatus(runId, 'waiting_for_approval')
      return { status: 'approval_required', elapsedMs: job.data.elapsedMs }
    }

    // Finalize run
    const finalStatus = aggregated.status === 'completed' ? 'completed' : 'failed'
    await updateRunStatus(runId, finalStatus, new Date())

    await job.updateData({ ...job.data, step: CoordinatorStep.Finish })

    // Post-run reflection — fire and forget
    void postRunReflection(runId).catch(err => {
      console.warn(`[PostRunReflection] Run ${runId} reflection failed:`, err)
    })

    return {
      status: aggregated.status === 'completed' ? 'completed' : 'error',
      elapsedMs: job.data.elapsedMs,
      output: childResults,
    }
  }

  // step=2 (Finish) — nothing more to do
  return { status: 'completed', elapsedMs: job.data.elapsedMs }
}

// ---------------------------------------------------------------------------
// Child worker
// ---------------------------------------------------------------------------

let childWorker: Worker<ChildJobPayload, ChildJobResult> | null = null

export function getChildWorker(): Worker<ChildJobPayload, ChildJobResult> {
  if (!childWorker) {
    childWorker = new Worker(
      WORKER_QUEUE,
      async (job) => {
        return await processChildJob(job)
      },
      {
        connection: getRedisConnection(),
        concurrency: 2,
      }
    )

    childWorker.on('completed', (job) => {
      console.log(`[ChildWorker] Job ${job.id} completed`)
    })

    childWorker.on('failed', (job, err) => {
      console.error(`[ChildWorker] Job ${job?.id} failed:`, err.message)
    })
  }
  return childWorker
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startWorker(): Promise<void> {
  await recoverInterruptedRuns()
  const w = getWorker()
  await w.run()
  const cw = getCoordinatorWorker()
  await cw.run()
  const chw = getChildWorker()
  await chw.run()
  await startProactiveWorker()
  console.log('BullMQ workers started (heartbeat + coordinator + child + proactive)')
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  if (coordinatorWorker) {
    await coordinatorWorker.close()
    coordinatorWorker = null
  }
  if (childWorker) {
    await childWorker.close()
    childWorker = null
  }
}
