/**
 * HookRegistry — hook system for agent lifecycle reactivity.
 *
 * Pattern: custom registry with Map<HookType, Map<name, handler>>.
 * Does NOT extend EventEmitter to avoid Node's invalid listener type issues.
 *
 * Hooks are async by default — all handlers run in parallel via Promise.all.
 * Failures are logged but don't propagate — other handlers always run.
 *
 * Usage:
 *   const registry = new HookRegistry()
 *   registry.register('postAgentRun', 'analytics', async (ctx) => { ... })
 *   await registry.emit('postAgentRun', { runId: '...', timestamp: Date.now() })
 *   registry.unregister('postAgentRun', 'analytics')
 */

import type { HookType, HookContext, HookResult, HookHandler } from './types'

// Depth limit prevents circular hook chains (hook A triggers hook B triggers A)
const MAX_EMIT_DEPTH = 3

type NamedHandler = HookHandler & { __name: string }

export class HookRegistry {
  // Map of hook type → Map of handler name → handler
  private handlers = new Map<HookType, Map<string, NamedHandler>>()
  private depth = 0

  /**
   * Register a handler for a hook type.
   * If a handler with the same name is already registered for this type, it is replaced.
   */
  register(type: HookType, name: string, handler: HookHandler): void {
    let typeMap = this.handlers.get(type)
    if (!typeMap) {
      typeMap = new Map()
      this.handlers.set(type, typeMap)
    }
    const wrapped: NamedHandler = ((ctx: HookContext) =>
      handler(ctx).catch((err: unknown) => {
        console.error(`[HookRegistry] Handler '${name}' failed:`, err)
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: message } as HookResult
      })
    ) as NamedHandler
    wrapped.__name = name
    typeMap.set(name, wrapped)
  }

  /**
   * Unregister a handler by name for a specific hook type.
   * No-op if no matching handler is found.
   */
  unregister(type: HookType, name: string): void {
    const typeMap = this.handlers.get(type)
    if (typeMap) {
      typeMap.delete(name)
    }
  }

  /**
   * Emit a hook event to all registered handlers.
   *
   * All handlers run in parallel via Promise.all.
   * Depth limit prevents circular emit chains.
   * Failures are collected into results but don't throw.
   */
  async emit(type: HookType, ctx: HookContext): Promise<HookResult[]> {
    if (this.depth >= MAX_EMIT_DEPTH) {
      return [{
        success: false,
        error: `Max hook emit depth (${MAX_EMIT_DEPTH}) exceeded — possible circular dependency`
      }]
    }

    const typeMap = this.handlers.get(type)
    if (!typeMap || typeMap.size === 0) return []

    this.depth++
    try {
      const results = await Promise.all(
        Array.from(typeMap.values()).map((handler) =>
          handler(ctx).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            return { success: false, error: message } as HookResult
          })
        )
      )
      return results
    } finally {
      this.depth--
    }
  }

  /**
   * Remove all handlers (testing helper).
   */
  removeAllHandlers(): void {
    this.handlers.clear()
  }
}

/**
 * Global singleton hook registry.
 * Initialized once per server lifecycle — register hooks at startup.
 */
let globalRegistry: HookRegistry | null = null

export function getHookRegistry(): HookRegistry {
  if (!globalRegistry) {
    globalRegistry = new HookRegistry()
  }
  return globalRegistry
}

/**
 * Reset the global registry (for testing only).
 */
export function resetHookRegistry(): void {
  if (globalRegistry) {
    globalRegistry.removeAllHandlers()
    globalRegistry = null
  }
}
