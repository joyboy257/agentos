/**
 * ReasoningEvent schema — DOC-05 discriminated union interface.
 * Both Human Approval UX (Unit 5) and Reasoning Traces (Unit 6) emit events
 * following this schema. HMAC-SHA256 integrity signing is optional per event.
 */

import { ULID } from 'ulid'

// Discriminated union event types
export type ReasoningEventType =
  | 'observation'
  | 'classification'
  | 'decision'
  | 'action'
  | 'warning'
  | 'approval_required'
  | 'approval_resolved'
  | 'status'
  | 'done'
  | 'error'
  | 'paused_budget'

export interface ReasoningEventIntegrity {
  mac: string   // HMAC-SHA256 hex digest
  tag: string   // Integrity tag for tamper detection
}

export interface BaseReasoningEvent {
  event: 'reasoning'  // Discriminant — all events have event: 'reasoning'
  runId: string
  agentId: string
  step: ULID           // Time-sortable unique step identifier
  sequence: number     // Monotonically increasing per-run sequence number
  type: ReasoningEventType
  content: Record<string, unknown>
  timestamp: number
  version: 1           // Schema version — currently always 1
  integrity?: ReasoningEventIntegrity
}

// Discriminated union: each type has its own content shape
export interface ObservationEvent extends BaseReasoningEvent {
  type: 'observation'
  content: {
    text: string
    evidence?: Record<string, unknown>
  }
}

export interface ClassificationEvent extends BaseReasoningEvent {
  type: 'classification'
  content: {
    label: string
    confidence: number
    alternatives?: Array<{ label: string; confidence: number }>
  }
}

export interface DecisionEvent extends BaseReasoningEvent {
  type: 'decision'
  content: {
    alternatives: Array<{ label: string; reason: string }>
    chosen: string
    reason: string
  }
}

export interface ActionEvent extends BaseReasoningEvent {
  type: 'action'
  content: {
    action: string
    args: Record<string, unknown>
    result?: unknown
  }
}

export interface WarningEvent extends BaseReasoningEvent {
  type: 'warning'
  content: {
    text: string
    severity: 'low' | 'medium' | 'high'
  }
}

export interface ApprovalRequiredEvent extends BaseReasoningEvent {
  type: 'approval_required'
  content: {
    summary: string
    fields: Array<{ name: string; value: unknown; label?: string }>
    toolCallId: string
    iteration: number
    maxIterations: number
  }
}

export interface ApprovalResolvedEvent extends BaseReasoningEvent {
  type: 'approval_resolved'
  content: {
    toolCallId: string
    decision: 'approved' | 'edited' | 'skipped' | 'cancelled'
    revisedArgs?: Record<string, unknown>
    reason?: string
  }
}

export interface StatusEvent extends BaseReasoningEvent {
  type: 'status'
  content: {
    status: 'ready' | 'running' | 'waiting' | 'completed' | 'error'
    result?: unknown
  }
}

export interface DoneEvent extends BaseReasoningEvent {
  type: 'done'
  content: {
    summary: string
    agentsCompleted: number
    agentsErrored: number
    durationMs: number
  }
}

export interface ErrorEvent extends BaseReasoningEvent {
  type: 'error'
  content: {
    message: string
    agentId?: string
  }
}

export interface BudgetPausedEvent extends BaseReasoningEvent {
  type: 'paused_budget'
  content: {
    elapsedMs: number
    budgetMs: number
  }
}

export type ReasoningEvent =
  | ObservationEvent
  | ClassificationEvent
  | DecisionEvent
  | ActionEvent
  | WarningEvent
  | ApprovalRequiredEvent
  | ApprovalResolvedEvent
  | StatusEvent
  | DoneEvent
  | ErrorEvent
  | BudgetPausedEvent

/**
 * Verify that an object conforms to the ReasoningEvent interface.
 * Used for runtime validation of events received over SSE.
 */
export function isReasoningEvent(obj: unknown): obj is ReasoningEvent {
  if (!obj || typeof obj !== 'object') return false
  const e = obj as Record<string, unknown>
  return (
    e.event === 'reasoning' &&
    typeof e.runId === 'string' &&
    typeof e.agentId === 'string' &&
    typeof e.step === 'string' &&
    typeof e.sequence === 'number' &&
    typeof e.type === 'string' &&
    typeof e.content === 'object' &&
    e.content !== null &&
    typeof e.timestamp === 'number' &&
    e.version === 1
  )
}
