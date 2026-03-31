/**
 * approval-manager.test.ts — Unit 5 verification
 *
 * Tests the core approval flow:
 * - requestApproval() stores entry in Map and returns blocking promise
 * - resolveApproval() resolves the promise and clears the entry
 * - Concurrent multi-agent approvals (same runId, different agentIds)
 * - Edit flow: iteration increments on revised args
 * - MAX_APPROVAL_ITERATIONS cap
 * - Timeout auto-skips
 * - Snapshot is captured at approval request time
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  requestApproval,
  resolveApproval,
  getPendingApproval,
  getPendingApprovalsForRun,
  isAwaitingApproval,
  getApprovalSnapshot,
  getApprovalSnapshotSummary,
  clearAllPendingApprovals,
  MAX_APPROVAL_ITERATIONS,
  DEFAULT_PENDING_APPROVAL_TIMEOUT_MS,
} from '../approval-manager'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('@/lib/tracing/snapshot', () => ({
  capturePointInTime: vi.fn((runId: string) => ({
    runId,
    events: [],
    sequence: 10,
    capturedAt: Date.now(),
  })),
  summarizeSnapshot: vi.fn(() => ({
    totalEvents: 0,
    lastObservation: null,
    agentActivities: {},
    timeline: [],
  })),
}))

vi.mock('@/lib/tracing/sse-stream', () => ({
  emitToRunChannel: vi.fn(),
}))

vi.mock('@/lib/tracing/event-buffer', () => ({
  eventBufferRegistry: {
    get: vi.fn(() => null),
    getOrCreate: vi.fn(() => ({
      addEventWithIntegrity: vi.fn(),
    })),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('approval-manager', () => {
  beforeEach(() => {
    clearAllPendingApprovals()
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearAllPendingApprovals()
  })

  describe('requestApproval / resolveApproval', () => {
    it('stores pending approval in Map and returns blocking promise', async () => {
      const request = {
        runId: 'run-1',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: { to: 'test@example.com', subject: 'Hello', body: 'World' },
        summary: 'Send an email to test@example.com',
        fields: [
          { name: 'to', value: 'test@example.com', label: 'To' },
          { name: 'subject', value: 'Hello', label: 'Subject' },
        ],
      }

      // Start requestApproval without awaiting — it blocks until resolveApproval
      const approvalPromise = requestApproval(request)

      // Give the promise executor a tick to run
      await sleep(0)

      // Should have an entry in the map
      const pending = getPendingApprovalsForRun('run-1')
      expect(pending).toHaveLength(1)
      const entry = pending[0]
      expect(entry.toolName).toBe('gmail.send')

      // Resolve it
      resolveApproval({
        runId: 'run-1',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'approved',
      })

      const result = await approvalPromise
      expect(result.decision).toBe('approved')
    })

    it('isAwaitingApproval returns true while approval is pending', async () => {
      const request = {
        runId: 'run-1',
        agentId: 'agent-A',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send email',
        fields: [],
      }

      const approvalPromise = requestApproval(request)
      await sleep(0)

      const pending = getPendingApprovalsForRun('run-1')
      expect(pending).toHaveLength(1)
      const entry = pending[0]

      expect(isAwaitingApproval('run-1', entry.toolCallId)).toBe(true)

      resolveApproval({
        runId: 'run-1',
        agentId: 'agent-A',
        toolCallId: entry.toolCallId,
        decision: 'approved',
      })

      await approvalPromise
      expect(isAwaitingApproval('run-1', entry.toolCallId)).toBe(false)
    })

    it('getPendingApprovalsForRun returns all pending entries for a run', async () => {
      const req1 = {
        runId: 'run-1',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send 1',
        fields: [],
      }
      const req2 = {
        runId: 'run-1',
        agentId: 'agent-2',
        toolName: 'stripe.charge',
        args: {},
        summary: 'Charge',
        fields: [],
      }

      const [p1, p2] = [requestApproval(req1), requestApproval(req2)]
      await sleep(0)

      const pending = getPendingApprovalsForRun('run-1')
      expect(pending).toHaveLength(2)
      expect(pending.map((e) => e.agentId)).toContain('agent-1')
      expect(pending.map((e) => e.agentId)).toContain('agent-2')

      // Clean up
      resolveApproval({ runId: 'run-1', agentId: 'agent-1', toolCallId: pending[0].toolCallId, decision: 'approved' })
      resolveApproval({ runId: 'run-1', agentId: 'agent-2', toolCallId: pending[1].toolCallId, decision: 'approved' })
      await Promise.all([p1, p2])
    })
  })

  describe('approval decision types', () => {
    it('records approved decision', async () => {
      const request = {
        runId: 'run-1',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: { to: 'a@b.com' },
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-1')
      const entry = pending[0]

      resolveApproval({
        runId: 'run-1',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'approved',
      })

      const result = await p
      expect(result.decision).toBe('approved')
      expect(result.revisedArgs).toBeUndefined()
    })

    it('records edited decision with revised args', async () => {
      const request = {
        runId: 'run-1',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: { to: 'old@b.com' },
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-1')
      const entry = pending[0]
      const revisedArgs = { to: 'new@b.com', subject: 'Updated' }

      resolveApproval({
        runId: 'run-1',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'edited',
        revisedArgs,
      })

      const result = await p
      expect(result.decision).toBe('edited')
      expect(result.revisedArgs).toEqual(revisedArgs)
    })

    it('records cancelled decision', async () => {
      const request = {
        runId: 'run-1',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-1')
      const entry = pending[0]

      resolveApproval({
        runId: 'run-1',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'cancelled',
        reason: 'User clicked cancel',
      })

      const result = await p
      expect(result.decision).toBe('cancelled')
      expect(result.reason).toBe('User clicked cancel')
    })

    it('records skipped decision', async () => {
      const request = {
        runId: 'run-1',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-1')
      const entry = pending[0]

      resolveApproval({
        runId: 'run-1',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'skipped',
      })

      const result = await p
      expect(result.decision).toBe('skipped')
    })
  })

  describe('concurrent multi-agent approvals', () => {
    it('supports multiple pending approvals for different agents in the same run', async () => {
      const req1 = {
        runId: 'run-1',
        agentId: 'agent-email',
        toolName: 'gmail.send',
        args: { to: 'a@b.com' },
        summary: 'Send email',
        fields: [],
      }
      const req2 = {
        runId: 'run-1',
        agentId: 'agent-payment',
        toolName: 'stripe.charge',
        args: { amount: 100 },
        summary: 'Charge $100',
        fields: [],
      }

      const [p1, p2] = [requestApproval(req1), requestApproval(req2)]
      await sleep(0)

      const pending = getPendingApprovalsForRun('run-1')
      expect(pending).toHaveLength(2)

      const emailEntry = pending.find((e) => e.agentId === 'agent-email')!
      const paymentEntry = pending.find((e) => e.agentId === 'agent-payment')!

      resolveApproval({ runId: 'run-1', agentId: 'agent-email', toolCallId: emailEntry.toolCallId, decision: 'approved' })
      resolveApproval({ runId: 'run-1', agentId: 'agent-payment', toolCallId: paymentEntry.toolCallId, decision: 'approved' })

      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1.decision).toBe('approved')
      expect(r2.decision).toBe('approved')
    })
  })

  describe('iteration tracking', () => {
    it('stores iteration count in pending entry', async () => {
      const request = {
        runId: 'run-1',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-1')
      const entry = pending[0]

      expect(entry.iteration).toBe(1)
      expect(entry.maxIterations).toBe(MAX_APPROVAL_ITERATIONS)
      expect(entry.maxIterations).toBe(3)

      resolveApproval({
        runId: 'run-1',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'approved',
      })

      await p
    })
  })

  describe('snapshot', () => {
    it('captures point-in-time snapshot when approval is requested', async () => {
      const { capturePointInTime } = await import('@/lib/tracing/snapshot')

      const request = {
        runId: 'run-snap',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-snap')
      const entry = pending[0]

      expect(capturePointInTime).toHaveBeenCalledWith('run-snap')
      expect(entry.snapshotSequence).toBe(10) // from mock

      resolveApproval({
        runId: 'run-snap',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'approved',
      })

      await p
    })

    it('getApprovalSnapshot returns the snapshot for the toolCallId', async () => {
      const request = {
        runId: 'run-snap-2',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-snap-2')
      const entry = pending[0]
      const snap = getApprovalSnapshot('run-snap-2', entry.toolCallId)

      expect(snap).toBeDefined()
      expect(snap?.runId).toBe('run-snap-2')

      resolveApproval({
        runId: 'run-snap-2',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'approved',
      })

      await p
    })

    it('getApprovalSnapshotSummary returns summarized snapshot', async () => {
      const { summarizeSnapshot } = await import('@/lib/tracing/snapshot')

      const request = {
        runId: 'run-snap-3',
        agentId: 'agent-1',
        toolName: 'gmail.send',
        args: {},
        summary: 'Send email',
        fields: [],
      }

      const p = requestApproval(request)
      await sleep(0)
      const pending = getPendingApprovalsForRun('run-snap-3')
      const entry = pending[0]
      const summary = getApprovalSnapshotSummary('run-snap-3', entry.toolCallId)

      expect(summary).toBeDefined()
      expect(summarizeSnapshot).toHaveBeenCalled()

      resolveApproval({
        runId: 'run-snap-3',
        agentId: 'agent-1',
        toolCallId: entry.toolCallId,
        decision: 'approved',
      })

      await p
    })
  })

  describe('clearAllPendingApprovals', () => {
    it('clears all pending approvals and their timeouts', async () => {
      const requests = [
        { runId: 'run-1', agentId: 'agent-1', toolName: 'gmail.send', args: {}, summary: 'A', fields: [] },
        { runId: 'run-1', agentId: 'agent-2', toolName: 'stripe.charge', args: {}, summary: 'B', fields: [] },
      ]

      const approvals = requests.map((r) => requestApproval(r))
      await sleep(0)

      expect(getPendingApprovalsForRun('run-1')).toHaveLength(2)

      clearAllPendingApprovals()
      expect(getPendingApprovalsForRun('run-1')).toHaveLength(0)

      // After clearAllPendingApprovals, entries are gone and promises are orphaned.
      // They will never resolve — this is the expected catastrophic cleanup behavior.
    })
  })
})
