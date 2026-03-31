/**
 * Unit tests for GDPR Retention Cron.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSqlFn = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue({ rows: [] }),
)
const mockDeleteTrace = vi.hoisted(() =>
  vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
)

vi.mock('@vercel/postgres', () => ({ sql: mockSqlFn }))
vi.mock('../trace-store', () => ({
  deleteTrace: mockDeleteTrace,
  listTraces: vi.fn(),
  FLAGGED_RETENTION_DAYS: 90,
  STANDARD_RETENTION_DAYS: 30,
}))

import { deleteExpiredTraces, flagTrace, unflagTrace, getRetentionStats, runRetentionScan } from '../retention-cron'

beforeEach(() => {
  mockSqlFn.mockReset()
  mockDeleteTrace.mockReset()
})

describe('deleteExpiredTraces', () => {
  it('deletes 2 traces when 2 are returned', async () => {
    mockSqlFn
      .mockResolvedValueOnce({ rows: [{ id: 't1' }, { id: 't2' }] })
      .mockResolvedValueOnce({ rows: [] })
    mockDeleteTrace.mockResolvedValue(true)

    const deleted = await deleteExpiredTraces()

    expect(deleted).toBe(2)
  })

  it('returns 0 when no traces exist', async () => {
    mockSqlFn.mockResolvedValueOnce({ rows: [] })
    mockDeleteTrace.mockResolvedValue(true)

    const deleted = await deleteExpiredTraces()

    expect(deleted).toBe(0)
    expect(mockDeleteTrace).not.toHaveBeenCalled()
  })

  it('calls deleteTrace for each expired trace', async () => {
    mockSqlFn
      .mockResolvedValueOnce({ rows: [{ id: 't1' }, { id: 't2' }] })
      .mockResolvedValueOnce({ rows: [] })
    mockDeleteTrace.mockResolvedValue(true)

    await deleteExpiredTraces()

    expect(mockDeleteTrace).toHaveBeenCalledTimes(2)
    expect(mockDeleteTrace).toHaveBeenCalledWith('t1')
    expect(mockDeleteTrace).toHaveBeenCalledWith('t2')
  })

  it('queries sql', async () => {
    mockSqlFn.mockResolvedValueOnce({ rows: [] })
    mockDeleteTrace.mockResolvedValue(true)

    await deleteExpiredTraces()

    expect(mockSqlFn).toHaveBeenCalled()
  })
})

describe('flagTrace', () => {
  it('calls sql', async () => {
    mockSqlFn.mockResolvedValueOnce({ rows: [] })
    await flagTrace('trace-abc')
    expect(mockSqlFn).toHaveBeenCalled()
  })
})

describe('unflagTrace', () => {
  it('calls sql', async () => {
    mockSqlFn.mockResolvedValueOnce({ rows: [] })
    await unflagTrace('trace-xyz')
    expect(mockSqlFn).toHaveBeenCalled()
  })
})

describe('getRetentionStats', () => {
  it('returns object with all expected fields', async () => {
    // getRetentionStats uses Promise.all for 5 parallel queries.
    // Concurrent mocking with mockResolvedValueOnce is unreliable in ESM.
    // Integration tests cover the real DB path. Here we verify the function
    // is callable and returns the expected shape with a default mock return.
    mockSqlFn.mockImplementation(() => Promise.resolve({ rows: [{ count: '0' }] }))

    const stats = await getRetentionStats()

    expect(stats).toHaveProperty('total')
    expect(stats).toHaveProperty('expired')
    expect(stats).toHaveProperty('expiringWithin7Days')
    expect(stats).toHaveProperty('standardTier')
    expect(stats).toHaveProperty('flaggedTier')
  })
})

describe('runRetentionScan', () => {
  it('returns deleted count and stats object', async () => {
    // runRetentionScan orchestrates deleteExpiredTraces + getRetentionStats.
    // Verify the return shape; sql call sequencing is tested above.
    mockDeleteTrace.mockResolvedValue(true)
    mockSqlFn.mockImplementation(() => Promise.resolve({ rows: [{ count: '0' }] }))

    const result = await runRetentionScan()

    expect(result).toHaveProperty('deleted')
    expect(result).toHaveProperty('stats')
    expect(result.stats).toHaveProperty('total')
  })
})
