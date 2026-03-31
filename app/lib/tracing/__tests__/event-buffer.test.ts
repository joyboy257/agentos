/**
 * Unit tests for EventBuffer and ReasoningSnapshot.
 * Verifies sequence numbering, capturePointInTime() immutability,
 * and event retrieval with cursor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventBuffer, eventBufferRegistry, ReasoningSnapshot } from '../event-buffer'
import { ReasoningEvent } from '../event-schema'

describe('EventBuffer', () => {
  afterEach(() => {
    eventBufferRegistry.clear()
  })

  it('assigns monotonically increasing sequence numbers', () => {
    const buffer = new EventBuffer('run-1')
    const e1 = buffer.addEvent('agent-1', 'observation', { text: 'first' })
    const e2 = buffer.addEvent('agent-1', 'observation', { text: 'second' })
    const e3 = buffer.addEvent('agent-2', 'action', { action: 'test' })

    expect(e1.sequence).toBe(1)
    expect(e2.sequence).toBe(2)
    expect(e3.sequence).toBe(3)
  })

  it('assigns ULID steps that are unique', () => {
    const buffer = new EventBuffer('run-2')
    const e1 = buffer.addEvent('agent-1', 'observation', { text: 'first' })
    const e2 = buffer.addEvent('agent-1', 'observation', { text: 'second' })

    // ULIDs are guaranteed unique within a monotonic counter per millisecond
    expect(e1.step).not.toBe(e2.step)
  })

  it('populates all required ReasoningEvent fields', () => {
    const buffer = new EventBuffer('run-3')
    const e = buffer.addEvent('agent-1', 'observation', { text: 'test' })

    expect(e.event).toBe('reasoning')
    expect(e.runId).toBe('run-3')
    expect(e.agentId).toBe('agent-1')
    expect(e.type).toBe('observation')
    expect(e.content).toEqual({ text: 'test' })
    expect(e.version).toBe(1)
    expect(typeof e.step).toBe('string')
    expect(e.step.length).toBe(26) // ULID length
    expect(e.timestamp).toBeGreaterThan(0)
  })

  it('returns all events when no cursor provided', () => {
    const buffer = new EventBuffer('run-4')
    buffer.addEvent('agent-1', 'observation', { text: 'first' })
    buffer.addEvent('agent-1', 'observation', { text: 'second' })
    buffer.addEvent('agent-1', 'observation', { text: 'third' })

    const events = buffer.getEvents()
    expect(events).toHaveLength(3)
  })

  it('returns only events after the cursor', () => {
    const buffer = new EventBuffer('run-5')
    buffer.addEvent('agent-1', 'observation', { text: 'first' })
    buffer.addEvent('agent-1', 'observation', { text: 'second' })
    buffer.addEvent('agent-1', 'observation', { text: 'third' })

    const events = buffer.getEvents(1)
    expect(events).toHaveLength(2)
    expect(events[0].sequence).toBe(2)
    expect(events[1].sequence).toBe(3)
  })

  it('returns empty array when cursor >= last sequence', () => {
    const buffer = new EventBuffer('run-6')
    buffer.addEvent('agent-1', 'observation', { text: 'first' })

    const events = buffer.getEvents(99)
    expect(events).toHaveLength(0)
  })

  it('does not mutate the original buffer via getEvents', () => {
    const buffer = new EventBuffer('run-7')
    buffer.addEvent('agent-1', 'observation', { text: 'a' })

    const events = buffer.getEvents()
    ;(events as ReasoningEvent[]).push({} as ReasoningEvent)
    expect(buffer.size()).toBe(1)
  })

  it('returns 0 for empty buffer sequence', () => {
    const buffer = new EventBuffer('run-8')
    expect(buffer.getSequence()).toBe(0)
  })

  it('returns last assigned sequence after additions', () => {
    const buffer = new EventBuffer('run-9')
    buffer.addEvent('agent-1', 'observation', { text: 'a' })
    buffer.addEvent('agent-1', 'observation', { text: 'b' })
    expect(buffer.getSequence()).toBe(2)
  })

  it('returns correct size count', () => {
    const buffer = new EventBuffer('run-10')
    expect(buffer.size()).toBe(0)
    buffer.addEvent('agent-1', 'observation', { text: 'a' })
    expect(buffer.size()).toBe(1)
    buffer.addEvent('agent-1', 'observation', { text: 'b' })
    expect(buffer.size()).toBe(2)
  })
})

describe('ReasoningSnapshot', () => {
  afterEach(() => {
    eventBufferRegistry.clear()
  })

  describe('capturePointInTime', () => {
    it('captures current buffer state', () => {
      const buffer = eventBufferRegistry.getOrCreate('snapshot-run-1')
      buffer.addEvent('agent-1', 'observation', { text: 'a' })
      buffer.addEvent('agent-1', 'observation', { text: 'b' })

      const snapshot = buffer.capturePointInTime()

      expect(snapshot.runId).toBe('snapshot-run-1')
      expect(snapshot.events).toHaveLength(2)
      expect(snapshot.sequence).toBe(2)
    })

    it('subsequent additions are NOT reflected in snapshot', () => {
      const buffer = eventBufferRegistry.getOrCreate('snapshot-run-2')
      buffer.addEvent('agent-1', 'observation', { text: 'a' })

      const snapshot = buffer.capturePointInTime()

      buffer.addEvent('agent-1', 'observation', { text: 'b' })
      buffer.addEvent('agent-1', 'observation', { text: 'c' })

      expect(snapshot.events).toHaveLength(1)
      expect(snapshot.sequence).toBe(1)
      expect(snapshot.events[0].sequence).toBe(1)
    })

    it('snapshot events are frozen and cannot be mutated', () => {
      const buffer = eventBufferRegistry.getOrCreate('snapshot-run-3')
      buffer.addEvent('agent-1', 'observation', { text: 'a' })
      const snapshot = buffer.capturePointInTime()

      expect(() => {
        ;(snapshot.events as ReasoningEvent[]).push({} as ReasoningEvent)
      }).toThrow()
    })

    it('getEventsAfter filters correctly', () => {
      const buffer = eventBufferRegistry.getOrCreate('snapshot-run-4')
      buffer.addEvent('agent-1', 'observation', { text: 'a' })
      buffer.addEvent('agent-1', 'observation', { text: 'b' })

      const snapshot = buffer.capturePointInTime()

      // These go to buffer, not snapshot
      buffer.addEvent('agent-1', 'observation', { text: 'c' })
      buffer.addEvent('agent-1', 'observation', { text: 'd' })

      // Snapshot should still only have events a and b (seq 1 and 2)
      const after1 = snapshot.getEventsAfter(1)
      expect(after1).toHaveLength(1)
      expect(after1[0].sequence).toBe(2)

      const after0 = snapshot.getEventsAfter(0)
      expect(after0).toHaveLength(2)

      const after99 = snapshot.getEventsAfter(99)
      expect(after99).toHaveLength(0)
    })

    it('capturedAt is set at snapshot creation time', () => {
      const buffer = eventBufferRegistry.getOrCreate('snapshot-run-5')
      buffer.addEvent('agent-1', 'observation', { text: 'a' })
      const before = Date.now()
      const snapshot = buffer.capturePointInTime()
      const after = Date.now()

      expect(snapshot.capturedAt).toBeGreaterThanOrEqual(before)
      expect(snapshot.capturedAt).toBeLessThanOrEqual(after)
    })
  })
})

describe('eventBufferRegistry', () => {
  afterEach(() => {
    eventBufferRegistry.clear()
  })

  it('getOrCreate returns same buffer for same runId', () => {
    const b1 = eventBufferRegistry.getOrCreate('run-abc')
    const b2 = eventBufferRegistry.getOrCreate('run-abc')
    expect(b1).toBe(b2)
  })

  it('getOrCreate returns different buffers for different runId', () => {
    const b1 = eventBufferRegistry.getOrCreate('run-1')
    const b2 = eventBufferRegistry.getOrCreate('run-2')
    expect(b1).not.toBe(b2)
    expect(b1.runId).toBe('run-1')
    expect(b2.runId).toBe('run-2')
  })

  it('get returns buffer if exists', () => {
    const created = eventBufferRegistry.getOrCreate('run-existing')
    const retrieved = eventBufferRegistry.get('run-existing')
    expect(retrieved).toBe(created)
  })

  it('get returns undefined for unknown runId', () => {
    expect(eventBufferRegistry.get('unknown-run')).toBeUndefined()
  })

  it('delete removes buffer from registry', () => {
    const buffer = eventBufferRegistry.getOrCreate('run-to-delete')
    eventBufferRegistry.delete('run-to-delete')
    expect(eventBufferRegistry.get('run-to-delete')).toBeUndefined()
  })
})

describe('SSE stream delivery (integration-like)', () => {
  afterEach(() => {
    eventBufferRegistry.clear()
  })

  it('buffer sequence is correct for SSE lastSequence reconnect', () => {
    const buffer = eventBufferRegistry.getOrCreate('sse-test-run')

    buffer.addEvent('agent-1', 'observation', { text: 'event-1' })
    buffer.addEvent('agent-1', 'observation', { text: 'event-2' })
    buffer.addEvent('agent-1', 'observation', { text: 'event-3' })

    // Client disconnects at sequence 2
    // Client reconnects with lastSequence=2 → should receive events 3+
    const events = buffer.getEvents(2)
    expect(events).toHaveLength(1)
    expect(events[0].sequence).toBe(3)
    expect(events[0].content).toEqual({ text: 'event-3' })
  })
})
