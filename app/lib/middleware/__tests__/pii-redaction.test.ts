/**
 * Tests for PII redaction middleware.
 */

import { looksLikePII, isPIIKey, sanitizeValue, redactPII } from '../pii-redaction'

describe('looksLikePII', () => {
  it('detects email addresses', () => {
    expect(looksLikePII('john@example.com')).toBe(true)
    expect(looksLikePII('user+tag@domain.co.uk')).toBe(true)
    expect(looksLikePII('test.email@gmail.com')).toBe(true)
  })

  it('detects phone numbers', () => {
    expect(looksLikePII('(555) 123-4567')).toBe(true)
    expect(looksLikePII('+1-800-555-0100')).toBe(true)
    expect(looksLikePII('5551234567')).toBe(true)
  })

  it('detects SSN-like patterns', () => {
    expect(looksLikePII('123-45-6789')).toBe(true)
    expect(looksLikePII('123 45 6789')).toBe(true)
  })

  it('detects credit card patterns', () => {
    expect(looksLikePII('4111-1111-1111-1111')).toBe(true)
    expect(looksLikePII('5500 0000 0000 0004')).toBe(true)
  })

  it('returns false for non-PII strings', () => {
    expect(looksLikePII('hello world')).toBe(false)
    expect(looksLikePII('search query')).toBe(false)
    expect(looksLikePII('https://example.com')).toBe(false)
  })

  it('returns false for short strings', () => {
    expect(looksLikePII('ab')).toBe(false)
    expect(looksLikePII('a@b')).toBe(false)
  })
})

describe('isPIIKey', () => {
  it('detects PII key names', () => {
    const piiKeys = ['email', 'password', 'secret', 'token', 'api_key', 'ssn', 'credit_card', 'phone', 'address']
    for (const key of piiKeys) {
      expect(isPIIKey(key)).toBe(true)
    }
  })

  it('detects email and phone in key names', () => {
    expect(isPIIKey('toEmail')).toBe(true)
    expect(isPIIKey('fromPhone')).toBe(true)
    expect(isPIIKey('ccEmail')).toBe(true)
  })

  it('returns false for non-PII keys', () => {
    expect(isPIIKey('query')).toBe(false)
    expect(isPIIKey('limit')).toBe(false)
    expect(isPIIKey('status')).toBe(false)
  })
})

describe('sanitizeValue', () => {
  it('redacts string values matching PII patterns', () => {
    expect(sanitizeValue('john@example.com')).toBe('[REDACTED]')
  })

  it('redacts values by PII key name', () => {
    const input = { email: 'john@example.com', query: 'search term' }
    const result = sanitizeValue(input) as Record<string, unknown>
    expect(result.email).toBe('[REDACTED]')
    expect(result.query).toBe('search term')
  })

  it('truncates long strings', () => {
    const long = 'a'.repeat(250)
    const result = sanitizeValue(long) as string
    expect(result).toContain('...[TRUNCATED]')
    expect(result.length).toBeLessThan(long.length)
  })

  it('handles nested objects recursively', () => {
    const input = {
      to: 'recipient@example.com',
      subject: 'Hello',
      nested: {
        cc: 'another@example.com',
        body: 'Message content'
      }
    }
    const result = sanitizeValue(input) as Record<string, unknown>
    expect(result.to).toBe('[REDACTED]')
    expect(result.subject).toBe('Hello')
    expect((result.nested as Record<string, unknown>).cc).toBe('[REDACTED]')
    expect((result.nested as Record<string, unknown>).body).toBe('Message content')
  })

  it('handles arrays recursively', () => {
    const input = [
      { email: 'a@example.com' },
      { email: 'b@example.com' }
    ]
    const result = sanitizeValue(input) as Array<Record<string, unknown>>
    expect(result[0].email).toBe('[REDACTED]')
    expect(result[1].email).toBe('[REDACTED]')
  })

  it('returns primitives unchanged', () => {
    expect(sanitizeValue(123)).toBe(123)
    expect(sanitizeValue(true)).toBe(true)
    expect(sanitizeValue(null)).toBe(null)
    expect(sanitizeValue(undefined)).toBe(undefined)
  })
})

describe('redactPII', () => {
  it('is an alias for sanitizeValue', () => {
    const input = { email: 'test@example.com' }
    expect(redactPII(input)).toEqual(sanitizeValue(input))
  })
})