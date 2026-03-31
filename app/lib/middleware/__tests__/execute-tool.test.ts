/**
 * Tests for executeTool composition.
 */

import { executeTool, resetAllRetryBudgets } from '../execute-tool'
import { TimeoutError } from '../with-timeout'
import { AbortError } from '../abort'

describe('executeTool', () => {
  afterEach(() => {
    resetAllRetryBudgets()
  })

  it('returns success result when tool succeeds', async () => {
    const result = await executeTool(
      'web.search',
      { query: 'test', limit: 10 },
      async () => ({ results: [{ title: 'Result', url: 'http://example.com', snippet: 'Test' }] })
    )
    expect(result.failed).toBe(false)
    expect(result.data).toEqual({ results: [{ title: 'Result', url: 'http://example.com', snippet: 'Test' }] })
    expect(result.retriesAttempted).toBe(0)
    expect(result.llmMessage).toBe('OK')
  })

  it('retries on retriable error (500) and succeeds on later attempt', async () => {
    let attempts = 0
    const result = await executeTool(
      'web.search',
      { query: 'test', limit: 10 },
      async () => {
        attempts++
        if (attempts < 3) throw { status: 500 }
        return { results: [{ title: 'Success', url: 'http://example.com', snippet: '' }] }
      },
      { retryConfig: { maxRetries: 3, baseDelay: 10, jitter: false } }
    )
    expect(result.failed).toBe(false)
    expect(result.attemptSucceededOn).toBe(3)
    expect(result.retriesAttempted).toBe(2)
    expect(result.data).toEqual({ results: [{ title: 'Success', url: 'http://example.com', snippet: '' }] })
  })

  it('does not retry on non-retriable error (401)', async () => {
    let attempts = 0
    const result = await executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => {
        attempts++
        throw { status: 401 }
      },
      { retryConfig: { maxRetries: 3, baseDelay: 10, jitter: false } }
    )
    expect(result.failed).toBe(true)
    expect(result.errorCode).toBe('UNAUTHORIZED')
    expect(result.retriesAttempted).toBe(0)
    expect(attempts).toBe(1)
  })

  it('does not retry on 403', async () => {
    let attempts = 0
    const result = await executeTool(
      'gmail.send',
      { to: 'test@example.com', subject: 'Test', body: 'Hello', userId: 'demo' },
      async () => {
        attempts++
        throw { status: 403 }
      },
      { retryConfig: { maxRetries: 3, baseDelay: 10, jitter: false } }
    )
    expect(result.failed).toBe(true)
    expect(result.errorCode).toBe('FORBIDDEN')
    expect(attempts).toBe(1)
  })

  it('returns error result with translated messages after retries exhausted', async () => {
    const result = await executeTool(
      'web.search',
      { query: 'test', limit: 10 },
      async () => {
        throw { status: 500 }
      },
      { retryConfig: { maxRetries: 2, baseDelay: 10, jitter: false } }
    )
    expect(result.failed).toBe(true)
    expect(result.errorCode).toBe('SERVER_ERROR')
    expect(result.llmMessage).toContain('server error')
    expect(result.userMessage).toContain('having issues')
    expect(result.retriesAttempted).toBe(2)
  })

  it('returns TimeoutError after timeout duration', async () => {
    const result = await executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { data: 'success' }
      },
      { timeoutMs: 20 }
    )
    expect(result.failed).toBe(true)
    expect(result.errorCode).toBe('TIMEOUT')
    expect(result.llmMessage).toContain('timed out')
  })

  it('respects abort signal', async () => {
    const controller = new AbortController()
    const resultPromise = executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return { data: 'success' }
      },
      { abortSignal: controller.signal }
    )
    controller.abort()
    const result = await resultPromise
    expect(result.failed).toBe(true)
    expect(result.errorCode).toBe('ABORTED')
    expect(result.llmMessage).toContain('cancelled')
  })

  it('returns AbortError immediately if signal already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => { return { data: 'success' } },
      { abortSignal: controller.signal }
    )
    expect(result.failed).toBe(true)
    expect(result.errorCode).toBe('ABORTED')
  })

  it('sets partialData when succeeding after retries', async () => {
    let attempts = 0
    const result = await executeTool(
      'web.search',
      { query: 'test', limit: 10 },
      async () => {
        attempts++
        if (attempts < 3) throw { status: 429 }
        return { results: [{ title: 'Success', url: 'http://example.com', snippet: '' }] }
      },
      { retryConfig: { maxRetries: 3, baseDelay: 10, jitter: false } }
    )
    expect(result.partialData).toBe(true)
    expect(result.attemptSucceededOn).toBe(3)
  })

  it('uses correct default timeouts per tool', async () => {
    const gmailResult = await executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => { throw { status: 500 } },
      { retryConfig: { maxRetries: 0, baseDelay: 10, jitter: false } }
    )
    // Should not timeout - just fail from the tool error with default gmail.read timeout (30s)
    expect(gmailResult.errorCode).toBe('SERVER_ERROR')

    const llmResult = await executeTool(
      'llm',
      { prompt: 'test', system: 'You are a helpful assistant' },
      async () => { throw { status: 500 } },
      { retryConfig: { maxRetries: 0, baseDelay: 10, jitter: false } }
    )
    expect(llmResult.errorCode).toBe('SERVER_ERROR')
  })

  it('never uses raw error.message in llmMessage', async () => {
    const result = await executeTool(
      'web.search',
      { query: 'test', limit: 10 },
      async () => {
        const err = new Error('at gmailReadTool (/app/lib/runtime/tools/gmail.ts:42:15) connection refused')
        err.status = 500
        throw err
      },
      { retryConfig: { maxRetries: 0 } }
    )
    expect(result.llmMessage).not.toContain('gmail.ts')
    expect(result.llmMessage).not.toContain('connection refused')
    expect(result.llmMessage).toContain('SERVER_ERROR')
  })

  it('returns ToolResult (never throws) for all failure modes', async () => {
    // Timeout
    const timeoutResult = await executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => { await new Promise(resolve => setTimeout(resolve, 200)); return {} },
      { timeoutMs: 10 }
    )
    expect(timeoutResult.errorCode).toBe('TIMEOUT')

    // Network error
    const networkResult = await executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => { throw new TypeError('fetch failed') },
      { retryConfig: { maxRetries: 0 } }
    )
    expect(networkResult.errorCode).toBe('NETWORK_ERROR')

    // 429
    const rateLimitResult = await executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => { throw { status: 429 } },
      { retryConfig: { maxRetries: 0 } }
    )
    expect(rateLimitResult.errorCode).toBe('RATE_LIMITED')
  })

  it('coordinates with retry budget domain', async () => {
    // When two calls share the same budget, the second waits for the first
    const results: number[] = []
    const controller1 = new AbortController()
    const controller2 = new AbortController()

    const p1 = executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => {
        results.push(1)
        await new Promise(resolve => setTimeout(resolve, 20))
        return { data: 'first' }
      },
      { signal: controller1.signal, retryBudgetDomain: 'gmail', retryConfig: { maxRetries: 0 } }
    )

    const p2 = executeTool(
      'gmail.read',
      { query: 'test', userId: 'demo' },
      async () => {
        results.push(2)
        return { data: 'second' }
      },
      { signal: controller2.signal, retryBudgetDomain: 'gmail', retryConfig: { maxRetries: 0 } }
    )

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.failed).toBe(false)
    expect(r2.failed).toBe(false)
  })
})