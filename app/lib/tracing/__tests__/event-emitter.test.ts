import { describe, it, expect, vi, beforeEach } from 'vitest'
import { inMemoryEventEmitter } from '../in-memory-event-emitter'

describe('InMemoryEventEmitter', () => {
  beforeEach(() => {
    // Noop — each test uses fresh handlers Map
  })

  it('emits events to subscribers', async () => {
    const events: any[] = []
    const unsubscribe = inMemoryEventEmitter.subscribe('run-1', (e) => events.push(e))

    await inMemoryEventEmitter.emit('run-1', {
      type: 'test',
      data: { foo: 'bar' },
      sequence: 0,
      timestamp: '',
    })

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('test')
    expect(events[0].data.foo).toBe('bar')

    unsubscribe()
  })

  it('does not emit to unsubscribed handlers', async () => {
    const events: any[] = []
    const unsubscribe = inMemoryEventEmitter.subscribe('run-1', (e) => events.push(e))
    unsubscribe()

    await inMemoryEventEmitter.emit('run-1', {
      type: 'test',
      data: {},
      sequence: 0,
      timestamp: '',
    })

    expect(events.length).toBe(0)
  })

  it('only emits to subscribers of the specific runId', async () => {
    const run1Events: any[] = []
    const run2Events: any[] = []

    inMemoryEventEmitter.subscribe('run-1', (e) => run1Events.push(e))
    inMemoryEventEmitter.subscribe('run-2', (e) => run2Events.push(e))

    await inMemoryEventEmitter.emit('run-1', {
      type: 'test',
      data: {},
      sequence: 0,
      timestamp: '',
    })

    expect(run1Events.length).toBe(1)
    expect(run2Events.length).toBe(0)
  })

  it('assigns monotonic sequence numbers', async () => {
    const events: any[] = []
    inMemoryEventEmitter.subscribe('run-1', (e) => events.push(e))

    await inMemoryEventEmitter.emit('run-1', {
      type: 'a',
      data: {},
      sequence: 0,
      timestamp: '',
    })
    await inMemoryEventEmitter.emit('run-1', {
      type: 'b',
      data: {},
      sequence: 0,
      timestamp: '',
    })

    expect(events[0].sequence).toBeLessThan(events[1].sequence)
  })
})
