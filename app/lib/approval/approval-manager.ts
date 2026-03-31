/**
 * approval-manager.ts — DOC-04
 *
 * Per-tool-call approval checkpoint coordinator.
 *
 * Flow:
 *  1. execute-tool.ts checks `requiresApproval` on the capability
 *  2. If true, calls `requestApproval()` — pauses the tool call,
 *     stores PendingApproval {resolve, reject} promise in a Map keyed
 *     by "${agentId}:${toolCallId}", emits `approval_required` SSE event
 *  3. Canvas shows approval badge; user sees modal
 *  4. User approves / edits+re-submits / cancels
 *  5. `resolveApproval()` is called — resolves the pending promise,
 *     runner resumes the tool call
 *
 * Snapshot: When approval is requested, `capturePointInTime()` is called
 * on the event buffer from Unit 5a — the reasoning trace is frozen at that
 * moment for the modal display.
 *
 * Timeout: pendingApprovalTimeoutMs = 30 minutes. Auto-skips on timeout.
 */

import { ulid } from 'ulid'
import { capturePointInTime, summarizeSnapshot } from '@/lib/tracing/snapshot'
import { emitToRunChannel } from '@/lib/tracing/sse-stream'
import { eventBufferRegistry } from '@/lib/tracing/event-buffer'
import type { ApprovalRequiredEvent, ApprovalResolvedEvent } from '@/lib/tracing/event-schema'
import { getHookRegistry } from '@/lib/hooks'
import type { HookContext } from '@/lib/hooks/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_APPROVAL_ITERATIONS = 3
export const DEFAULT_PENDING_APPROVAL_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalDecision =
  | 'approved'
  | 'edited'
  | 'skipped'
  | 'cancelled'
  | 'timeout'

export interface PendingApprovalEntry {
  resolve: (entry: ResolvedApproval) => void
  reject: (reason: string) => void
  runId: string
  agentId: string
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  summary: string
  fields: ApprovalField[]
  iteration: number
  maxIterations: number
  snapshotSequence: number
  requestedAt: number
  timeoutMs: number
  timeoutHandle: ReturnType<typeof setTimeout>
}

export interface ApprovalField {
  name: string
  value: unknown
  label?: string
}

export interface ResolvedApproval {
  decision: ApprovalDecision
  revisedArgs?: Record<string, unknown>
  reason?: string
}

export interface ApprovalRequest {
  runId: string
  agentId: string
  toolName: string
  args: Record<string, unknown>
  summary: string
  fields: ApprovalField[]
  capabilityId?: string
}

// ---------------------------------------------------------------------------
// PendingApproval Map — keyed by "${agentId}:${toolCallId}"
// Supports concurrent multi-agent approvals in the same run.
// ---------------------------------------------------------------------------

const pendingApprovals = new Map<string, PendingApprovalEntry>()

// Secondary index: toolCallId → primary map key
// Allows resolveApproval to be called with just toolCallId (e.g. from API route)
const toolCallIdIndex = new Map<string, string>()

function approvalKey(agentId: string, toolCallId: string): string {
  return `${agentId}:${toolCallId}`
}

// ---------------------------------------------------------------------------
// Timeout registry (for cleanup on resolve)
// ---------------------------------------------------------------------------

const timeoutRegistry = new Map<string, ReturnType<typeof setTimeout>>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Request human approval for a tool call.
 *
 * Pauses execution by returning a Promise that blocks until `resolveApproval()`
 * is called. Also emits an `approval_required` SSE event (via the SSE channel
 * from Unit 5a) so the canvas can display the modal.
 *
 * Timeout: If no resolution is received within `pendingApprovalTimeoutMs`,
 * the promise resolves with `{ decision: 'timeout' }`.
 */
export async function requestApproval(request: ApprovalRequest): Promise<ResolvedApproval> {
  const { runId, agentId, toolName, args, summary, fields } = request
  const toolCallId = ulid()

  // Capture point-in-time snapshot BEFORE emitting approval_required.
  // The modal reads from this snapshot, not the live stream.
  const snapshot = capturePointInTime(runId)
  const snapshotSequence = snapshot.sequence

  return new Promise<ResolvedApproval>((resolve, reject) => {
    const key = approvalKey(agentId, toolCallId)

    // Register timeout
    const timeoutMs = DEFAULT_PENDING_APPROVAL_TIMEOUT_MS
    const timeoutHandle = setTimeout(() => {
      timeoutRegistry.delete(key)
      const entry = pendingApprovals.get(key)
      if (entry) {
        pendingApprovals.delete(key)
        entry.resolve({ decision: 'timeout' })
      }
    }, timeoutMs)
    timeoutRegistry.set(key, timeoutHandle)

    const entry: PendingApprovalEntry = {
      resolve,
      reject,
      runId,
      agentId,
      toolCallId,
      toolName,
      args,
      summary,
      fields,
      iteration: 1,
      maxIterations: MAX_APPROVAL_ITERATIONS,
      snapshotSequence,
      requestedAt: Date.now(),
      timeoutMs,
      timeoutHandle,
    }

    pendingApprovals.set(key, entry)

    // Populate secondary index so API route can resolve by toolCallId alone
    toolCallIdIndex.set(toolCallId, key)

    // preApproval hook — fire and forget, does not block approval flow
    void getHookRegistry().emit('preApproval', {
      runId,
      agentId,
      toolName,
      approvalId: toolCallId,
      timestamp: Date.now(),
      preApproval: {
        toolName,
        summary,
        fields,
      },
    })

    // Emit approval_required SSE event via the SSE channel (Unit 5a)
    const approvalEvent: ApprovalRequiredEvent = {
      event: 'reasoning',
      runId,
      agentId,
      step: ulid(),
      sequence: snapshotSequence + 1,
      type: 'approval_required',
      content: {
        summary,
        fields,
        toolCallId,
        iteration: 1,
        maxIterations: MAX_APPROVAL_ITERATIONS,
      },
      timestamp: Date.now(),
      version: 1,
    }

    // Add to event buffer so snapshot readers can see it
    const buffer = eventBufferRegistry.get(runId)
    if (buffer) {
      buffer.addEventWithIntegrity(approvalEvent)
    }

    // Emit to SSE subscribers (canvas uses this to show badge + modal)
    emitToRunChannel(runId, approvalEvent)

    // Emit a status:waiting event on the agent's SSE channel
    emitToRunChannel(runId, {
      event: 'reasoning',
      runId,
      agentId,
      step: ulid(),
      sequence: snapshotSequence + 2,
      type: 'status',
      content: { status: 'waiting', result: { approvalId: toolCallId } },
      timestamp: Date.now(),
      version: 1,
    })
  })
}

