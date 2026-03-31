/**
 * EventEmitter interface — Redis in prod, in-memory fallback for Option B prototype.
 *
 * Provides a unified interface for emitting and subscribing to run events.
 * SSE transport layer uses this to stream events to clients.
 */

export interface SSEEvent {
  type: string
  data: unknown
  sequence: number
  timestamp: string
}

export interface EventEmitter {
  /**
   * Emit an event to all subscribers of a run.
   */
  emit(runId: string, event: SSEEvent): Promise<void>

  /**
   * Subscribe to events for a run.
   * Returns an unsubscribe function.
   */
  subscribe(runId: string, handler: (event: SSEEvent) => void): () => void
}
