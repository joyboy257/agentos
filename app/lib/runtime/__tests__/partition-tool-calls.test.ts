import { describe, it, expect } from 'vitest';
import { partitionToolCalls } from '../partition-tool-calls';

describe('partitionToolCalls', () => {
  it('partitions gmail.read as read (safe)', () => {
    const calls = [{ name: 'gmail.read', args: { count: 5 }, id: '1' }];
    const result = partitionToolCalls(calls);
    expect(result.readTools).toHaveLength(1);
    expect(result.writeTools).toHaveLength(0);
  });

  it('partitions gmail.send as write (unsafe)', () => {
    const calls = [{ name: 'gmail.send', args: { to: 'x', body: 'y' }, id: '2' }];
    const result = partitionToolCalls(calls);
    expect(result.readTools).toHaveLength(0);
    expect(result.writeTools).toHaveLength(1);
  });

  it('partitions mixed tool calls correctly', () => {
    const calls = [
      { name: 'gmail.read', args: {}, id: '1' },
      { name: 'web.search', args: {}, id: '2' },
      { name: 'gmail.send', args: {}, id: '3' },
      { name: 'hubspot.read', args: {}, id: '4' },
    ];
    const result = partitionToolCalls(calls);
    // gmail.read, web.search, hubspot.leads → read (parallel)
    expect(result.readTools).toHaveLength(3);
    // gmail.send → write (serial)
    expect(result.writeTools).toHaveLength(1);
  });

  it('treats unknown tools as write (safe default)', () => {
    const calls = [{ name: 'unknown.tool', args: {}, id: '99' }];
    const result = partitionToolCalls(calls);
    expect(result.writeTools).toHaveLength(1);
    expect(result.readTools).toHaveLength(0);
  });
});
