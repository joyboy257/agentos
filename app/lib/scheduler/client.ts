import { Queue } from 'bullmq';
import Redis from 'ioredis';

let redisConnection: Redis | null = null;
let queue: Queue | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
    });
  }
  return redisConnection;
}

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue('agentos-heartbeats', {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

// Idempotent heartbeat scheduling per agent using Job Scheduler API
export async function scheduleAgent(agentId: string, cronExpression: string): Promise<void> {
  const q = getQueue();
  // upsertJobScheduler is idempotent — calling twice for same ID updates, doesn't duplicate
  await q.upsertJobScheduler(
    `heartbeat:${agentId}`,
    { pattern: cronExpression },
    { name: 'agent-heartbeat', data: { agentId } }
  );
}

export async function cancelSchedule(agentId: string): Promise<void> {
  const q = getQueue();
  await q.removeJobScheduler(`heartbeat:${agentId}`);
}
