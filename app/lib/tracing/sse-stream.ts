/**
 * Channel-based SSE per-run emitter.
 *
 * Unlike a shared singleton, this provides per-run channels.
 * Subscribers register via subscribeToRunChannel(runId, handler).
 * Emitters call emitToRunChannel(runId, event).
 *
 * Supports cursor-based reconnection: clients pass ?lastSequence=N to receive
 * only events after that sequence number.
 */

import { ReasoningEvent } from './event-schema'
import { eventBufferRegistry, EventBuffer } from './event-buffer'

type SSEEvent = {
  type: string
  data: unknown
}

/**
 * Maps runId → Set of controller functions to call when events are emitted.
 * Each active SSE connection registers its controller.enqueue() as a handler.
 */
const runChannels = new Map<string, Set<(event: SSEEvent) => void>>()

/**
 * Get all channel subscriber handlers for a run.
 */
export function getRunChannel(runId: string): Set<(event: SSEEvent) => void> {
  let channel = runChannels.get(runId)
  if (!channel) {
    channel = new Set()
    runChannels.set(runId, channel)
  }
  return channel
}

/**
 * Register a subscriber for a run's SSE channel.
 * Returns an unsubscribe function.
 */
export function subscribeToRunChannel(
  runId: string,
  handler: (event: SSEEvent) => void
): () => void {
  const channel = getRunChannel(runId)
  channel.add(handler)
  return () => {
    channel.delete(handler)
    if (channel.size === 0) {
      runChannels.delete(runId)
    }
  }
}

/**
 * Emit an event to all subscribers of a run's SSE channel.
 * SSE format: `event: TYPE\ndata: JSON\n\n`
 */
export function emitToRunChannel(runId: string, event: ReasoningEvent): void {
  const channel = runChannels.get(runId)
  if (!channel || channel.size === 0) return

  const sseEvent: SSEEvent = {
    type: event.type,
    data: event,
  }

  for (const handler of Array.from(channel)) {
    try {
      handler(sseEvent)
    } catch {
      // Subscriber error — remove bad subscriber
      channel.delete(handler)
    }
  }
}

/**
 * Encode a SSE event as a Uint8Array suitable for ReadableStream.
 * Format: `event: TYPE\ndata: JSON\n\n`
 */
export function encodeSSEEvent(type: string, data: unknown): Uint8Array {
  const encoder = new TextEncoder()
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  return encoder.encode(payload)
}

/**
 * SSEStream — creates a ReadableStream that emits reasoning events for a run.
 *
 * Usage:
 *   const stream = new SSEStream(runId, { lastSequence: 47 })
 *   return new Response(stream.toReadableStream(), { headers: ... })
 */
export class SSEStream {
  private readonly runId: string
  private readonly buffer: EventBuffer
  private readonly lastSequence: number
  private readonly encoder = new TextEncoder()
  private readonly channelUnsubscribe: () => void

  constructor(runId: string, options: { lastSequence?: number } = {}) {
    this.runId = runId
    this.buffer = eventBufferRegistry.getOrCreate(runId)
    this.lastSequence = options.lastSequence ?? 0

    // Subscribe to channel for new events
    this.channelUnsubscribe = subscribeToRunChannel(runId, (sseEvent) => {
      this.handleEvent(sseEvent)
    })
  }

  private pendingController: ReadableStreamDefaultController | null = null

  /**
   * Handle an incoming SSE event from the channel.
   * Enqueues it to the stream if sequence > lastSequence.
   */
  private handleEvent(sseEvent: SSEEvent): void {
    if (!this.pendingController) return

    const event = sseEvent.data as ReasoningEvent
    if (event.sequence > this.lastSequence) {
      try {
        const encoded = encodeSSEEvent(sseEvent.type, sseEvent.data)
        this.pendingController.enqueue(encoded)
      } catch {
        // Stream closed — unsubscribe
        this.channelUnsubscribe()
      }
    }
  }

  /**
   * Create a ReadableStream that:
   * 1. Sends all buffered events after lastSequence
   * 2. Subscribes to channel for new events
   * 3. Sends StreamEndEvent with finalSequence when run completes
   */
  toReadableStream(): ReadableStream<Uint8Array> {
    const self = this

    return new ReadableStream<Uint8Array>({
      start(controller) {
        self.pendingController = controller

        // Replay buffered events from lastSequence
        const buffered = self.buffer.getEvents(self.lastSequence)
        for (const event of buffered) {
          const encoded = encodeSSEEvent(event.type, event)
          controller.enqueue(encoded)
        }
      },

      cancel() {
        self.channelUnsubscribe()
        self.pendingController = null
      },
    })
  }

  /**
   * Send a StreamEndEvent and close the stream.
   * Call this when the run completes.
   */
  close(finalSequence: number): void {
    if (!this.pendingController) return

    try {
      const endEvent = {
        event: 'reasoning',
        type: 'stream_end',
        data: { finalSequence },
      }
      const encoded = encodeSSEEvent('stream_end', { finalSequence })
      this.pendingController.enqueue(encoded)
    } catch {
      // Already closed
    }

    this.channelUnsubscribe()
    this.pendingController = null
  }

  /**
   * Get the current buffer sequence (for reconnection / lastSequence handling).
   */
  getCurrentSequence(): number {
    return this.buffer.getSequence()
  }
}
