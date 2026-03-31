/**
 * Tool call logger with PII redaction.
 */

import { redactPII } from './pii-redaction'

export type ToolCallResult = 'success' | 'error' | 'timeout' | 'cancelled'

export interface ToolCallLog {
  toolName: string
  arguments: Record<string, unknown>
  attempt: number
  startedAt: number
  durationMs: number
  result: ToolCallResult
  errorType?: string
  retryable: boolean
  llmMessage?: string
  errorCode?: string
  retriesAttempted: number
}

// Type for logStart input (only fields that caller provides at start time)
export type LogStartInput = Pick<ToolCallLog, 'toolName' | 'arguments' | 'attempt' | 'retriesAttempted'>

// Type for logEnd input (all fields except computed durationMs)
export type LogEndInput = Omit<ToolCallLog, 'durationMs'>

export class ToolCallLogger {
  constructor(private readonly serviceName: string = 'agentos.tool') {}

  logStart(toolName: string, args: Record<string, unknown>, attempt: number, retriesAttempted: number): void {
    const entry: ToolCallLog = {
      toolName,
      arguments: redactPII(args) as Record<string, unknown>,
      attempt,
      startedAt: Date.now(),
      durationMs: 0,
      result: 'success',
      retryable: false,
      retriesAttempted,
    }
    console.log(JSON.stringify({ severity: 'DEBUG', service: this.serviceName, ...entry }))
  }

  logEnd(log: LogEndInput): void {
    const durationMs = Date.now() - log.startedAt
    const entry: ToolCallLog = { ...log, durationMs }
    const severity = log.result === 'error' ? 'ERROR' : log.result === 'timeout' ? 'WARN' : log.result === 'cancelled' ? 'WARN' : 'INFO'
    console.log(JSON.stringify({ severity, service: this.serviceName, ...entry }))
  }
}