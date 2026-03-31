/**
 * Per-run event buffer — stores all ReasoningEvents for a single run.
 * Provides sequence numbering, retrieval with optional cursor, and
 * atomic point-in-time snapshot for approval modal.
 */

import { ulid } from 'ulid'
import { ReasoningEvent, ReasoningEventType } from './event-schema'

export class EventBuffer {
  private readonly _events: ReasoningEvent[] = []
  private _sequence: number = 0
  readonly runId: string

  constructor(runId: string) {
    this.runId = runId
  }

  /**
   * Add a new event to the buffer.
   * Automatically assigns a ULID step and monotonically increasing sequence number.
   */
  addEvent(
    agentId: string,
    type: ReasoningEventType,
    content: Record<string, unknown>
  ): ReasoningEvent {
    this._sequence++
    const step = ulid()
    const timestamp = Date.now()

    const event = {
      event: 'reasoning',
      runId: this.runId,
      agentId,
      step,
      sequence: this._sequence,
      type,
      content: content as ReasoningEvent['content'],
      timestamp,
      version: 1,
    } as ReasoningEvent

    this._events.push(event)
    return event
  }

  /**
   * Add a pre-constructed event (e.g., with integrity fields already set).
   * Uses the event's own sequence if provided, otherwise assigns next sequence.
   */
  addEventWithIntegrity(event: ReasoningEvent): ReasoningEvent {
    if (event.sequence === 0) {
      this._sequence++
      event.sequence = this._sequence
    } else if (event.sequence > this._sequence) {
      this._sequence = event.sequence
    }
    this._events.push(event)
    return event
  }

  /**
   * Get all events, optionally filtered to those after a given sequence number.
   * @param since Return only events with sequence > since
   */
  getEvents(since?: number): ReasoningEvent[] {
    if (since === undefined) {
      return [...this._events]
    }
    return this._events.filter(e => e.sequence > since)
  }

  /**
   * Get the current sequence number (last assigned).
   */
  getSequence(): number {
    return this._sequence
  }

  /**
   * Get the total number of events in the buffer.
   */
  size(): number {
    return this._events.length
  }

  /**
   * Capture an atomic point-in-time snapshot of the current buffer.
   * Returns a frozen copy that is immutable and unaffected by subsequent additions.
   * Used by the approval modal — it reads from snapshot, not live stream.
   */
  capturePointInTime(): ReasoningSnapshot {
    return new ReasoningSnapshot(this.runId, [...this._events], this._sequence)
  }
}

/**
 * Immutable snapshot of the event buffer at a point in time.
 * Constructed by EventBuffer.capturePointInTime().
 */
export class ReasoningSnapshot {
  readonly runId: string
  readonly events: readonly ReasoningEvent[]
  readonly sequence: number
  readonly capturedAt: number

  constructor(
    runId: string,
    events: ReasoningEvent[],
    sequence: number
  ) {
    this.runId = runId
    this.events = Object.freeze([...events])
    this.sequence = sequence
    this.capturedAt = Date.now()
  }

  /**
   * Get events after a given sequence number (for partial replay from snapshot).
   */
  getEventsAfter(since: number): ReasoningEvent[] {
    return this.events.filter(e => e.sequence > since)
  }
}

/**
 * Global registry of per-run event buffers.
 * Allows retrieval of an existing buffer for a runId.
 */
class EventBufferRegistry {
  private readonly _buffers = new Map<string, EventBuffer>()

  getOrCreate(runId: string): EventBuffer {
    let buffer = this._buffers.get(runId)
    if (!buffer) {
      buffer = new EventBuffer(runId)
      this._buffers.set(runId, buffer)
    }
    return buffer
  }

  get(runId: string): EventBuffer | undefined {
    return this._buffers.get(runId)
  }

  /** Remove a buffer when the run is complete (frees memory). */
  delete(runId: string): void {
    this._buffers.delete(runId)
  }

  /** Clear all buffers (for testing). */
  clear(): void {
    this._buffers.clear()
  }
}

export const eventBufferRegistry = new EventBufferRegistry()
