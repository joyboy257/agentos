/**
 * Module-level store for the currently active escalation.
 * Used to coordinate escalation state between InfiniteCanvas (SSE bridge)
 * and NodeDetailPanel (which needs to know when escalation is active).
 *
 * For MVP: simple in-memory store. Phase 2 would move this to React context
 * with proper run-scoped isolation.
 */

let _activeEscalationId: string | null = null
let _activeEscalationRunId: string | null = null

export function getActiveEscalation(): { id: string | null; runId: string | null } {
  return { id: _activeEscalationId, runId: _activeEscalationRunId }
}

export function setActiveEscalation(id: string, runId: string): void {
  _activeEscalationId = id
  _activeEscalationRunId = runId
}

export function clearActiveEscalation(): void {
  _activeEscalationId = null
  _activeEscalationRunId = null
}
