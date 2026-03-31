/**
 * In-memory EventEmitter for Option B prototype.
 *
 * Wraps the existing runChannels Map for single-process SSE.
 * No Redis needed — events flow through EventBuffer in-process.
 *
 * For multi-instance production, use redis-event-emitter.ts instead.
 */

import type { EventEmitter, SSEEvent } from './event-emitter'
import { ReasoningEvent } from './event-schema'

/**
 * Maps runId → Set of handlers to call when events are emitted.
 */
const handlers = new Map<string, Set<(event: SSEEvent) => void>>()

let sequenceCounter = 0

/**
 * In-memory event emitter — emits to all subscribers of a runId.
 */
export const inMemoryEventEmitter: EventEmitter = {
  async emit(runId: string, event: SSEEvent): Promise<void> {
    event.sequence = ++sequenceCounter
    event.timestamp = new Date().toISOString()

    const runHandlers = handlers.get(runId)
    if (runHandlers) {
      for (const handler of Array.from(runHandlers)) {
        try {
          handler(event)
        } catch {
          // Subscriber error — remove bad subscriber
          runHandlers.delete(handler)
        }
      }
    }
  },

  subscribe(runId: string, handler: (event: SSEEvent) => void): () => void {
    if (!handlers.has(runId)) {
      handlers.set(runId, new Set())
    }
    handlers.get(runId)!.add(handler)

    // Return unsubscribe function
    return () => {
      handlers.get(runId)?.delete(handler)
    }
  },
}

/**
 * Emit a ReasoningEvent to all subscribers via the in-memory emitter.
 */
export function emitEvent(runId: string, event: ReasoningEvent): void {
  const sseEvent: SSEEvent = {
    type: event.type,
    data: event,
    sequence: event.sequence,
    timestamp: new Date(event.timestamp).toISOString(),
  }
  // Fire-and-forget — in-memory emit is synchronous for Option B prototype
  inMemoryEventEmitter.emit(runId, sseEvent)
}
