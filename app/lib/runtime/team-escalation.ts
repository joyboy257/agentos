/**
 * Team Lead escalation reasoning.
 *
 * The Team Lead evaluates blocked workers and decides whether to escalate to Maria
 * based on: lane events (worker blocked), artifact analysis, and worker history.
 *
 * Unit H — Escalation + Completion
 */

import type { LaneEvent, LaneEventStatus } from './lane-events'
import type { Artifact } from './artifacts'

export interface EscalationRecommendation {
  shouldEscalate: boolean
  reason: string
  confidence: number
  proposedAction?: string
  blastRadius?: string
}

/**
 * Team Lead evaluates a blocked worker and decides whether to escalate to Maria.
 *
 * Escalation triggers:
 * 1. High-value entity detected in artifact (e.g., deal > $50K)
 * 2. Worker blocked more than twice
 * 3. Error artifact with no auto-recovery path
 */
export function evaluateEscalation(
  blockedEvent: LaneEvent,
  taskOutput: Artifact | undefined,
  workerHistory: LaneEvent[]
): EscalationRecommendation {
  // Rule 1: High-value lead profile — escalate for human approval
  if (taskOutput && typeof taskOutput === 'object' && 'type' in taskOutput) {
    const artifact = taskOutput as Record<string, unknown>

    if (artifact.type === 'lead_profile') {
      const value = artifact.value as string | undefined
      if (value && parseValue(value) > 50000) {
        const contact = artifact.contact as { name?: string; email?: string } | undefined
        return {
          shouldEscalate: true,
          reason: `High-value lead (${value}) requires human approval`,
          confidence: 0.95,
          proposedAction: `Send follow-up email to ${contact?.email ?? 'unknown'}`,
          blastRadius: 'Email will be sent to a new contact outside approved list',
        }
      }
    }

    // Rule 2: Escalation context artifact from worker
    if (artifact.type === 'escalation_context') {
      return {
        shouldEscalate: true,
        reason: artifact.reason as string,
        confidence: 0.90,
        proposedAction: artifact.proposedAction as string,
        blastRadius: artifact.blastRadius as string | undefined,
      }
    }
  }

  // Rule 3: Worker blocked more than twice — needs human guidance
  const workerBlockedCount = workerHistory.filter(
    e => e.agent_id === blockedEvent.agent_id && e.type === 'lane.blocked'
  ).length
  if (workerBlockedCount >= 2) {
    return {
      shouldEscalate: true,
      reason: 'Worker is repeatedly blocked — needs human guidance',
      confidence: 0.80,
    }
  }

  // Default: Team Lead can handle it without escalation
  return {
    shouldEscalate: false,
    reason: 'Team Lead can proceed without escalation',
    confidence: 0.70,
  }
}

/**
 * parseValue — extract dollar amount from "$50K" or "$50,000" or "$1.2M"
 */
export function parseValue(valueStr: string): number {
  if (!valueStr) return 0
  const cleaned = valueStr.replace(/[$,]/g, '')
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*([KkMm])?/)
  if (!match) return 0
  let num = parseFloat(match[1])
  if (match[2]?.toLowerCase() === 'k') num *= 1000
  if (match[2]?.toLowerCase() === 'm') num *= 1000000
  return num
}

/**
 * Aggregate team results when all paths complete.
 * Produces a summary for Maria's activity log.
 */
export function aggregateTeamResults(
  completedEvents: LaneEvent[],
  artifacts: Map<string, Artifact>
): {
  summary: string
  agentCount: number
  artifactCount: number
  escalatedCount: number
} {
  const completedAgents: string[] = []
  const escalatedAgents: string[] = []

  for (const event of completedEvents) {
    if (event.type === 'lane.completed') {
      completedAgents.push(event.agent_id)
    }
    if (event.status === 'blocked' || event.type === 'lane.blocked') {
      escalatedAgents.push(event.agent_id)
    }
  }

  const uniqueAgents = [...new Set([...completedAgents, ...escalatedAgents])]
  const artifactTypes = [...artifacts.values()].map(a =>
    typeof a === 'object' && a !== null ? (a as { type?: string }).type ?? 'unknown' : 'unknown'
  )

  return {
    summary: `Team completed: ${completedAgents.length} agents finished${
      escalatedAgents.length > 0 ? `, ${escalatedAgents.length} escalated` : ''
    }. Artifacts: ${artifactTypes.join(', ') || 'none'}.`,
    agentCount: uniqueAgents.length,
    artifactCount: artifacts.size,
    escalatedCount: escalatedAgents.length,
  }
}
