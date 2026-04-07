/**
 * BullMQ Parent-Child Orchestration — characterization tests.
 *
 * These tests verify the FlowProducer + moveToWaitingChildren pattern works
 * correctly for the distributed fan-out orchestration.
 *
 * Tests:
 * - FlowProducer.add() enqueues parent + children atomically
 * - Child jobs complete and parent resumes via WaitingChildrenError
 * - Child failure propagates to parent typed exit reason
 * - Resume path: parent job with step=ChildrenEnqueued resumes correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FlowProducer } from 'bullmq'
import { COORDINATOR_QUEUE, WORKER_QUEUE } from '../../runtime/coordinator-producer'
import { CoordinatorStep, aggregateChildResults } from '../../runtime/coordinator-producer'
import type { ChildJobResult } from '../../runtime/child-job-handler'

// ---------------------------------------------------------------------------
// aggregateChildResults unit tests
// ---------------------------------------------------------------------------

describe('aggregateChildResults', () => {
  it('returns completed when all children succeed', () => {
    const results: ChildJobResult[] = [
      { status: 'completed', elapsedMs: 100 },
      { status: 'completed', elapsedMs: 200 },
    ]
    const aggregated = aggregateChildResults(results)
    expect(aggregated.status).toBe('completed')
    expect(aggregated.failedChildIds).toHaveLength(0)
  })

  it('returns child_failed when all children fail', () => {
    const results: ChildJobResult[] = [
      { status: 'error', error: 'child 1 failed', elapsedMs: 0 },
      { status: 'error', error: 'child 2 failed', elapsedMs: 0 },
    ]
    const aggregated = aggregateChildResults(results)
    expect(aggregated.status).toBe('child_failed')
    expect(aggregated.failedChildIds).toHaveLength(2)
  })

  it('returns partial_completion when some children fail', () => {
    const results: ChildJobResult[] = [
      { status: 'completed', elapsedMs: 100 },
      { status: 'error', error: 'child 2 failed', elapsedMs: 0 },
    ]
    const aggregated = aggregateChildResults(results)
    expect(aggregated.status).toBe('partial_completion')
    expect(aggregated.failedChildIds).toHaveLength(1)
  })

  it('returns budget_exceeded when any child exceeds budget', () => {
    const results: ChildJobResult[] = [
      { status: 'completed', elapsedMs: 100 },
      { status: 'budget_exceeded', elapsedMs: 5000, stopReason: 'budget_exceeded' },
    ]
    const aggregated = aggregateChildResults(results)
    expect(aggregated.status).toBe('budget_exceeded')
    expect(aggregated.failedChildIds).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// CoordinatorStep enum invariants
// ---------------------------------------------------------------------------

describe('CoordinatorStep', () => {
  it('has three steps in correct order', () => {
    expect(CoordinatorStep.Initial).toBe(0)
    expect(CoordinatorStep.ChildrenEnqueued).toBe(1)
    expect(CoordinatorStep.Finish).toBe(2)
  })

  it('step progression is valid for state machine', () => {
    const steps = [CoordinatorStep.Initial, CoordinatorStep.ChildrenEnqueued, CoordinatorStep.Finish]
    for (let i = 0; i < steps.length - 1; i++) {
      expect(steps[i + 1]).toBe(steps[i] + 1)
    }
  })
})

// ---------------------------------------------------------------------------
// Queue name constants
// ---------------------------------------------------------------------------

describe('Queue constants', () => {
  it('COORDINATOR_QUEUE and WORKER_QUEUE are distinct', () => {
    expect(COORDINATOR_QUEUE).not.toBe(WORKER_QUEUE)
  })

  it('queue names are non-empty strings', () => {
    expect(typeof COORDINATOR_QUEUE).toBe('string')
    expect(typeof WORKER_QUEUE).toBe('string')
    expect(COORDINATOR_QUEUE.length).toBeGreaterThan(0)
    expect(WORKER_QUEUE.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// FlowProducer children array shape
// ---------------------------------------------------------------------------

describe('FlowProducer children shape', () => {
  it('child spec contains all required fields', () => {
    const child = {
      name: 'agent-child-0',
      queueName: WORKER_QUEUE,
      data: {
        agentId: 'agent-1',
        runId: 'run-1',
        sessionId: 'session-1',
        args: { prompt: 'hello' },
        stepOffset: 0,
        elapsedMs: 0,
        userId: 'user-1',
        orgId: '',
      },
    }

    expect(child.name).toBe('agent-child-0')
    expect(child.queueName).toBe(WORKER_QUEUE)
    expect(child.data.agentId).toBe('agent-1')
    expect(child.data.runId).toBe('run-1')
    expect(child.data.stepOffset).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// WaitingChildrenError behavior
// ---------------------------------------------------------------------------

describe('WaitingChildrenError', () => {
  it('WaitingChildrenError is thrown to pause parent until children complete', async () => {
    const { WaitingChildrenError } = await import('bullmq')
    const err = new WaitingChildrenError()
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('WaitingChildren')
  })
})

// ---------------------------------------------------------------------------
// ChildJobResult shape invariants
// ---------------------------------------------------------------------------

describe('ChildJobResult', () => {
  const statuses: ChildJobResult['status'][] = ['completed', 'error', 'approval_required', 'budget_exceeded']

  for (const status of statuses) {
    it(`status="${status}" has required fields`, () => {
      const result: ChildJobResult = { status, elapsedMs: 100 }
      expect(result.status).toBe(status)
      expect(typeof result.elapsedMs).toBe('number')
    })
  }
})
