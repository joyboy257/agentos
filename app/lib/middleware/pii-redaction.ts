/**
 * PII (Personally Identifiable Information) redaction.
 * Redacts by value pattern AND key name before logging.
 */

const PII_VALUE_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,          // email
  /\+?[\d\s\-\(\)]{10,}/,                                      // phone number
  /\d{3}[-\s]?\d{2}[-\s]?\d{4}/,                              // SSN-like
  /[A-Z]{1,2}\d{2}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/,        // credit card
]

const PII_KEY_NAMES = new Set([
  'email', 'to', 'from', 'cc', 'bcc', 'phone', 'address', 'name',
  'subject', 'body', 'content', 'message', 'password', 'secret',
  'token', 'api_key', 'apikey', 'auth', 'ssn', 'credit_card',
])

const REDACTED = '[REDACTED]'
const TRUNCATE_LENGTH = 200

/**
 * Returns true if the given string likely contains PII by value pattern.
 */
export function looksLikePII(value: string): boolean {
  if (value.length < 3) return false
  for (const pattern of PII_VALUE_PATTERNS) {
    if (pattern.test(value)) return true
  }
  return false
}

/**
 * Returns true if the given key name suggests PII content.
 */
export function isPIIKey(key: string): boolean {
  const lower = key.toLowerCase()
  return PII_KEY_NAMES.has(lower) || lower.includes('email') || lower.includes('phone')
}

/**
 * Recursively sanitize a value, handling objects, arrays, and primitives.
 */
export function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    if (looksLikePII(value)) return REDACTED
    if (value.length > TRUNCATE_LENGTH) return value.slice(0, TRUNCATE_LENGTH) + '...[TRUNCATED]'
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item))
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isPIIKey(key)) {
        result[key] = REDACTED
      } else {
        result[key] = sanitizeValue(val)
      }
    }
    return result
  }

  return value
}

/**
 * Redact PII from any value.
 */
export function redactPII(value: unknown): unknown {
  return sanitizeValue(value)
}

/**
 * Redact PII from an error for safe inclusion in logs.
 * Only structured fields are used — never error.message directly.
 */
export function sanitizeErrorForLog(error: any): Record<string, unknown> {
  if (!error) return {}
  return {
    code: error?.code ?? null,
    status: error?.status ?? error?.response?.status ?? null,
    name: error?.name ?? error?.constructor?.name ?? null,
  }
}