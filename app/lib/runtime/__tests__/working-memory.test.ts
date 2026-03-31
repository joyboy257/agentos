import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkingMemory } from '../working-memory';
import * as queries from '../../db/queries';

// Mock the DB queries
vi.mock('../../db/queries', () => ({
  setWorkingMemory: vi.fn().mockResolvedValue(undefined),
  getWorkingMemory: vi.fn().mockResolvedValue(null),
  getAllWorkingMemory: vi.fn().mockResolvedValue({}),
  clearWorkingMemory: vi.fn().mockResolvedValue(undefined),
}));

const mockQueries = queries as any;

describe('WorkingMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('get returns null when key does not exist', async () => {
    mockQueries.getWorkingMemory.mockResolvedValue(null);

    const memory = new WorkingMemory('session-1');
    const result = await memory.get('nonexistent');

    expect(result).toBeNull();
  });

  it('set and get round-trip correctly', async () => {
    mockQueries.getWorkingMemory.mockResolvedValue({ key: 'value' });

    const memory = new WorkingMemory('session-1');
    await memory.set('testKey', { nested: 'value' });
    const result = await memory.get('testKey');

    expect(mockQueries.setWorkingMemory).toHaveBeenCalledWith(
      'session-1',
      'testKey',
      { nested: 'value' }
    );
    expect(result).toEqual({ nested: 'value' });
  });

  it('merge updates multiple keys atomically', async () => {
    const memory = new WorkingMemory('session-1');
    await memory.merge({
      key1: 'value1',
      key2: 'value2',
    });

    expect(mockQueries.setWorkingMemory).toHaveBeenCalledTimes(2);
    expect(mockQueries.setWorkingMemory).toHaveBeenCalledWith(
      'session-1',
      'key1',
      'value1'
    );
    expect(mockQueries.setWorkingMemory).toHaveBeenCalledWith(
      'session-1',
      'key2',
      'value2'
    );
  });

  it('recordEscalation appends to history', async () => {
    mockQueries.getWorkingMemory
      .mockResolvedValueOnce([{ decision: 'approved', agent: 'email', timestamp: '2024-01-01' }])
      .mockResolvedValueOnce([{ decision: 'approved', agent: 'email', timestamp: '2024-01-01' }]);

    const memory = new WorkingMemory('session-1');
    await memory.recordEscalation('denied', 'support');

    expect(mockQueries.setWorkingMemory).toHaveBeenCalledWith(
      'session-1',
      'escalation_history',
      expect.arrayContaining([
        { decision: 'approved', agent: 'email', timestamp: '2024-01-01' },
        { decision: 'denied', agent: 'support', timestamp: expect.any(String) },
      ])
    );
  });

  it('clear removes all keys for session', async () => {
    const memory = new WorkingMemory('session-1');
    await memory.clear();

    expect(mockQueries.clearWorkingMemory).toHaveBeenCalledWith('session-1');
  });

  it('getAll returns all key-value pairs', async () => {
    mockQueries.getAllWorkingMemory.mockResolvedValue({
      key1: 'value1',
      key2: 'value2',
    });

    const memory = new WorkingMemory('session-1');
    const result = await memory.getAll();

    expect(result).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
  });
});
