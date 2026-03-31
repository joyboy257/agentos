/**
 * approval-queue.ts — DOC-04
 *
 * Approval queue processor for non-blocking multi-agent waits.
 *
 * When an agent awaits approval, its tool call blocks on a Promise.
 * The approval-queue lets other agents in the same DAG continue executing
 * while one agent is paused — the runner doesn't block globally.
 *
 * Usage:
 *  - The runner's executeAgent() calls `waitForApproval()` instead of
 *    calling `executeTool()` directly when `requiresApproval: true`.
 *  - `waitForApproval()` enqueues the pending tool call in the queue
 *    and returns a promise that resolves when the user resolves the modal.
 *  - Meanwhile, other agents (not blocked by this approval) continue
 *    executing via the runner's normal concurrency loop.
 *
 * Design note: This queue is a coordination layer, NOT a persistence layer.
 * The actual pending approval state lives in `approval-manager.ts`
 * (in-memory Map). This queue just provides the async/await interface
 * that lets the runner yield without blocking the whole event loop.
 */

import { requestApproval, resolveApproval, ApprovalRequest, ResolvedApproval } from './approval-manager'

export { resolveApproval } from './approval-manager'

// ---------------------------------------------------------------------------
// Queue entry
// ---------------------------------------------------------------------------

interface QueuedApproval {
  request: ApprovalRequest
  resolve: (result: ResolvedApproval) => void
  reject: (err: Error) => void
}

// ---------------------------------------------------------------------------
// In-memory approval queue (per-process)
// ---------------------------------------------------------------------------

const approvalQueue: QueuedApproval[] = []

/**
 * Enqueue an approval request.
 * Returns a promise that resolves when the user handles the modal.
 *
 * This function is non-blocking — it enqueues the request and immediately
 * returns a promise. The actual `requestApproval()` call (which blocks
 * the calling agent) is deferred so the runner can continue processing
 * other agents in the meantime.
 */
export function enqueueApproval(
  request: ApprovalRequest
): Promise<ResolvedApproval> {
  return new Promise<ResolvedApproval>((resolve, reject) => {
    approvalQueue.push({ request, resolve, reject })

    // Actually request approval — this blocks the calling agent's async chain.
    // The runner continues executing other agents because the runner's
    // executeAgent() is itself async and awaits this.
    requestApproval(request)
      .then((result) => {
        // Remove from queue by reference comparison
        const idx = approvalQueue.findIndex((q) => q.request === request)
        if (idx !== -1) {
          approvalQueue.splice(idx, 1)
        }
        resolve(result)
      })
      .catch((err) => {
        const idx = approvalQueue.findIndex((q) => q.request === request)
        if (idx !== -1) {
          approvalQueue.splice(idx, 1)
        }
        reject(err)
      })
  })
}

/**
 * Wait for an approval — the primary interface used by the runner.
 *
 * Calls `requestApproval()` which:
 *  1. Freezes the event buffer (point-in-time snapshot)
 *  2. Stores the PendingApproval {resolve, reject} promise in the Map
 *  3. Emits `approval_required` SSE to the canvas
 *  4. Returns a Promise that blocks the calling agent until resolution
 *
 * Other agents in the runner's concurrency loop are NOT blocked because
 * `executeAgent()` is called via `.finally()` on its own async task.
 */
export async function waitForApproval(
  request: ApprovalRequest
): Promise<ResolvedApproval> {
  return await requestApproval(request)
}

/**
 * Get the number of pending approvals in the queue.
 */
export function getApprovalQueueDepth(): number {
  return approvalQueue.length
}

/**
 * Get all queued approval requests (for debugging / UI).
 */
export function getQueuedApprovals(): ApprovalRequest[] {
  return approvalQueue.map((q) => q.request)
}

/**
 * Clear the approval queue (for testing).
 */
export function clearApprovalQueue(): void {
  approvalQueue.length = 0
}
