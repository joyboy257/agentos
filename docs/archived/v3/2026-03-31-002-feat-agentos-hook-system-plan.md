---
title: "feat: Hook System for Agent Lifecycle Reactivity"
type: feat
status: active
date: 2026-03-31
---

# Hook System for Agent Lifecycle Reactivity

## Overview

Implement a TypeScript hook system that allows canvas components and external integrations to subscribe to agent lifecycle events. When agents start, complete, error, or call tools, registered hooks fire — enabling real-time canvas UI updates without manual SSE subscriptions.

## Problem Frame

Currently, the canvas UI must manually subscribe to the SSE event stream to update node statuses. This creates tight coupling between canvas components and SSE infrastructure. A hook system:

- Decouples canvas from SSE — components register hooks, runner emits events
- Enables third-party integrations (analytics, notifications) without runner modifications
- Provides a clean extension point for future capabilities (A2A events, memory events)

## Requirements Trace

- R6 (from MVP): Reasoning trace per run — hook system replaces manual SSE subscriptions as the primary canvas update mechanism
- R1 (from MVP): NL-to-canvas pipeline builder — hook system enables real-time canvas visualization of agent execution

## Key Technical Decisions

**Decision: EventEmitter pattern over callback functions.**
- Rationale: EventEmitter is standard Node.js, supports multiple listeners per event, and can be composed into larger systems.
- Alternative: Callback functions — rejected because they don't support multiple subscribers and create memory leak risks without explicit unregistration.

**Decision: Hooks are async by default.**
- Rationale: Hooks may call external services (analytics, notifications) which are I/O-bound. Async prevents blocking agent execution.
- Exception: Pre-agent hooks that modify agent config must be sync and are explicitly flagged.

**Decision: Hooks do not modify agent behavior by default (fire-and-forget).**
- Rationale: Modifying agent behavior from hooks creates hard-to-debug chains. Pre-agent hooks that need to modify behavior use a special `intercept` flag.

## Scope Boundaries

- **In-process hooks only** — no cross-process or HTTP hook delivery for v1
- **Hook persistence** — hooks are registered at startup, not persisted across restarts
- **Hook retry** — failed hook calls are logged but not retried
- **Pre-agent intercept hooks** — out of scope for v1 (complex, rarely needed)

## High-Level Technical Design

```
┌────────────────────────────────────────────────────────────────┐
│                         Runner                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    HookRegistry                          │   │
│  │  preAgentRun:  [ analyticsHook, uiHook ]               │   │
│  │  postAgentRun: [ uiHook, notificationHook ]            │   │
│  │  preToolCall:  [ piiAuditHook ]                        │   │
│  │  postToolCall: [ traceHook, piiAuditHook ]             │   │
│  │  preApproval:   [ notificationHook ]                    │   │
│  │  postApproval:  [ traceHook, uiHook ]                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌──────────┐  ┌──────────┐  │  ┌──────────┐  ┌──────────┐     │
│  │Analytics │  │  Canvas  │  │  │  Trace   │  │ Notifs   │     │
│  │ Service  │  │    UI    │  │  │  Store   │  │ Service  │     │
│  └──────────┘  └──────────┘  │  └──────────┘  └──────────┘     │
└──────────────────────────────┼─────────────────────────────────┘
                               │ HookContext (serializable)
                               ▼
              Canvas updates, SSE events, analytics pings
```

### Hook Types

```typescript
type HookType =
  | 'preAgentRun'      // Before agent starts executing
  | 'postAgentRun'     // After agent completes (success, error, or cancelled)
  | 'preToolCall'      // Before a tool is called
  | 'postToolCall'     // After a tool returns
  | 'preApproval'      // Before approval is requested
  | 'postApproval'     // After approval is resolved (approved, denied, cancelled, timeout)
  | 'runComplete'      // After entire run finishes
  | 'runError'         // When run encounters a fatal error

interface HookContext {
  runId: string
  agentId?: string
  toolName?: string
  approvalId?: string
  timestamp: number
  // Type-specific fields
  preAgentRun?: { agentRole: string; tools: string[] }
  postAgentRun?: { agentRole: string; status: 'completed' | 'error'; output?: AgentOutput }
  preToolCall?: { toolName: string; args: Record<string, unknown> }
  postToolCall?: { toolName: string; result: ToolResult; durationMs: number }
  preApproval?: { toolName: string; summary: string; fields: ApprovalField[] }
  postApproval?: { decision: 'approved' | 'denied' | 'cancelled' | 'timeout' }
}

interface HookResult {
  success: boolean
  error?: string
}
```

## Implementation Units

- [ ] **Unit 1: HookRegistry Core**

**Goal:** EventEmitter-based hook registry that runner emits events into.

**Requirements:** R6

**Files:**
- Create: `lib/hooks/hook-registry.ts`
- Create: `lib/hooks/types.ts` (HookType, HookContext, HookResult, HookHandler)
- Create: `lib/hooks/index.ts`
- Test: `lib/hooks/__tests__/hook-registry.test.ts`

**Approach:**
- `HookRegistry` class extends `EventEmitter`
- `register(type: HookType, name: string, handler: HookHandler): void`
- `unregister(type: HookType, name: string): void`
- `emit(type: HookType, ctx: HookContext): Promise<HookResult[]>` — awaits all handlers
- All handlers wrapped in try/catch — failures logged, don't propagate

