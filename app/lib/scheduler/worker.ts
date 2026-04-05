import { Worker } from 'bullmq';
import { getRedisConnection } from './client';
import { DurableRunner } from '../runtime/durable-runner';
import { recoverInterruptedRuns } from '../runtime/startup-recovery';
import { startProactiveWorker } from '../runtime/proactive-queue';

let worker: Worker | null = null;

export function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      'agentos-heartbeats',
      async (job) => {
        const { agentId } = job.data;
        console.log(`Heartbeat fired for agent ${agentId}`);

        // Call DurableRunner to execute the agent
        const runner = new DurableRunner();
        const result = await runner.execute({
          agentId,
          userId: job.data.userId ?? 'system',
          sessionId: `heartbeat-${agentId}-${Date.now()}`,
        });

        console.log(`Agent ${agentId} heartbeat completed:`, result.status);
        return result;
      },
      {
        connection: getRedisConnection(),
        concurrency: 1, // Only one heartbeat job per agent at a time
      }
    );

    worker.on('completed', (job) => {
      console.log(`Heartbeat job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Heartbeat job ${job?.id} failed:`, err.message);
    });
  }
  return worker;
}

export async function startWorker(): Promise<void> {
  // Recover any runs that were interrupted by the previous shutdown
  await recoverInterruptedRuns();
  const w = getWorker();
  await w.run();
  // Also start the proactive queue worker for Gmail push immediate jobs
  await startProactiveWorker();
  console.log('BullMQ worker started');
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
