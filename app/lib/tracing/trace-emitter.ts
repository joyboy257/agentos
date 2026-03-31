/**
 * Pattern B: Dedicated emit* methods for each reasoning milestone type.
 *
 * Each agent gets a TraceEmitter instance with methods:
 * - emitObservation(text, evidence?)  — "Checking inbox"
 * - emitClassification(label, confidence, alternatives?)  — "This is a lead inquiry"
 * - emitDecision(alternatives, chosen, reason)  — "Send to sales team"
 * - emitAction(action, args, result?)  — "Sending email to 47 recipients"
 * - emitWarning(text, severity)  — "Rate limit approaching"
 *
 * All events are:
 * 1. Signed with HMAC-SHA256 using per-run secret
 * 2. Sanitized (PII redacted) before emission
 * 3. Written to the per-run EventBuffer
 * 4. Emitted to the SSE channel for real-time streaming
 */

import { ulid } from 'ulid'
import {
  ReasoningEvent,
  ObservationEvent,
  ClassificationEvent,
  DecisionEvent,
  ActionEvent,
  WarningEvent,
} from './event-schema'
import { EventBuffer, eventBufferRegistry } from './event-buffer'
import { emitToRunChannel } from './sse-stream'
import { sanitizeEvidence } from './sanitize'
import { runSecretRegistry, HMACSigningContext } from './hmac-signing'
import { EventAggregator } from './event-aggregator'

export interface TraceEmitterOptions {
  runId: string
  agentId: string
  signingContext?: HMACSigningContext
}

/**
 * TraceEmitter — provides Pattern B emit* methods for an agent in a run.
 *
 * Usage:
 *   const trace = new TraceEmitter({ runId, agentId })
 *   trace.emitObservation("Checking inbox", { unreadCount: 12 })
 *   trace.emitDecision({ alternatives: [...], chosen: "send_email", reason: "..." })
 */
export class TraceEmitter {
  private readonly runId: string
  private readonly agentId: string
  private readonly buffer: EventBuffer
  private readonly aggregator: EventAggregator
  private readonly signingContext: HMACSigningContext | null

  constructor(options: TraceEmitterOptions) {
    this.runId = options.runId
    this.agentId = options.agentId
    this.buffer = eventBufferRegistry.getOrCreate(options.runId)
    this.signingContext = runSecretRegistry.get(options.runId) ?? options.signingContext ?? null

    // Create aggregator that writes to buffer with integrity preserved
    this.aggregator = new EventAggregator((event) => {
      // Add to buffer - use addEventWithIntegrity if event has integrity
      if (event.integrity) {
        this.buffer.addEventWithIntegrity(event)
        emitToRunChannel(this.runId, event)
      } else {
        this.buffer.addEvent(this.agentId, event.type, event.content)
        emitToRunChannel(this.runId, event)
      }
    })
  }

  /**
   * Create a new ULID step for a milestone.
   */
  private createStep(): string {
    return ulid()
  }

  /**
   * Sign an event if signing context is available.
   */
  private sign(event: ReasoningEvent): ReasoningEvent {
    if (!this.signingContext) return event
    return this.signingContext.sign(event)
  }

  /**
   * Emit an observation event.
   * e.g., "Checking inbox", "Found 12 unread emails"
   */
  emitObservation(text: string, evidence?: Record<string, unknown>): void {
    const sanitizedEvidence = evidence ? sanitizeEvidence(evidence) : undefined
    const event: ObservationEvent = {
      event: 'reasoning',
      runId: this.runId,
      agentId: this.agentId,
      step: this.createStep(),
      sequence: 0,
      type: 'observation',
      content: {
        text,
        evidence: sanitizedEvidence as ObservationEvent['content']['evidence'],
      },
      timestamp: Date.now(),
      version: 1,
    }

    const signed = this.sign(event)
    this.aggregator.push(signed)
  }

  /**
   * Emit a classification event.
   * e.g., "This is a lead inquiry" with confidence 0.87
   */
  emitClassification(
    label: string,
    confidence: number,
    alternatives?: Array<{ label: string; confidence: number }>
  ): void {
    const event: ClassificationEvent = {
      event: 'reasoning',
      runId: this.runId,
      agentId: this.agentId,
      step: this.createStep(),
      sequence: 0,
      type: 'classification',
      content: {
        label,
        confidence,
        alternatives,
      },
      timestamp: Date.now(),
      version: 1,
    }

    const signed = this.sign(event)
    if (signed.integrity) {
      this.buffer.addEventWithIntegrity(signed)
      emitToRunChannel(this.runId, signed)
    } else {
      this.buffer.addEvent(this.agentId, event.type, event.content)
      emitToRunChannel(this.runId, signed)
    }
  }

  /**
   * Emit a decision event.
   * e.g., "Decided to send to sales team" with alternatives considered
   */
  emitDecision(alternatives: Array<{ label: string; reason: string }>, chosen: string, reason: string): void {
    const event: DecisionEvent = {
      event: 'reasoning',
      runId: this.runId,
      agentId: this.agentId,
      step: this.createStep(),
      sequence: 0,
      type: 'decision',
      content: {
        alternatives,
        chosen,
        reason,
      },
      timestamp: Date.now(),
      version: 1,
    }

    const signed = this.sign(event)
    if (signed.integrity) {
      this.buffer.addEventWithIntegrity(signed)
      emitToRunChannel(this.runId, signed)
    } else {
      this.buffer.addEvent(this.agentId, event.type, event.content)
      emitToRunChannel(this.runId, signed)
    }
  }

  /**
   * Emit an action event.
   * e.g., "Sending email", "Searching web"
   */
  emitAction(action: string, args: Record<string, unknown>, result?: unknown): void {
    const sanitizedArgs = sanitizeEvidence(args) as Record<string, unknown>
    const sanitizedResult = result ? sanitizeEvidence(result) : undefined

    const event: ActionEvent = {
      event: 'reasoning',
      runId: this.runId,
      agentId: this.agentId,
      step: this.createStep(),
      sequence: 0,
      type: 'action',
      content: {
        action,
        args: sanitizedArgs,
        result: sanitizedResult as ActionEvent['content']['result'],
      },
      timestamp: Date.now(),
      version: 1,
    }

    const signed = this.sign(event)
    if (signed.integrity) {
      this.buffer.addEventWithIntegrity(signed)
      emitToRunChannel(this.runId, signed)
    } else {
      this.buffer.addEvent(this.agentId, event.type, event.content)
      emitToRunChannel(this.runId, signed)
    }
  }

  /**
   * Emit a warning event.
   * e.g., "Rate limit approaching", "API timeout"
   */
  emitWarning(text: string, severity: 'low' | 'medium' | 'high' = 'medium'): void {
    const event: WarningEvent = {
      event: 'reasoning',
      runId: this.runId,
      agentId: this.agentId,
      step: this.createStep(),
      sequence: 0,
      type: 'warning',
      content: {
        text,
        severity,
      },
      timestamp: Date.now(),
      version: 1,
    }

    const signed = this.sign(event)
    if (signed.integrity) {
      this.buffer.addEventWithIntegrity(signed)
      emitToRunChannel(this.runId, signed)
    } else {
      this.buffer.addEvent(this.agentId, event.type, event.content)
      emitToRunChannel(this.runId, signed)
    }
  }

  /**
   * Flush any pending aggregated events.
   * Call this at the end of agent execution.
   */
  close(): void {
    this.aggregator.close()
  }
}

/**
 * Create a TraceEmitter bound to a run and agent.
 */
export function createTraceEmitter(runId: string, agentId: string): TraceEmitter {
  return new TraceEmitter({ runId, agentId })
}
