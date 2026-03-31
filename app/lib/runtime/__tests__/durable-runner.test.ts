import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DurableRunner } from '../durable-runner';
import * as queries from '../../db/queries';

// Mock the DB queries
vi.mock('../../db/queries');

const mockQueries = queries as any;

describe('DurableRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a run row when execution starts', async () => {
    mockQueries.createRun.mockResolvedValue({ id: 'run-1', status: 'running' });
    mockQueries.getPendingApprovalsForRun.mockResolvedValue([]);
    mockQueries.updateRunStatus.mockResolvedValue(undefined);

    const runner = new DurableRunner();
    const result = await runner.execute({
      agentId: 'agent-1',
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(mockQueries.createRun).toHaveBeenCalledWith({
      agent_id: 'agent-1',
      user_id: 'user-1',
    });
    expect(result.runId).toBe('run-1');
  });

  it('returns waiting_for_approval when pending approvals exist', async () => {
    mockQueries.createRun.mockResolvedValue({ id: 'run-1', status: 'running' });
    mockQueries.getPendingApprovalsForRun.mockResolvedValue([
      { id: 'approval-1', status: 'pending' }
    ]);

    const runner = new DurableRunner();
    const result = await runner.execute({
      agentId: 'agent-1',
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(result.status).toBe('waiting_for_approval');
    expect(mockQueries.updateRunStatus).not.toHaveBeenCalled();
  });

  it('resume() recovers checkpoints and continues', async () => {
    mockQueries.getCheckpointsForRun.mockResolvedValue([
      {
        id: 'cp-1',
        run_id: 'run-1',
        step: 0,
        state_before: { agentId: 'agent-1' },
        state_after: { agentId: 'agent-1', completed: true },
        tool_call_id: 'key-1',
        tool_result: { success: true },
      },
      {
        id: 'cp-2',
        run_id: 'run-1',
        step: 1,
        state_before: { agentId: 'agent-1' },
        state_after: null, // incomplete
        tool_call_id: 'key-2',
        tool_result: null,
      },
    ]);
    mockQueries.getRun.mockResolvedValue({ id: 'run-1', status: 'running' });
    mockQueries.getPendingApprovalsForRun.mockResolvedValue([]);
    mockQueries.updateRunStatus.mockResolvedValue(undefined);

    const runner = new DurableRunner();
    const result = await runner.resume('run-1');

    expect(result.status).toBe('completed');
    expect(mockQueries.updateRunStatus).toHaveBeenCalledWith('run-1', 'completed', expect.any(Date));
  });
});
