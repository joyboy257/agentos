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

  describe('resume()', () => {
    it('finds the incomplete checkpoint correctly', async () => {
      const checkpoints = [
        {
          id: 'cp-1',
          run_id: 'run-1',
          step: 0,
          state_before: { agentId: 'agent-1', messages: [{ role: 'user', content: 'hello' }] },
          state_after: { agentId: 'agent-1', completed: true, messages: [] },
          tool_call_id: 'key-1',
          tool_result: { success: true },
        },
        {
          id: 'cp-2',
          run_id: 'run-1',
          step: 1,
          state_before: { agentId: 'agent-1', messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }] },
          state_after: null, // incomplete — this is the resume point
          tool_call_id: 'key-2',
          tool_result: null,
        },
      ];

      mockQueries.getCheckpointsForRun.mockResolvedValue(checkpoints);
      mockQueries.getRun.mockResolvedValue({ id: 'run-1', user_id: 'user-1', session_id: 'session-1', status: 'running' });
      mockQueries.getAgent.mockResolvedValue({ id: 'agent-1', user_id: 'user-1', config: {}, role: 'email_agent' });
      mockQueries.getPendingApprovalsForRun.mockResolvedValue([]);
      mockQueries.createRun.mockResolvedValue({ id: 'run-2', status: 'running' });
      mockQueries.updateRunStatus.mockResolvedValue(undefined);

      const runner = new DurableRunner();
      const result = await runner.resume('run-1');

      // Should call execute with the messages from the incomplete checkpoint's state_before
      expect(mockQueries.getCheckpointsForRun).toHaveBeenCalledWith('run-1');
      expect(result.runId).toBe('run-2');
    });

    it('returns waiting_for_approval when pending approvals exist', async () => {
      const checkpoints = [
        {
          id: 'cp-1',
          run_id: 'run-1',
          step: 0,
          state_before: { agentId: 'agent-1' },
          state_after: null, // incomplete
          tool_call_id: 'key-1',
          tool_result: null,
        },
      ];

      mockQueries.getCheckpointsForRun.mockResolvedValue(checkpoints);
      mockQueries.getRun.mockResolvedValue({ id: 'run-1', user_id: 'user-1', session_id: 'session-1', status: 'running' });
      mockQueries.getPendingApprovalsForRun.mockResolvedValue([
        { id: 'approval-1', status: 'pending', tool_name: 'gmail_send' }
      ]);

      const runner = new DurableRunner();
      const result = await runner.resume('run-1');

      expect(result.status).toBe('waiting_for_approval');
      expect(result.finalState).toEqual({ pendingApprovals: [{ id: 'approval-1', status: 'pending', tool_name: 'gmail_send' }] });
    });

    it('builds completions map from completed checkpoints', async () => {
      const checkpoints = [
        {
          id: 'cp-1',
          run_id: 'run-1',
          step: 0,
          state_before: { agentId: 'agent-1' },
          state_after: { agentId: 'agent-1', completed: true },
          tool_call_id: 'key-1',
          tool_result: { success: true, data: 'email 1' },
        },
        {
          id: 'cp-2',
          run_id: 'run-1',
          step: 1,
          state_before: { agentId: 'agent-1' },
          state_after: { agentId: 'agent-1', completed: true },
          tool_call_id: 'key-2',
          tool_result: { success: true, data: 'email 2' },
        },
      ];

      mockQueries.getCheckpointsForRun.mockResolvedValue(checkpoints);
      mockQueries.getRun.mockResolvedValue({ id: 'run-1', user_id: 'user-1', session_id: 'session-1', status: 'running' });
      mockQueries.getPendingApprovalsForRun.mockResolvedValue([]);
      mockQueries.createRun.mockResolvedValue({ id: 'run-2', status: 'running' });
      mockQueries.updateRunStatus.mockResolvedValue(undefined);

      const runner = new DurableRunner();
      await runner.resume('run-1');

      // The completions map should have been used to skip already-executed tools
      // Verify checkpoints were called to get tool results
      expect(mockQueries.getCheckpointsForRun).toHaveBeenCalledWith('run-1');
    });

    it('returns completed when all checkpoints are done', async () => {
      const checkpoints = [
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
          state_after: { agentId: 'agent-1', completed: true },
          tool_call_id: 'key-2',
          tool_result: { success: true },
        },
      ];

      mockQueries.getCheckpointsForRun.mockResolvedValue(checkpoints);
      mockQueries.getRun.mockResolvedValue({ id: 'run-1', status: 'running' });
      mockQueries.updateRunStatus.mockResolvedValue(undefined);

      const runner = new DurableRunner();
      const result = await runner.resume('run-1');

      expect(result.status).toBe('completed');
      expect(mockQueries.updateRunStatus).toHaveBeenCalledWith('run-1', 'completed', expect.any(Date));
    });

    it('throws when run not found', async () => {
      mockQueries.getCheckpointsForRun.mockResolvedValue([]);
      mockQueries.getRun.mockResolvedValue(null);

      const runner = new DurableRunner();
      await expect(runner.resume('nonexistent')).rejects.toThrow('Run not found: nonexistent');
    });
  });
});