**Patterns to follow:**
- Node.js `EventEmitter` API design
- `lib/tracing/trace-emitter.ts` for event emission pattern

**Test scenarios:**
- Register handler, emit event, handler is called with correct context
- Multiple handlers registered for same type, all are called
- Handler that throws is caught, other handlers still run
- Unregister removes handler, no further calls

**Verification:**
- `npx vitest --run lib/hooks/__tests__/hook-registry.test.ts` passes

---

- [ ] **Unit 2: Runner Hook Integration**

**Goal:** Runner emits lifecycle events via HookRegistry at appropriate points.

**Requirements:** R6

**Files:**
- Modify: `lib/runtime/runner.ts` — emit hook events at agent lifecycle points
- Modify: `lib/runtime/runner.ts` — emit tool call hooks (pre/post)
- Modify: `lib/approval/approval-manager.ts` — emit approval hooks (pre/post)
- Modify: `lib/hooks/types.ts` — add runner-specific context types

**Approach:**
- Runner creates a `HookRegistry` instance at startup (singleton per runner instance)
- Canvas components call `getHookRegistry()` to access the registry
- Hooks emitted at: agent start, agent complete, tool call pre/post, approval pre/post, run complete, run error
- Hook context is serializable (no circular refs, all plain objects)

**Patterns to follow:**
- Existing event emission in `trace-emitter.ts`
- Approval event pattern in `approval-manager.ts`

**Test scenarios:**
- Runner emits `preAgentRun` before executing agent
- Runner emits `postAgentRun` after agent completes
- Runner emits `postToolCall` with durationMs
- Approval emits `preApproval` and `postApproval`

**Verification:**
- Add hook assertions to existing runner tests

---

- [ ] **Unit 3: Canvas Hook Subscriptions**

**Goal:** Canvas components use HookRegistry instead of manual SSE subscriptions for UI updates.

**Requirements:** R6, R1

**Files:**
- Modify: `components/reasoning-panel.tsx` — use hooks instead of SSE subscription
- Modify: `components/agent-card.tsx` — use hooks for status updates
- Create: `lib/hooks/use-agent-hooks.ts` (React hook for hook registration)

**Approach:**
```typescript
// React hook for canvas components
function useAgentHooks(runId: string) {
  const registry = getHookRegistry()
  const [, forceUpdate] = useReducer(x => x + 1, 0)

  useEffect(() => {
    const handler = async (ctx: HookContext) => {
      forceUpdate()  // Re-render on any hook event
    }
    registry.register('postAgentRun', 'canvas-ui', handler)
    return () => registry.unregister('postAgentRun', 'canvas-ui')
  }, [runId])
}
```

**Patterns to follow:**
- React `useEffect` + cleanup pattern
- `components/reasoning-panel.tsx` for current SSE subscription

**Test scenarios:**
- Canvas updates within 100ms of agent completion (via hook, not SSE poll)
- Hook cleanup on component unmount
- Multiple canvas components can register same hook type

**Verification:**
- Manual: open canvas, run agent, verify UI updates without page refresh

---

- [ ] **Unit 4: Hook SSE Bridge (for Remote Subscribers)**

**Goal:** External consumers (mobile clients, other services) can subscribe to hook events via SSE, using the existing SSE infrastructure.

**Requirements:** R6

**Files:**
- Create: `lib/hooks/hook-sse-bridge.ts` (subscribes to HookRegistry, emits SSE events)
- Modify: `app/api/runs/[runId]/events/route.ts` — hook events merged into SSE stream
- Test: `lib/hooks/__tests__/hook-sse-bridge.test.ts`

**Approach:**
- `HookSSEBridge` class implements `HookHandler` and subscribes to all hook types
- On hook event, formats as SSE message and enqueues to existing `SSEStream` per run
- Bridge registered once at server startup
- No new endpoints — existing `/api/runs/[runId]/events` carries hook events

**Patterns to follow:**
- `lib/tracing/sse-stream.ts` for SSE stream implementation
- `app/api/runs/[runId]/events/route.ts` for SSE route

**Test scenarios:**
- Hook event appears in SSE stream within 50ms
- SSE stream correctly multiplexes hook events with trace events

**Verification:**
- SSE client connects to events endpoint, sees hook events fire in real-time

---

## System-Wide Impact

- **Runner:** Becomes event emitter — no behavior change, just adds `emit()` calls
- **Canvas:** Canvas components refactored from SSE subscription to hook registration
- **SSE API:** Now carries hook events alongside tracing events
- **Tracing:** Hook events are traced, but hook system is a separate concern from trace-emitter

## Risks & Dependencies

- **Hook blocking:** If a hook handler is slow, it delays subsequent hooks in the emit chain. Mitigation: all handlers run in parallel via `Promise.all`.
- **Memory leaks:** Forgotten hooks (no unregister) accumulate. Mitigation: React hooks pattern with cleanup, documentation requiring unregister.
- **Circular hook dependencies:** If hook A triggers hook B and B triggers A. Mitigation: depth limit in emit chain (max 3 hops).

## Documentation / Operational Notes

- Document hook types in `docs/hooks.md`
- Document React integration pattern (`useAgentHooks` hook)
- Document "hook guidelines" — hooks should be idempotent, fast, and not throw

## Sources & References

- `agentscope/src/agentscope/agent/_agent_base.py` — AgentScope hook system reference
- Node.js `EventEmitter` API documentation
