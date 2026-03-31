/**
 * capturePointInTime() — atomic reasoning snapshot for approval modal.
 *
 * Called at the moment an approval is requested. Freezes the event buffer
 * at that point in time. The approval modal reads from this snapshot,
 * not from the live SSE stream. Subsequent events (after approval request)
 * are not visible in the modal.
 *
 * This module is the public interface layer on top of EventBuffer.capturePointInTime().
 */

import { EventBuffer, eventBufferRegistry, ReasoningSnapshot } from './event-buffer'
import { ReasoningEvent, ApprovalRequiredEvent } from './event-schema'

/**
 * Request a point-in-time snapshot for a run.
 * Call this when an approval is required — before emitting approval_required.
 *
 * Returns an immutable ReasoningSnapshot that will not reflect subsequent
 * event additions to the buffer.
 */
export function capturePointInTime(runId: string): ReasoningSnapshot {
  const buffer = eventBufferRegistry.get(runId)
  if (!buffer) {
    // No buffer yet — return empty snapshot
    return new ReasoningSnapshot(runId, [], 0)
  }
  return buffer.capturePointInTime()
}

/**
 * Get the live event buffer for a run (for non-approval use cases).
 */
export function getEventBuffer(runId: string): EventBuffer {
  return eventBufferRegistry.getOrCreate(runId)
}

/**
 * Extract a human-readable summary from a reasoning snapshot.
 * Used by the approval modal to display what the agent was doing.
 */
export function summarizeSnapshot(snapshot: ReasoningSnapshot): {
  totalEvents: number
  lastObservation: string | null
  agentActivities: Record<string, number>
  timeline: Array<{ sequence: number; type: string; summary: string; timestamp: number }>
} {
  const timeline: Array<{ sequence: number; type: string; summary: string; timestamp: number }> = []
  const agentActivities: Record<string, number> = {}

  for (const event of snapshot.events) {
    agentActivities[event.agentId] = (agentActivities[event.agentId] || 0) + 1

    let summary = ''
    switch (event.type) {
      case 'observation':
        summary = (event.content as { text: string }).text
        break
      case 'classification':
        summary = `Classified as "${(event.content as { label: string }).label}"`
        break
      case 'decision':
        summary = `Decided: ${(event.content as { chosen: string }).chosen}`
        break
      case 'action':
        summary = `Action: ${(event.content as { action: string }).action}`
        break
      case 'warning':
        summary = `Warning: ${(event.content as { text: string }).text}`
        break
      case 'approval_required':
        summary = `Approval required: ${(event.content as { summary: string }).summary}`
        break
      case 'approval_resolved':
        summary = `Approval ${(event.content as { decision: string }).decision}`
        break
      case 'status':
        summary = `Status: ${(event.content as { status: string }).status}`
        break
      case 'done':
        summary = 'Run completed'
        break
      case 'error':
        summary = `Error: ${(event.content as { message: string }).message}`
        break
      default: {
        // Defensive: handle unknown event types gracefully
        const unknownType = (event as ReasoningEvent).type
        summary = `[${unknownType}]`
      }
    }

    timeline.push({
      sequence: event.sequence,
      type: event.type,
      summary,
      timestamp: event.timestamp,
    })
  }

  const lastEvent = snapshot.events[snapshot.events.length - 1]
  let lastObservation: string | null = null
  if (lastEvent?.type === 'observation') {
    lastObservation = (lastEvent.content as { text: string }).text
  }

  return {
    totalEvents: snapshot.events.length,
    lastObservation,
    agentActivities,
    timeline,
  }
}

/**
 * Check if an approval_required event exists in the snapshot.
 * Returns the event if found.
 */
export function findApprovalRequired(
  snapshot: ReasoningSnapshot,
  toolCallId?: string
): ApprovalRequiredEvent | null {
  const events = snapshot.events as ReasoningEvent[]
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'approval_required') {
      const approvalEvent = e as ApprovalRequiredEvent
      if (!toolCallId || approvalEvent.content.toolCallId === toolCallId) {
        return approvalEvent
      }
    }
  }
  return null
}
