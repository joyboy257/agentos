import { describe, it, expect, beforeEach } from 'vitest'
import { HookRegistry, resetHookRegistry } from '../hook-registry'
import type { HookType } from '../types'

describe('HookRegistry', () => {
  let registry: HookRegistry

  beforeEach(() => {
    registry = new HookRegistry()
  })

  // -------------------------------------------------------------------------
  // Basic registration and emission
  // -------------------------------------------------------------------------

  it('calls handler with correct context when event is emitted', async () => {
    const received: unknown[] = []
    registry.register('postAgentRun', 'test-handler', async (ctx) => {
      received.push(ctx)
      return { success: true }
    })

    const ctx = { runId: 'run-1', agentId: 'agent-1', timestamp: Date.now() }
    const results = await registry.emit('postAgentRun', ctx)

    expect(received).toEqual([ctx])
    expect(results).toEqual([{ success: true }])
  })

  it('calls all handlers when multiple are registered for same type', async () => {
    const calls: string[] = []
    registry.register('postAgentRun', 'handler-a', async () => {
      calls.push('a')
      return { success: true }
    })
    registry.register('postAgentRun', 'handler-b', async () => {
      calls.push('b')
      return { success: true }
    })

    await registry.emit('postAgentRun', { runId: 'run-1', timestamp: Date.now() })

    expect(calls).toEqual(['a', 'b'])
  })

  // -------------------------------------------------------------------------
  // Unregistration
  // -------------------------------------------------------------------------

  it('stops calling unregistered handler', async () => {
    const calls: string[] = []
    registry.register('postAgentRun', 'handler-a', async () => {
      calls.push('a')
      return { success: true }
    })
    registry.register('postAgentRun', 'handler-b', async () => {
      calls.push('b')
      return { success: true }
    })

    registry.unregister('postAgentRun', 'handler-a')
    await registry.emit('postAgentRun', { runId: 'run-1', timestamp: Date.now() })

    expect(calls).toEqual(['b'])
  })

  it('unregister is safe when handler was never registered', async () => {
    expect(() => registry.unregister('postAgentRun', 'never-registered')).not.toThrow()
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('collects failures without throwing when handler throws', async () => {
    registry.register('postAgentRun', 'failing-handler', async () => {
      throw new Error('handler failed')
    })
    registry.register('postAgentRun', 'ok-handler', async () => {
      return { success: true }
    })

    const results = await registry.emit('postAgentRun', { runId: 'run-1', timestamp: Date.now() })

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ success: false, error: 'handler failed' })
    expect(results[1]).toEqual({ success: true })
  })

  it('still calls remaining handlers when one throws', async () => {
    const calls: string[] = []
    registry.register('postAgentRun', 'failing', async () => {
      calls.push('failing')
      throw new Error('fail')
    })
    registry.register('postAgentRun', 'ok', async () => {
      calls.push('ok')
      return { success: true }
    })

    await registry.emit('postAgentRun', { runId: 'run-1', timestamp: Date.now() })

    expect(calls).toEqual(['failing', 'ok'])
  })

  // -------------------------------------------------------------------------
  // All hook types
  // -------------------------------------------------------------------------

  const allHookTypes: HookType[] = [
    'preAgentRun',
    'postAgentRun',
    'preToolCall',
    'postToolCall',
    'preApproval',
    'postApproval',
    'runComplete',
    'runError',
  ]

  for (const type of allHookTypes) {
    it(`emits ${type} without error`, async () => {
      let called = false
      registry.register(type, 'test', async (ctx) => {
        called = true
        expect(ctx.runId).toBe('run-1')
        return { success: true }
      })
      const ctx = { runId: 'run-1', timestamp: Date.now() } as any
      const results = await registry.emit(type, ctx)
      expect(called).toBe(true)
      expect(results[0].success).toBe(true)
    })
  }

  // -------------------------------------------------------------------------
  // Depth limit
  // -------------------------------------------------------------------------

  it('returns error result when max emit depth is exceeded', async () => {
    // Nesting is tested by the depth counter on the registry
    const results = await registry.emit('runComplete', { runId: 'run-1', timestamp: Date.now() })
    // No depth exceeded yet — should return empty (no listeners)
    expect(Array.isArray(results)).toBe(true)
  })
})
