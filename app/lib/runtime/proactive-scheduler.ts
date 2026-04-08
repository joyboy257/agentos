/**
 * Proactive Scheduler — BullMQ-based cron scheduling for proactive agent runs.
 *
 * In BullMQ v5, repeating jobs are registered via Queue.add() with the repeat option.
 * BullMQ stores the repeat key internally, making this idempotent — calling add()
 * twice with the same key updates rather than duplicates.
 *
 * When a cron fires, a `proactive-run` job lands in the agentos-proactive queue,
 * where proactive-run-handler.ts picks it up.
 */

import { Queue } from 'bullmq'
import { getRedisConnection } from '../scheduler/client'
import { listAgentsWithSchedules } from '../db/queries'

export const PROACTIVE_SCHEDULER_QUEUE = 'agentos-proactive'

let schedulerQueue: Queue | null = null

/**
 * Get (or create) the proactive queue used for both scheduling and execution.
 */
export function getSchedulerQueue(): Queue {
  if (!schedulerQueue) {
    schedulerQueue = new Queue(PROACTIVE_SCHEDULER_QUEUE, {
      connection: getRedisConnection(),
    })
  }
  return schedulerQueue
}

/**
 * Register a single agent's cron schedule with BullMQ.
 * Uses Queue.add with repeat option — idempotent in BullMQ v5.
 */
export async function registerAgentSchedule(agentId: string, cronExpression: string): Promise<void> {
  const q = getSchedulerQueue()
  // BullMQ v5: repeat option makes the job recurring per the cron pattern.
  // The job key includes the name, so calling this twice for the same agentId
  // updates (doesn't duplicate) the existing repeatable job.
  await q.add(
    `proactive:${agentId}`,
    { agentId, cronExpression },
    {
      repeat: { pattern: cronExpression },
      jobId: `proactive:${agentId}`, // explicit jobId makes upsert idempotent
    }
  )
  console.log(`[ProactiveScheduler] Registered ${agentId} with schedule: ${cronExpression}`)
}

/**
 * Cancel a previously registered agent schedule by removing the repeatable job.
 */
export async function cancelAgentSchedule(agentId: string): Promise<void> {
  const q = getSchedulerQueue()
  // Remove the repeatable job by name — BullMQ removes all repeat instances
  await q.remove(`proactive:${agentId}`)
  console.log(`[ProactiveScheduler] Cancelled schedule for ${agentId}`)
}

/**
 * Register all agents that have schedule_cron set.
 * Called on server startup (via startup-recovery.ts) to re-hydrate schedules.
 */
export async function registerAllScheduledAgents(): Promise<void> {
  const agents = await listAgentsWithSchedules()

  const running = agents.filter(a => a.status === 'running' || a.status === 'idle')
  const paused  = agents.filter(a => a.status === 'paused_budget' || a.status === 'stopped')

  for (const agent of running) {
    if (agent.schedule_cron) {
      await registerAgentSchedule(agent.id, agent.schedule_cron)
    }
  }

  console.log(
    `[ProactiveScheduler] Startup registration complete: ` +
    `${running.length} registered, ${paused.length} skipped (not running)`
  )
}

/**
 * Start the proactive scheduler.
 * In BullMQ v5, repeating jobs are self-sustaining — once added with a repeat
 * option, BullMQ automatically fires them on schedule. No separate process needed.
 */
export async function startProactiveScheduler(): Promise<void> {
  // Ensure the queue is initialized
  getSchedulerQueue()
  console.log('[ProactiveScheduler] BullMQ proactive scheduler initialized')
}

/**
 * Stop the scheduler and close the queue.
 */
export async function stopProactiveScheduler(): Promise<void> {
  if (schedulerQueue) {
    await schedulerQueue.close()
    schedulerQueue = null
  }
}
