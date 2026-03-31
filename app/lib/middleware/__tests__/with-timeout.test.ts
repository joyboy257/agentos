/**
 * Tests for withTimeout middleware.
 */

import { withTimeout, TimeoutError, DEFAULT_TIMEOUT_MS } from '../with-timeout'

describe('withTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withTimeout(
      'test-tool',
      new Promise<string>(resolve => setTimeout(() => resolve('done'), 10)),
      1000
    )
    expect(result).toBe('done')
  })

  it('rejects with TimeoutError when promise exceeds timeout', async () => {
    await expect(
      withTimeout(
        'test-tool',
        new Promise<string>(resolve => setTimeout(() => resolve('done'), 200)),
        50
      )
    ).rejects.toThrow(TimeoutError)
  })

  it('TimeoutError has correct properties', async () => {
    try {
      await withTimeout(
        'gmail.read',
        new Promise<string>(resolve => setTimeout(() => resolve('done'), 200)),
        30_000
      )
    } catch (err: any) {
      expect(err).toBeInstanceOf(TimeoutError)
      expect(err.toolName).toBe('gmail.read')
      expect(err.timeoutMs).toBe(30_000)
      expect(err.message).toContain('gmail.read')
      expect(err.message).toContain('30000ms')
    }
  })

  it('uses DEFAULT_TIMEOUT_MS when no timeout specified', async () => {
    const delay = DEFAULT_TIMEOUT_MS + 100
    await expect(
      withTimeout(
        'test-tool',
        new Promise<string>(resolve => setTimeout(() => resolve('done'), delay))
      )
    ).rejects.toThrow(TimeoutError)
  })

  it('clears timer on success', async () => {
    const spy = jest.spyOn(global, 'clearTimeout')
    await withTimeout(
      'test-tool',
      Promise.resolve('done'),
      1000
    )
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('clears timer on error', async () => {
    const spy = jest.spyOn(global, 'clearTimeout')
    await expect(
      withTimeout(
        'test-tool',
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('fail')), 10)),
        1000
      )
    ).rejects.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('passes abort signal through', async () => {
    const controller = new AbortController()
    const promise = withTimeout(
      'test-tool',
      new Promise<string>(resolve => setTimeout(() => resolve('done'), 50)),
      1000,
      controller.signal
    )
    controller.abort()
    await expect(promise).rejects.toThrow(TimeoutError)
  })
})