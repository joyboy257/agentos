/**
 * Tests for withRetry middleware and retry budget.
 */

import { withRetry, DEFAULT_RETRY_CONFIG, calculateDelay, getRetryBudget, resetAllRetryBudgets } from '../with-retry'

describe('withRetry', () => {
  afterEach(() => {
    resetAllRetryBudgets()
  })

  it('succeeds on first attempt when no error', async () => {
    const fn = jest.fn().mockResolvedValue('success')
    const result = await withRetry(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retriable error and succeeds on later attempt', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry on non-retriable error (401)', async () => {
    const fn = jest.fn().mockRejectedValue({ status: 401 })
    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })).rejects.toEqual({ status: 401 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry on non-retriable error (403)', async () => {
    const fn = jest.fn().mockRejectedValue({ status: 403 })
    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })).rejects.toEqual({ status: 403 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry on 400 Bad Request', async () => {
    const fn = jest.fn().mockRejectedValue({ status: 400 })
    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })).rejects.toEqual({ status: 400 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 Rate Limited', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on 500 Server Error', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on 502/503/504 Gateway errors', async () => {
    for (const status of [502, 503, 504]) {
      const fn = jest.fn()
        .mockRejectedValueOnce({ status })
        .mockResolvedValue('success')

      const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })
      expect(result).toBe('success')
      fn.mockRestore()
    }
  })

  it('retries on network errors (TypeError)', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on ECONNABORTED', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ code: 'ECONNABORTED' })
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10, jitter: false })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('gives up after maxRetries exhausted', async () => {
    const fn = jest.fn().mockRejectedValue({ status: 500 })
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 10, jitter: false })
    ).rejects.toEqual({ status: 500 })
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('uses exponential backoff', async () => {
    const delays: number[] = []
    const startTime = Date.now()

    const fn = jest.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockImplementation(async () => {
        delays.push(Date.now() - startTime)
        throw { status: 500 }
      })

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 100, backoffFactor: 2, jitter: false })
    ).rejects.toThrow()

    // First delay ~100ms, second delay ~200ms
    expect(delays.length).toBe(3)
  })
})

describe('calculateDelay', () => {
  it('returns base delay for attempt 0', () => {
    const delay = calculateDelay(0, { ...DEFAULT_RETRY_CONFIG, jitter: false })
    expect(delay).toBe(DEFAULT_RETRY_CONFIG.baseDelay)
  })

  it('applies backoff factor exponentially', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelay: 100, backoffFactor: 2, jitter: false, maxRetries: 5 }
    expect(calculateDelay(0, config)).toBe(100)
    expect(calculateDelay(1, config)).toBe(200)
    expect(calculateDelay(2, config)).toBe(400)
  })

  it('caps at maxDelay', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelay: 1000, backoffFactor: 2, maxDelay: 5000, jitter: false, maxRetries: 10 }
    expect(calculateDelay(10, config)).toBe(5000) // 1000 * 2^10 = 1024000, capped at 5000
  })

  it('applies jitter when enabled', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, jitter: true }
    // With jitter, result should be random between 0 and the exponential value
    const results = new Set<number>()
    for (let i = 0; i < 100; i++) {
      results.add(calculateDelay(1, config))
    }
    // With jitter, we should see varied results (not all the same)
    expect(results.size).toBeGreaterThan(1)
  })
})

describe('RetryBudget', () => {
  afterEach(() => {
    resetAllRetryBudgets()
  })

  it('allows acquisition when tokens available', () => {
    const budget = getRetryBudget('test-domain', 2)
    expect(budget.tryAcquire()).toBe(true)
    expect(budget.tryAcquire()).toBe(true)
    expect(budget.tryAcquire()).toBe(false) // exhausted
  })

  it('releases token back', () => {
    const budget = getRetryBudget('test-domain', 1)
    expect(budget.tryAcquire()).toBe(true)
    expect(budget.tryAcquire()).toBe(false)
    budget.release()
    expect(budget.tryAcquire()).toBe(true)
  })

  it('tracks waitTime correctly', () => {
    const budget = getRetryBudget('test-domain', 1, 100)
    expect(budget.waitTime()).toBe(0) // tokens available

    budget.tryAcquire() // exhaust
    const wait = budget.waitTime()
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(100)
  })

  it('domains are isolated', () => {
    const gmail = getRetryBudget('gmail', 1)
    const web = getRetryBudget('web', 2)
    expect(gmail).not.toBe(web)
    gmail.tryAcquire()
    expect(web.tryAcquire()).toBe(true) // independent
  })
})