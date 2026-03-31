/**
 * Event aggregation for reasoning traces.
 *
 * Collapses consecutive identical observation events within a 500ms window
 * into a single event with a count suffix: "Checking inbox (x3)"
 *
 * Classification and decision events are never collapsed (they carry
 * important variation in alternatives/confidence).
 */

import { ReasoningEvent, ObservationEvent } from './event-schema'

const AGGREGATION_WINDOW_MS = 500
const MAX_RENDERED_EVENTS = 500

interface AggregatedEvent {
  original: ObservationEvent
  count: number
}

/**
 * EventAggregator — collapses consecutive identical observations within a time window.
 *
 * When a new observation arrives:
 * - If it's within AGGREGATION_WINDOW_MS of the last observation AND
 *   has the same text content, increment the count
 * - Otherwise, emit the previous aggregated event (if any) and start a new one
 *
 * Non-observation events always pass through immediately.
 */
export class EventAggregator {
  private pending: AggregatedEvent | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly onEmit: (event: ReasoningEvent) => void

  constructor(onEmit: (event: ReasoningEvent) => void) {
    this.onEmit = onEmit
  }

  /**
   * Process an incoming event.
   * May emit immediately (non-observation) or queue for aggregation.
   */
  push(event: ReasoningEvent): void {
    // Non-observation events always pass through immediately
    if (event.type !== 'observation') {
      this.flush()
      this.onEmit(event)
      return
    }

    const observation = event as ObservationEvent

    // Check if this observation can be aggregated with the pending one
    if (this.pending && this.canAggregate(this.pending.original, observation)) {
      this.pending.count++
      // Update the timestamp of the pending event to extend the window
      this.pending.original.timestamp = observation.timestamp
    } else {
      // Flush any pending observation
      this.flush()

      // Start a new pending observation
      this.pending = {
        original: observation,
        count: 1,
      }

      // Set a timer to flush at the end of the window
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
      }
      this.flushTimer = setTimeout(() => {
        this.flush()
      }, AGGREGATION_WINDOW_MS)
    }
  }

  /**
   * Check if two observation events can be aggregated.
   * They must have the same text content.
   */
  private canAggregate(a: ObservationEvent, b: ObservationEvent): boolean {
    return a.content.text === b.content.text
  }

  /**
   * Flush any pending aggregated observation.
   */
  private flush(): void {
    if (!this.pending) return

    const { original, count } = this.pending
    this.pending = null

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (count > 1) {
      // Emit aggregated event with count suffix
      const aggregated: ObservationEvent = {
        ...original,
        content: {
          ...original.content,
          text: `${original.content.text} (x${count})`,
        },
      }
      this.onEmit(aggregated)
    } else {
      // Emit single event as-is
      this.onEmit(original)
    }
  }

  /**
   * Flush all pending events and stop the timer.
   * Call this when the run completes.
   */
  close(): void {
    this.flush()
  }
}

/**
 * Apply aggregation to an array of events.
 * Useful for replaying buffered events through aggregation.
 */
export function aggregateEvents(events: ReasoningEvent[]): ReasoningEvent[] {
  const result: ReasoningEvent[] = []
  const aggregator = new EventAggregator((event) => result.push(event))

  for (const event of events) {
    aggregator.push(event)
  }
  aggregator.close()

  return result
}

/**
 * Apply virtual scrolling cap — only return the last MAX_RENDERED_EVENTS.
 * Returns both the events and whether truncation occurred.
 */
export function applyCap(events: ReasoningEvent[]): {
  events: ReasoningEvent[]
  truncated: boolean
} {
  if (events.length <= MAX_RENDERED_EVENTS) {
    return { events, truncated: false }
  }

  return {
    events: events.slice(-MAX_RENDERED_EVENTS),
    truncated: true,
  }
}
