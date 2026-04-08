/**
 * Proactive queue — BullMQ queue for immediate gmail_push jobs.
 *
 * This queue is separate from the scheduler heartbeat queue.
 * Jobs added here run immediately (not on cron) when Gmail push webhooks fire.
 */

import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../scheduler/client';
import { DurableRunner } from './durable-runner';

let proactiveQueue: Queue | null = null;
let proactiveWorker: Worker | null = null;

export const PROACTIVE_QUEUE_NAME = 'agentos-proactive';

/**
 * Gmail push job payload shape.
 */
export interface GmailPushPayload {
  agentId: string
  userId: string
  threadId: string
  messageId: string
  from: string
  subject: string
  snippet?: string
}

export function getProactiveQueue(): Queue {
  if (!proactiveQueue) {
    proactiveQueue = new Queue(PROACTIVE_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return proactiveQueue;
}

/**
 * Enqueue a gmail_push job to run immediately.
 * Used by the webhook endpoint to hand off work to BullMQ fast.
 */
export async function enqueueGmailPush(payload: GmailPushPayload): Promise<void> {
  const q = getProactiveQueue();
  await q.add('gmail-push', payload, {
    /**
     * Default BullMQ behavior: jobs run as soon as a worker is available.
     * No special scheduling needed — this is the immediate queue.
     */
  });
}

/**
 * Get (or create) the proactive worker.
 * Processes gmail_push jobs by calling DurableRunner.execute() immediately.
 */
export function getProactiveWorker(): Worker {
  if (!proactiveWorker) {
    proactiveWorker = new Worker(
      PROACTIVE_QUEUE_NAME,
      async (job) => {
        const payload = job.data as GmailPushPayload;
        console.log(`[ProactiveQueue] gmail_push job fired for agent ${payload.agentId}`);

        // Skip if agent is paused (e.g. budget exhausted)
        const { getAgent } = await import('../db/queries')
        const agent = await getAgent(payload.agentId)
        if (agent && agent.status === 'paused_budget') {
          console.log(`[ProactiveQueue] Agent ${payload.agentId} is paused (budget) — skipping`)
          return { runId: null, status: 'skipped', reason: 'agent_paused_budget' }
        }

        const runner = new DurableRunner();
        const result = await runner.execute({
          agentId: payload.agentId,
          userId: payload.userId,
          sessionId: `gmail-push-${payload.threadId}-${Date.now()}`,
          args: {
            trigger: 'gmail_push',
            threadId: payload.threadId,
            messageId: payload.messageId,
            from: payload.from,
            subject: payload.subject,
            snippet: payload.snippet,
          },
        });

        console.log(`[ProactiveQueue] Agent ${payload.agentId} gmail_push completed:`, result.status);
        return result;
      },
      {
        connection: getRedisConnection(),
        concurrency: 2, // Allow up to 2 concurrent proactive jobs
      }
    );

    proactiveWorker.on('completed', (job) => {
      console.log(`[ProactiveQueue] Job ${job.id} completed`);
    });

    proactiveWorker.on('failed', (job, err) => {
      console.error(`[ProactiveQueue] Job ${job?.id} failed:`, err.message);
    });
  }
  return proactiveWorker;
}

export async function startProactiveWorker(): Promise<void> {
  const w = getProactiveWorker();
  await w.run();
  console.log('[ProactiveQueue] BullMQ proactive worker started');
}

export async function stopProactiveWorker(): Promise<void> {
  if (proactiveWorker) {
    await proactiveWorker.close();
    proactiveWorker = null;
  }
  if (proactiveQueue) {
    await proactiveQueue.close();
    proactiveQueue = null;
  }
}
