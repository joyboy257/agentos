/**
 * PII sanitization for reasoning trace evidence.
 *
 * Applied before every event emission to prevent PII from appearing
 * in reasoning traces. Uses regex patterns to detect and redact:
 * - Email addresses
 * - Phone numbers
 * - Credit card numbers
 * - Social Security numbers
 * - API keys / secrets
 */

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]', label: 'email' },
  // Phone numbers (US and international)
  { pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]', label: 'phone' },
  // Credit card numbers (16 digits, with or without spaces/dashes)
  { pattern: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, replacement: '[CREDIT_CARD]', label: 'credit_card' },
  // SSN
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, replacement: '[SSN]', label: 'ssn' },
  // API keys / secrets (common patterns)
  { pattern: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)['":\s=]+[a-zA-Z0-9_\\-]{20,}/gi, replacement: '[SECRET]', label: 'api_key' },
  // Generic bearer tokens
  { pattern: /\bBearer\s+[a-zA-Z0-9_\\-]{20,}/g, replacement: 'Bearer [TOKEN]', label: 'bearer_token' },
]

// Key names that indicate sensitive data
const PII_KEY_NAMES = new Set([
  'password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key',
  'access_token', 'refresh_token', 'auth_token', 'bearer_token',
  'credit_card', 'ccnumber', 'cc_number', 'card_number', 'cvv', 'cvc',
  'ssn', 'social_security', 'phone', 'mobile', 'address', 'dob', 'date_of_birth',
])

const MAX_VALUE_LENGTH = 200

/**
 * Recursively sanitize an evidence object.
 * - Redacts values matching PII regex patterns
 * - Redacts values whose keys match PII_KEY_NAMES
 * - Truncates long strings at MAX_VALUE_LENGTH
 * - Handles nested objects and arrays
 */
export function sanitizeEvidence(obj: unknown): Record<string, unknown> {
  if (obj === null || obj === undefined) {
    return {}
  }

  if (typeof obj === 'string') {
    return { value: sanitizeString(obj) }
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return { value: obj }
  }

  if (Array.isArray(obj)) {
    const sanitized: unknown[] = []
    for (const item of obj) {
      sanitized.push(sanitizeEvidence(item))
    }
    return { items: sanitized } as unknown as Record<string, unknown>
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (PII_KEY_NAMES.has(key.toLowerCase())) {
        result[key] = '[REDACTED]'
      } else if (value === null || value === undefined) {
        result[key] = null
      } else if (typeof value === 'string') {
        result[key] = sanitizeString(value)
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value
      } else if (Array.isArray(value)) {
        result[key] = value.map(item => {
          if (typeof item === 'string') return sanitizeString(item)
          return sanitizeEvidence(item)
        })
      } else if (typeof value === 'object') {
        result[key] = sanitizeEvidence(value)
      } else {
        result[key] = String(value).substring(0, MAX_VALUE_LENGTH)
      }
    }
    return result
  }

  return {}
}

/**
 * Sanitize a string value by replacing PII patterns.
 */
export function sanitizeString(value: string): string {
  if (value.length > MAX_VALUE_LENGTH) {
    value = value.substring(0, MAX_VALUE_LENGTH) + '...[truncated]'
  }

  let result = value
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement)
  }

  return result
}

/**
 * Check if a string contains any PII patterns.
 * Useful for validation before storage.
 */
export function containsPII(value: string): boolean {
  for (const { pattern } of PII_PATTERNS) {
    if (pattern.test(value)) {
      return true
    }
  }
  return false
}
