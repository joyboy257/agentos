/**
 * Redis EventEmitter for production multi-instance deployment.
 *
 * Uses Redis pub/sub to emit events so SSE clients on any machine
 * receive events published by BullMQ workers.
 *
 * For Option B prototype (single-process), use in-memory-event-emitter.ts instead.
 */

import type { EventEmitter, SSEEvent } from './event-emitter'
import { getRedisConnection } from '../scheduler/client'

export const redisEventEmitter: EventEmitter = {
  async emit(runId: string, event: SSEEvent): Promise<void> {
    const redis = getRedisConnection()
    const channel = `run:${runId}`
    const message = JSON.stringify(event)
    await redis.publish(channel, message)
  },

  subscribe(runId: string, handler: (event: SSEEvent) => void): () => void {
    const redis = getRedisConnection()
    const channel = `run:${runId}`

    const subscriber = redis.duplicate()
    subscriber.subscribe(channel)

    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        handler(JSON.parse(message) as SSEEvent)
      }
    })

    // Return unsubscribe function
    return () => {
      subscriber.unsubscribe(channel)
      subscriber.disconnect()
    }
  },
}
