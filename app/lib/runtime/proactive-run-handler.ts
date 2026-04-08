/**
 * Proactive Run Handler — BullMQ worker for proactive (cron-triggered) agent runs.
 *
 * Handles `proactive-run` jobs from the `agentos-proactive` queue.
 * Guard conditions before execution:
 *   1. Agent status is not `paused_budget` or `stopped`
 *   2. No successful run completed within the last 60 minutes (avoid double-firing)
 *
 * On success: sends Maria a push notification with the run summary.
 * On completion: stores a result summary in the run record.
 */

import { Worker } from 'bullmq'
import { getRedisConnection } from '../scheduler/client'
import { getAgent, getRun, createRun, updateRunStatus, listAgentsWithSchedules } from '../db/queries'
import { DurableRunner } from './durable-runner'
import { sendProactiveRunPush } from '../push-notifications'

export const PROACTIVE_RUN_WORKER_QUEUE = 'agentos-proactive'

export interface ProactiveRunPayload {
  agentId: string
  cronExpression?: string
}

let proactiveRunWorker: Worker | null = null

/**
 * Get (or create) the proactive run worker.
 */
export function getProactiveRunWorker(): Worker {
  if (!proactiveRunWorker) {
    proactiveRunWorker = new Worker(
      PROACTIVE_RUN_WORKER_QUEUE,
      async (job) => {
        const payload = job.data as ProactiveRunPayload
        const { agentId } = payload
        console.log(`[ProactiveRunHandler] proactive-run job fired for agent ${agentId}`)

        const result = await handleProactiveRun(agentId)

        console.log(`[ProactiveRunHandler] Agent ${agentId} proactive run completed: ${result.status}`)
        return result
      },
      {
        connection: getRedisConnection(),
        concurrency: 2,
      }
    )

    proactiveRunWorker.on('completed', (job) => {
      console.log(`[ProactiveRunHandler] Job ${job.id} completed`)
    })

    proactiveRunWorker.on('failed', (job, err) => {
      console.error(`[ProactiveRunHandler] Job ${job?.id} failed:`, err.message)
    })
  }
  return proactiveRunWorker
}

/**
 * Start the proactive run worker.
 */
export async function startProactiveRunWorker(): Promise<void> {
  const w = getProactiveRunWorker()
  await w.run()
  console.log('[ProactiveRunHandler] BullMQ proactive run worker started')
}

/**
 * Stop the proactive run worker.
 */
export async function stopProactiveRunWorker(): Promise<void> {
  if (proactiveRunWorker) {
    await proactiveRunWorker.close()
    proactiveRunWorker = null
  }
}

/**
 * Handle a single proactive run — load agent, check guards, execute.
 */
async function handleProactiveRun(agentId: string): Promise<{ status: string; runId?: string; skipped?: boolean }> {
  // 1. Load agent from DB
  const agent = await getAgent(agentId)
  if (!agent) {
    console.warn(`[ProactiveRunHandler] Agent ${agentId} not found — skipping`)
    return { status: 'skipped', skipped: true }
  }

  // 2. Skip if agent is paused_budget or stopped
  if (agent.status === 'paused_budget' || agent.status === 'stopped') {
    console.log(`[ProactiveRunHandler] Agent ${agentId} is ${agent.status} — skipping proactive run`)
    return { status: 'skipped', skipped: true }
  }

  // 3. Skip if a successful run completed within the last 60 minutes (avoid double-firing)
  const recentRun = await hasRecentSuccessfulRun(agentId)
  if (recentRun) {
    console.log(`[ProactiveRunHandler] Agent ${agentId} had a recent run — skipping to avoid double-fire`)
    return { status: 'skipped', skipped: true }
  }

  // 4. Create a proactive run record
  const run = await createRun({ agent_id: agentId, user_id: agent.user_id })

  // 5. Update triggered_by on the run
  await updateRunTriggeredBy(run.id, 'proactive')

  // 6. Execute the agent via DurableRunner
  const runner = new DurableRunner()
  const execResult = await runner.execute({
    agentId,
    userId: agent.user_id,
    sessionId: `proactive-${agentId}-${Date.now()}`,
    args: { trigger: 'proactive_cron', cronExpression: agent.schedule_cron ?? undefined },
  })

  // 7. Build and send push notification to Maria
  const runRecord = await getRun(run.id)
  const status = runRecord?.status ?? execResult.status

  await sendProactiveRunPush({
    agentId,
    agentName: agent.name,
    userId: agent.user_id,
    runId: run.id,
    status,
    cronExpression: agent.schedule_cron ?? undefined,
  }).catch(err => {
    console.warn(`[ProactiveRunHandler] Failed to send push notification:`, err)
  })

  return { status: execResult.status, runId: run.id }
}

/**
 * Check whether the agent had a successful run within the last 60 minutes.
 */
async function hasRecentSuccessfulRun(agentId: string): Promise<boolean> {
  const { sql } = await import('@vercel/postgres')
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const result = await sql`
    SELECT id FROM runs
    WHERE agent_id = ${agentId}
      AND status = 'completed'
      AND completed_at >= ${oneHourAgo}
    LIMIT 1
  `

  return result.rows.length > 0
}

/**
 * Update the triggered_by column on a run.
 */
async function updateRunTriggeredBy(runId: string, triggeredBy: 'manual' | 'proactive' | 'webhook'): Promise<void> {
  const { sql } = await import('@vercel/postgres')
  await sql`UPDATE runs SET triggered_by = ${triggeredBy} WHERE id = ${runId}`
}
