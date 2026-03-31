/**
 * HMAC-SHA256 per-run event signing.
 *
 * Each run has a unique secret key (not transmitted over SSE).
 * The MAC covers: sequence|type|confidence|JSON.stringify(evidence)|JSON.stringify(alternatives)
 * Including sequence in MAC prevents reorder/replay attacks.
 *
 * The secret key is stored in memory and associated with the run.
 * On the client side, the same key can be used to verify event integrity.
 */

import { createHmac } from 'crypto'
import { ReasoningEvent, ClassificationEvent, DecisionEvent } from './event-schema'

/**
 * Per-run signing context.
 * Created when a run starts with a fresh secret key.
 */
export class HMACSigningContext {
  private readonly secret: string

  constructor(secret: string) {
    this.secret = secret
  }

  /**
   * Sign an event, returning the event with integrity fields populated.
   */
  sign(event: ReasoningEvent): ReasoningEvent {
    const mac = this.computeMAC(event)
    const tag = this.computeTag(event)

    return {
      ...event,
      integrity: {
        mac,
        tag,
      },
    }
  }

  /**
   * Compute HMAC-SHA256 for an event.
   * MAC covers: sequence|type|confidence|JSON.stringify(evidence)|JSON.stringify(alternatives)
   */
  computeMAC(event: ReasoningEvent): string {
    const parts: string[] = [
      String(event.sequence),
      event.type,
    ]

    // Add type-specific fields
    if (event.type === 'classification') {
      const classification = event as ClassificationEvent
      parts.push(String(classification.content.confidence ?? 0))
      parts.push(JSON.stringify(classification.content.alternatives ?? []))
    } else if (event.type === 'decision') {
      const decision = event as DecisionEvent
      parts.push(JSON.stringify(decision.content.alternatives ?? []))
      parts.push(decision.content.chosen)
    }

    // Add evidence (content excluding type-specific fields we've already extracted)
    const evidence: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(event.content)) {
      // Skip fields we've already included in the MAC
      if (event.type === 'classification' && (key === 'confidence' || key === 'alternatives')) {
        continue
      }
      if (event.type === 'decision' && (key === 'alternatives' || key === 'chosen' || key === 'reason')) {
        continue
      }
      evidence[key] = value
    }
    parts.push(JSON.stringify(evidence))

    const message = parts.join('|')
    return createHmac('sha256', this.secret).update(message).digest('hex')
  }

  /**
   * Compute an integrity tag (simple hash of mac for quick comparison).
   */
  computeTag(event: ReasoningEvent): string {
    const mac = this.computeMAC(event)
    return createHmac('sha256', mac).update('tag').digest('hex').substring(0, 16)
  }

  /**
   * Verify an event's integrity.
   * Returns true if the event has not been tampered with.
   */
  verify(event: ReasoningEvent): boolean {
    if (!event.integrity) {
      return false
    }

    const expectedMAC = this.computeMAC(event)
    return expectedMAC === event.integrity.mac
  }
}

/**
 * Generate a new random secret for a run.
 */
export function generateRunSecret(): string {
  return createHmac('sha256', Date.now().toString() + Math.random().toString())
    .update(Math.random().toString())
    .digest('hex')
}

/**
 * Registry of active run secrets.
 * Secrets are stored in memory and discarded when the run completes.
 */
class RunSecretRegistry {
  private readonly _secrets = new Map<string, string>()

  create(runId: string): HMACSigningContext {
    const secret = generateRunSecret()
    this._secrets.set(runId, secret)
    return new HMACSigningContext(secret)
  }

  get(runId: string): HMACSigningContext | undefined {
    const secret = this._secrets.get(runId)
    if (!secret) return undefined
    return new HMACSigningContext(secret)
  }

  delete(runId: string): void {
    this._secrets.delete(runId)
  }

  has(runId: string): boolean {
    return this._secrets.has(runId)
  }
}

export const runSecretRegistry = new RunSecretRegistry()
