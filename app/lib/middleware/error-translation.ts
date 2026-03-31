/**
 * Error translation — converts raw tool errors to structured ToolError.
 * Never uses error.message directly in llmMessage.
 */

import { TimeoutError } from './with-timeout'
import { AbortError } from './abort'

export type ErrorCode =
  | 'UNAUTHORIZED'       // 401
  | 'FORBIDDEN'          // 403
  | 'RATE_LIMITED'       // 429
  | 'SERVER_ERROR'       // 500-504
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'   // 400
  | 'ABORTED'            // Run was cancelled
  | 'UNKNOWN_ERROR'

export interface TranslatedError {
  llmMessage: string
  userMessage: string
  retryable: boolean
  errorCode: ErrorCode
}

function coerceStatus(status: unknown): number | null {
  if (status == null) return null
  const n = Number(status)
  return Number.isInteger(n) && n > 0 ? n : null
}

function extractStatus(err: any): number | string | null {
  if (err.response?.status != null) return err.response.status
  if (err.status != null) return err.status
  if (err.code === 'ECONNABORTED') return 'TIMEOUT'
  return null
}

export function translateToolError(error: any, toolName: string): TranslatedError {
  // AbortError — never retry
  if (error instanceof AbortError || (error instanceof Error && error.name === 'AbortError')) {
    return {
      llmMessage: `The ${toolName} operation was cancelled.`,
      userMessage: `Cancelled.`,
      retryable: false,
      errorCode: 'ABORTED',
    }
  }

  // Timeout
  if (error instanceof TimeoutError) {
    return {
      llmMessage: `${toolName} did not respond in time. The operation timed out after ${error.timeoutMs}ms. Consider retrying or simplifying the request.`,
      userMessage: `${toolName} is taking too long. Please try again.`,
      retryable: true,
      errorCode: 'TIMEOUT',
    }
  }

  // Network error (TypeError from failed fetch)
  if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
    return {
      llmMessage: `Could not reach the ${toolName} service. Check network connectivity and retry.`,
      userMessage: `Could not reach ${toolName}. Check your internet connection and try again.`,
      retryable: true,
      errorCode: 'NETWORK_ERROR',
    }
  }

  // ECONNABORTED — axios timeout variant
  if (error?.code === 'ECONNABORTED') {
    return {
      llmMessage: `The ${toolName} request timed out. Consider retrying.`,
      userMessage: `${toolName} request timed out. Please try again.`,
      retryable: true,
      errorCode: 'TIMEOUT',
    }
  }

  const rawStatus = extractStatus(error)
  const status = coerceStatus(rawStatus)

  if (status === 401) {
    return {
      llmMessage: `${toolName} authentication has expired or is invalid. The agent cannot proceed without valid credentials. Please reconnect the account.`,
      userMessage: `Your ${toolName} connection has expired. Please reconnect your account.`,
      retryable: false,
      errorCode: 'UNAUTHORIZED',
    }
  }

  if (status === 403) {
    return {
      llmMessage: `${toolName} access was denied. The agent does not have permission to perform this operation. Check account permissions.`,
      userMessage: `${toolName} access denied. Check that your account has the required permissions.`,
      retryable: false,
      errorCode: 'FORBIDDEN',
    }
  }

  if (status === 429) {
    const retryAfter = error?.response?.headers?.get?.('Retry-After')
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null
    return {
      llmMessage: `${toolName} is rate limited. Retrying in ${retryMs ? `${retryMs / 1000}s` : '30s'}...`,
      userMessage: `${toolName} is rate limited. Retrying...`,
      retryable: true,
      errorCode: 'RATE_LIMITED',
    }
  }

  if (status === 500) {
    return {
      llmMessage: `${toolName} encountered a server error. Retrying may resolve this.`,
      userMessage: `${toolName} is having issues. Retrying...`,
      retryable: true,
      errorCode: 'SERVER_ERROR',
    }
  }

  if (status !== null && status >= 502 && status <= 504) {
    return {
      llmMessage: `${toolName} gateway error (${status}). This is typically transient. Retrying...`,
      userMessage: `${toolName} is temporarily unavailable. Retrying...`,
      retryable: true,
      errorCode: 'SERVER_ERROR',
    }
  }

  if (status === 400) {
    return {
      llmMessage: `${toolName} received a malformed request. Check the request parameters.`,
      userMessage: `Invalid request to ${toolName}. Please try a different query.`,
      retryable: false,
      errorCode: 'VALIDATION_ERROR',
    }
  }

  if (error?.code === 'ETIMEDOUT') {
    return {
      llmMessage: `Connection to ${toolName} timed out. Check network connectivity.`,
      userMessage: `Connection to ${toolName} timed out. Check your internet connection.`,
      retryable: true,
      errorCode: 'TIMEOUT',
    }
  }

  if (error?.code === 'ECONNRESET') {
    return {
      llmMessage: `Connection to ${toolName} was reset. Retrying...`,
      userMessage: `Connection interrupted. Retrying...`,
      retryable: true,
      errorCode: 'NETWORK_ERROR',
    }
  }

  // Default: unknown error
  return {
    llmMessage: `${toolName} failed with error code ${error?.code ?? 'UNKNOWN_ERROR'}.`,
    userMessage: `${toolName} failed. Please try again.`,
    retryable: false,
    errorCode: 'UNKNOWN_ERROR',
  }
}