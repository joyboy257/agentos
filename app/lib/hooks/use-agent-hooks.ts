/**
 * useAgentHooks — React hook for canvas components to subscribe to hook events.
 *
 * Replaces manual SSE subscriptions with hook registration.
 * Automatically cleans up on unmount to prevent memory leaks.
 *
 * Usage:
 *   function MyCanvasComponent({ runId }: { runId: string }) {
 *     const registry = useAgentHooks(runId, {
 *       onPostAgentRun: (ctx) => { ... },
 *       onPostToolCall: (ctx) => { ... },
 *     })
 *     ...
 *   }
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { getHookRegistry } from './hook-registry'
import type { HookType, HookContext, HookResult, HookHandler } from './types'

type HookCallback = (ctx: HookContext) => void | Promise<void>

export interface UseAgentHooksOptions {
  onPreAgentRun?: HookCallback
  onPostAgentRun?: HookCallback
  onPreToolCall?: HookCallback
  onPostToolCall?: HookCallback
  onPreApproval?: HookCallback
  onPostApproval?: HookCallback
  onRunComplete?: HookCallback
  onRunError?: HookCallback
}

function buildHandlers(
  options: UseAgentHooksOptions,
  forceUpdate: () => void
): Array<{ type: HookType; name: string; handler: HookHandler }> {
  const handlers: Array<{ type: HookType; name: string; handler: HookHandler }> = []

  if (options.onPreAgentRun) {
    handlers.push({
      type: 'preAgentRun',
      name: 'canvas-ui-pre-agent',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onPreAgentRun?.(ctx); return { success: true } }
    })
  }
  if (options.onPostAgentRun) {
    handlers.push({
      type: 'postAgentRun',
      name: 'canvas-ui-post-agent',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onPostAgentRun?.(ctx); return { success: true } }
    })
  }
  if (options.onPreToolCall) {
    handlers.push({
      type: 'preToolCall',
      name: 'canvas-ui-pre-tool',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onPreToolCall?.(ctx); return { success: true } }
    })
  }
  if (options.onPostToolCall) {
    handlers.push({
      type: 'postToolCall',
      name: 'canvas-ui-post-tool',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onPostToolCall?.(ctx); return { success: true } }
    })
  }
  if (options.onPreApproval) {
    handlers.push({
      type: 'preApproval',
      name: 'canvas-ui-pre-approval',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onPreApproval?.(ctx); return { success: true } }
    })
  }
  if (options.onPostApproval) {
    handlers.push({
      type: 'postApproval',
      name: 'canvas-ui-post-approval',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onPostApproval?.(ctx); return { success: true } }
    })
  }
  if (options.onRunComplete) {
    handlers.push({
      type: 'runComplete',
      name: 'canvas-ui-run-complete',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onRunComplete?.(ctx); return { success: true } }
    })
  }
  if (options.onRunError) {
    handlers.push({
      type: 'runError',
      name: 'canvas-ui-run-error',
      handler: async (ctx): Promise<HookResult> => { forceUpdate(); await options.onRunError?.(ctx); return { success: true } }
    })
  }

  return handlers
}

/**
 * React hook for canvas components to subscribe to agent lifecycle hooks.
 *
 * Registers all provided handlers with the global HookRegistry on mount,
 * forces a re-render on each hook event (so components can update their state),
 * and cleans up all registrations on unmount.
 *
 * Returns the registry instance so callers can access it if needed.
 */
export function useAgentHooks(
  runId: string | null,
  options: UseAgentHooksOptions = {}
): ReturnType<typeof getHookRegistry> {
  const [, setRenderKey] = useState(0)
  const forceUpdate = useCallback(() => {
    setRenderKey(k => k + 1)
  }, [])

  const handlersRef = useRef<Array<{ type: HookType; name: string; handler: HookHandler }>>([])

  useEffect(() => {
    if (!runId) return

    const registry = getHookRegistry()
    const handlers = buildHandlers(options, forceUpdate)
    handlersRef.current = handlers

    for (const { type, name, handler } of handlers) {
      registry.register(type, name, handler)
    }

    return () => {
      for (const { type, name } of handlersRef.current) {
        registry.unregister(type, name)
      }
      handlersRef.current = []
    }
  }, [runId, options]) // eslint-disable-line react-hooks/exhaustive-deps

  return getHookRegistry()
}