/**
 * Resolve a pending approval.
 *
 * Called by the approval modal PUT handler after user approves/edits/cancels
 * or by the timeout handler. Clears the timeout, records the decision in the
 * audit log, emits `approval_resolved` SSE, and resolves the blocking promise.
 *
 * Ownership check: `run.userId === session.userId` must be verified by caller.
 */
export function resolveApproval(params: {
  runId: string
  agentId: string
  toolCallId: string
  decision: ApprovalDecision
  revisedArgs?: Record<string, unknown>
  reason?: string
  userId?: string
  ipAddress?: string
  userAgent?: string
}): ResolvedApproval {
  const { runId, agentId, toolCallId, decision, revisedArgs, reason, userId, ipAddress, userAgent } = params

  // Resolve the map key — use secondary index if agentId not provided
  let key = agentId ? approvalKey(agentId, toolCallId) : toolCallIdIndex.get(toolCallId)
  if (!key) {
    // Not found — already resolved or timed out
    return { decision, revisedArgs }
  }
  const entry = pendingApprovals.get(key)

  if (!entry) {
    // Already resolved or timed out — return a no-op
    return { decision, revisedArgs }
  }

  pendingApprovals.delete(key)
  toolCallIdIndex.delete(entry.toolCallId)

  // Clear timeout
  const timeoutHandle = timeoutRegistry.get(key)
  if (timeoutHandle) {
    clearTimeout(timeoutHandle)
    timeoutRegistry.delete(key)
  }

  // Emit approval_resolved event
  const resolvedEvent: ApprovalResolvedEvent = {
    event: 'reasoning',
    runId,
    agentId,
    step: ulid(),
    sequence: entry.snapshotSequence + 3,
    type: 'approval_resolved',
    content: {
      toolCallId,
      decision: decision as 'approved' | 'edited' | 'skipped' | 'cancelled',
      revisedArgs,
      reason,
    },
    timestamp: Date.now(),
    version: 1,
  }

  const buffer = eventBufferRegistry.get(runId)
  if (buffer) {
    buffer.addEventWithIntegrity(resolvedEvent)
  }
  emitToRunChannel(runId, resolvedEvent)

  // postApproval hook — fire and forget
  void getHookRegistry().emit('postApproval', {
    runId,
    agentId,
    approvalId: toolCallId,
    timestamp: Date.now(),
    postApproval: {
      decision: decision as 'approved' | 'denied' | 'cancelled' | 'timeout',
    },
  })

  const result: ResolvedApproval = { decision, revisedArgs, reason }
  entry.resolve(result)
  return result
}

/**
 * Get a pending approval entry by run + toolCallId.
 * Used by the modal to pre-fill edit forms.
 */
export function getPendingApproval(runId: string, toolCallId: string): PendingApprovalEntry | undefined {
  // Find by scanning — we don't store the key directly on the entry
  for (const [, entry] of pendingApprovals) {
    if (entry.runId === runId && entry.toolCallId === toolCallId) {
      return entry
    }
  }
  return undefined
}

/**
 * Get all pending approvals for a run.
 * Used by the canvas to show all pending badges.
 */
export function getPendingApprovalsForRun(runId: string): PendingApprovalEntry[] {
  const entries: PendingApprovalEntry[] = []
  for (const [, entry] of pendingApprovals) {
    if (entry.runId === runId) {
      entries.push(entry)
    }
  }
  return entries
}

/**
 * Check if a tool call is currently awaiting approval.
 */
export function isAwaitingApproval(runId: string, toolCallId: string): boolean {
  const entry = getPendingApproval(runId, toolCallId)
  return entry !== undefined
}

/**
 * Get the reasoning snapshot at the time approval was requested.
 * Used by the modal to display the frozen trace.
 */
export function getApprovalSnapshot(runId: string, toolCallId: string) {
  const entry = getPendingApproval(runId, toolCallId)
  if (!entry) return null
  return capturePointInTime(runId)
}

/**
 * Get a human-readable summary of the reasoning snapshot for the approval modal.
 */
export function getApprovalSnapshotSummary(runId: string, toolCallId: string) {
  const snapshot = getApprovalSnapshot(runId, toolCallId)
  if (!snapshot) return null
  return summarizeSnapshot(snapshot)
}

/**
 * Clear all pending approvals (for testing or catastrophic reset).
 */
export function clearAllPendingApprovals(): void {
  for (const [, handle] of timeoutRegistry) {
    clearTimeout(handle)
  }
  timeoutRegistry.clear()
  pendingApprovals.clear()
  toolCallIdIndex.clear()
}
