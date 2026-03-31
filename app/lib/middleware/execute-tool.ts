/**
 * executeTool — main reliability middleware entry point.
 * Composes: withAbortSignal → withTimeout → withRetryBudget → withRetry → translateToolError
 * Always resolves, never throws. Returns ToolResult.
 */

import { checkAbortSignal, AbortError } from './abort'
import { TimeoutError, DEFAULT_TIMEOUT_MS, withTimeout } from './with-timeout'
import { withRetry, DEFAULT_RETRY_CONFIG, calculateDelay, RetryConfig, getRetryBudget, RetryBudget } from './with-retry'
import { translateToolError } from './error-translation'
import { ToolCallLogger, LogEndInput } from './logger'
import { sanitizeErrorForLog } from './pii-redaction'

export interface ToolCallConfig {
  timeoutMs?: number
  retryConfig?: Partial<RetryConfig>
  logger?: ToolCallLogger
  abortSignal?: AbortSignal | null
  retryBudgetDomain?: string
  retryBudgetMaxTokens?: number
}

export interface ToolResult {
  data: unknown
  partialData: boolean
  attemptSucceededOn: number | null
  llmMessage: string
  userMessage: string
  failed: boolean
  errorCode?: string
  retriesAttempted: number
}

const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
  'gmail.read': 30_000,
  'gmail.send': 20_000,
  'web.search': 15_000,
  'llm': 120_000,
}

/**
 * executeTool wraps every tool call with retry logic, timeout handling,
 * abort signal propagation, and structured error translation.
 */
export async function executeTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  toolFn: (signal?: AbortSignal) => Promise<T>,
  config: ToolCallConfig = {}
): Promise<ToolResult> {
  checkAbortSignal(config.abortSignal)

  const timeoutMs = config.timeoutMs ?? DEFAULT_TOOL_TIMEOUTS[toolName] ?? DEFAULT_TIMEOUT_MS
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig }
  const logger = config.logger ?? new ToolCallLogger()
  const budget = config.retryBudgetDomain
    ? getRetryBudget(config.retryBudgetDomain, config.retryBudgetMaxTokens ?? 1)
    : undefined

  let attempt = 1
  let finalError: any = null
  let finalTranslated: ReturnType<typeof translateToolError> | null = null
  let result: T | undefined
  let attemptSucceededOn: number | null = null
  let retriesAttempted = 0

  const outerSignal = config.abortSignal

  while (attempt <= retryConfig.maxRetries + 1) {
    checkAbortSignal(outerSignal)

    const attemptStart = Date.now()
    logger.logStart(toolName, args, attempt, retriesAttempted)

    let currentController: AbortController | undefined

    try {
      currentController = new AbortController()

      if (outerSignal) {
        if (outerSignal.aborted) throw new AbortError()
        outerSignal.addEventListener('abort', () => currentController!.abort(), { once: true })
      }

      result = await withTimeout(
        toolName,
        toolFn(currentController.signal),
        timeoutMs,
        currentController.signal
      )

      attemptSucceededOn = attempt
      retriesAttempted = attempt - 1

      const logEntry: LogEndInput = {
        toolName,
        arguments: args,
        attempt,
        startedAt: attemptStart,
        result: 'success',
        retryable: false,
        retriesAttempted,
      }
      logger.logEnd(logEntry)

      return {
        data: result,
        partialData: retriesAttempted > 0,
        attemptSucceededOn: attempt,
        llmMessage: 'OK',
        userMessage: 'Success',
        failed: false,
        retriesAttempted,
      }

    } catch (err: any) {
      finalError = err

      if (err instanceof AbortError || (outerSignal?.aborted && err instanceof Error && err.name === 'AbortError')) {
        const durationMs = Date.now() - attemptStart
        const translated = translateToolError(err, toolName)
        const logEntry: LogEndInput = {
          toolName,
          arguments: args,
          attempt,
          startedAt: attemptStart,
          result: 'cancelled',
          errorType: 'AbortError',
          errorCode: 'ABORTED',
          retryable: false,
          llmMessage: translated.llmMessage,
          retriesAttempted,
        }
        logger.logEnd(logEntry)
        return {
          data: null,
          partialData: false,
          attemptSucceededOn: null,
          llmMessage: translated.llmMessage,
          userMessage: translated.userMessage,
          failed: true,
          errorCode: 'ABORTED',
          retriesAttempted,
        }
      }

      finalTranslated = translateToolError(err, toolName)

      const shouldRetry =
        finalTranslated.retryable &&
        attempt <= retryConfig.maxRetries &&
        !(err instanceof TimeoutError && !finalTranslated.retryable)

      retriesAttempted = attempt - 1

      const durationMs = Date.now() - attemptStart
      const logEntry: LogEndInput = {
        toolName,
        arguments: args,
        attempt,
        startedAt: attemptStart,
        result: err instanceof TimeoutError ? 'timeout' : 'error',
        errorType: err?.constructor?.name ?? 'Error',
        errorCode: finalTranslated.errorCode,
        retryable: finalTranslated.retryable,
        llmMessage: finalTranslated.llmMessage,
        retriesAttempted,
      }
      logger.logEnd(logEntry)

      if (!shouldRetry) {
        break
      }

      const delay = calculateDelay(attempt, retryConfig)
      await new Promise(resolve => setTimeout(resolve, delay))
      attempt++
    }
  }

  return {
    data: null,
    partialData: false,
    attemptSucceededOn: null,
    llmMessage: finalTranslated?.llmMessage ?? `${toolName} failed with error code ${finalError?.code ?? finalTranslated?.errorCode ?? 'UNKNOWN_ERROR'}.`,
    userMessage: finalTranslated?.userMessage ?? `${toolName} failed. Please try again.`,
    failed: true,
    errorCode: finalTranslated?.errorCode ?? 'UNKNOWN_ERROR',
    retriesAttempted,
  }
}

export { ToolCallLogger } from './logger'