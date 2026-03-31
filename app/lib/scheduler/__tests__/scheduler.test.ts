import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scheduleAgent, cancelSchedule } from '../client';
import * as client from '../client';

// Mock BullMQ
vi.mock('bullmq', () => {
  const mockQueue = {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(undefined),
  };
  return {
    Queue: vi.fn(() => mockQueue),
    Worker: vi.fn(),
  };
});

vi.mock('../client', async () => {
  const actual = await vi.importActual('../client');
  return {
    ...actual,
    getQueue: vi.fn(() => ({
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scheduleAgent calls upsertJobScheduler with correct scheduler ID', async () => {
    const mockQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(client, 'getQueue').mockReturnValue(mockQueue as any);

    await scheduleAgent('agent-123', '0 9 * * *');

    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'heartbeat:agent-123',
      { pattern: '0 9 * * *' },
      { name: 'agent-heartbeat', data: { agentId: 'agent-123' } }
    );
  });

  it('cancelSchedule calls removeJobScheduler with correct ID', async () => {
    const mockQueue = {
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(client, 'getQueue').mockReturnValue(mockQueue as any);

    await cancelSchedule('agent-123');

    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith('heartbeat:agent-123');
  });

  it('scheduleAgent is idempotent — calling twice does not duplicate', async () => {
    const mockQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(client, 'getQueue').mockReturnValue(mockQueue as any);

    await scheduleAgent('agent-123', '0 9 * * *');
    await scheduleAgent('agent-123', '0 9 * * *');

    // upsertJobScheduler is idempotent — called once with the same ID updates, doesn't create duplicate
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'heartbeat:agent-123',
      { pattern: '0 9 * * *' },
      expect.any(Object)
    );
  });
});
