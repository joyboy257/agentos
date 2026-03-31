/**
 * Tests for error translation middleware.
 */

import { translateToolError } from '../error-translation'
import { TimeoutError } from '../with-timeout'
import { AbortError } from '../abort'

describe('translateToolError', () => {
  it('translates AbortError to ABORTED', () => {
    const result = translateToolError(new AbortError(), 'gmail.read')
    expect(result.errorCode).toBe('ABORTED')
    expect(result.retryable).toBe(false)
    expect(result.llmMessage).toContain('cancelled')
    expect(result.userMessage).toBe('Cancelled.')
  })

  it('translates TimeoutError to TIMEOUT', () => {
    const err = new TimeoutError('gmail.read', 30000)
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('TIMEOUT')
    expect(result.retryable).toBe(true)
    expect(result.llmMessage).toContain('30000ms')
    expect(result.userMessage).toContain('taking too long')
  })

  it('translates network TypeError to NETWORK_ERROR', () => {
    const err = new TypeError('fetch failed')
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('NETWORK_ERROR')
    expect(result.retryable).toBe(true)
    expect(result.llmMessage).toContain('Could not reach')
    expect(result.userMessage).toContain('Check your internet connection')
  })

  it('translates ECONNABORTED to TIMEOUT', () => {
    const err = { code: 'ECONNABORTED' }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('TIMEOUT')
    expect(result.retryable).toBe(true)
  })

  it('translates 401 to UNAUTHORIZED', () => {
    const err = { status: 401 }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('UNAUTHORIZED')
    expect(result.retryable).toBe(false)
    expect(result.llmMessage).toContain('expired')
    expect(result.userMessage).toContain('reconnect')
  })

  it('translates 401 as string', () => {
    const err = { status: '401' }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('UNAUTHORIZED')
  })

  it('translates 403 to FORBIDDEN', () => {
    const err = { status: 403 }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('FORBIDDEN')
    expect(result.retryable).toBe(false)
  })

  it('translates 429 to RATE_LIMITED', () => {
    const err = { status: 429 }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('RATE_LIMITED')
    expect(result.retryable).toBe(true)
    expect(result.llmMessage).toContain('rate limited')
  })

  it('extracts Retry-After header for 429', () => {
    const err = {
      status: 429,
      response: {
        headers: {
          get: (name: string) => name === 'Retry-After' ? '5' : null
        }
      }
    }
    const result = translateToolError(err, 'gmail.read')
    expect(result.llmMessage).toContain('5s')
  })

  it('translates 500 to SERVER_ERROR', () => {
    const err = { status: 500 }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('SERVER_ERROR')
    expect(result.retryable).toBe(true)
  })

  it('translates 502/503/504 to SERVER_ERROR', () => {
    for (const status of [502, 503, 504]) {
      const err = { status }
      const result = translateToolError(err, 'gmail.read')
      expect(result.errorCode).toBe('SERVER_ERROR')
      expect(result.retryable).toBe(true)
    }
  })

  it('translates 400 to VALIDATION_ERROR', () => {
    const err = { status: 400 }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('VALIDATION_ERROR')
    expect(result.retryable).toBe(false)
  })

  it('translates ETIMEDOUT to TIMEOUT', () => {
    const err = { code: 'ETIMEDOUT' }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('TIMEOUT')
    expect(result.retryable).toBe(true)
  })

  it('translates ECONNRESET to NETWORK_ERROR', () => {
    const err = { code: 'ECONNRESET' }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('NETWORK_ERROR')
    expect(result.retryable).toBe(true)
  })

  it('handles axios error format', () => {
    const err = { response: { status: 401 } }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('UNAUTHORIZED')
  })

  it('returns UNKNOWN_ERROR for unknown errors', () => {
    const err = { code: 'SOME_OTHER_ERROR' }
    const result = translateToolError(err, 'gmail.read')
    expect(result.errorCode).toBe('UNKNOWN_ERROR')
    expect(result.retryable).toBe(false)
  })

  it('never uses raw error.message in llmMessage', () => {
    const err = {
      status: 500,
      message: 'at gmailReadTool (/app/lib/runtime/tools/gmail.ts:42:15) Internal error: connection refused'
    }
    const result = translateToolError(err, 'gmail.read')
    expect(result.llmMessage).not.toContain('gmail.ts')
    expect(result.llmMessage).not.toContain('connection refused')
    expect(result.llmMessage).toContain('SERVER_ERROR')
  })
})