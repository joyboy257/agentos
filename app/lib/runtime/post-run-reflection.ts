/**
 * Post-Run Reflection — Phase C
 *
 * After every completed run, evaluates whether escalation suggestions apply.
 * Runs silently after every run — never blocks or pauses execution.
 *
 * Phase C scope: schedule_recurring + follow_on_task + connector_gap + approval_bump.
 *
 * Integration: called from DurableRunner.execute() after run status = 'completed'
 * See ARCHITECTURE-06 §4.1 for full trigger evaluation logic.
 */

import { ulid } from 'ulid'
import { sql } from '@vercel/postgres'
import { getCheckpointsForRun, getRun } from '../db/queries'
import type { EscalationSuggestion, TriggerResult } from './escalation-types'

const CONFIDENCE_THRESHOLD = 0.7
const RECURRING_RUN_COUNT = 3
const MAX_SUGGESTIONS_PER_RUN = 2

type SuggestionType = 'schedule_recurring' | 'follow_on_task' | 'connector_gap' | 'approval_bump' | 'budget_increase'

/**
 * Main entry point — call after a run completes successfully.
 * Creates suggestions in DB and returns them for optional immediate emission.
 */
export async function postRunReflection(runId: string): Promise<EscalationSuggestion[]> {
  const run = await getRun(runId)
  if (!run) {
    console.warn(`[PostRunReflection] Run not found: ${runId}`)
    return []
  }

  const agentId = run.agent_id

  // --- Evaluate all triggers ---
  const [scheduleSuggestion, followOnSuggestion, connectorGapSuggestion, approvalBumpSuggestion] =
    await Promise.all([
      evaluateScheduleRecurring(agentId, runId),
      evaluateFollowOnTask(agentId, runId),
      evaluateConnectorGap(agentId),
      evaluateApprovalBump(agentId),
    ])

  const allTriggers = [
    scheduleSuggestion,
    followOnSuggestion,
    connectorGapSuggestion,
    approvalBumpSuggestion,
  ].filter((t): t is TriggerResult => t !== null)

  const suggestions: EscalationSuggestion[] = []

  for (const trigger of allTriggers) {
    if (trigger.confidence >= CONFIDENCE_THRESHOLD) {
      const suggestion = await persistSuggestion({
        agentId,
        runId,
        ...trigger,
      })
      suggestions.push(suggestion)
    }
    if (suggestions.length >= MAX_SUGGESTIONS_PER_RUN) break
  }

  return suggestions
}

// ---------------------------------------------------------------------------
// Trigger: schedule_recurring
// ---------------------------------------------------------------------------

/**
 * Detects if a task has run 3+ times with similar input structure.
 * Uses checkpoint tool_args as a proxy for input signature.
 *
 * Algorithm:
 * 1. Get last 10 checkpoints across runs for this agent
 * 2. Cluster by tool_args shape (same keys = same structure)
 * 3. If cluster.size >= 3 with low variance → suggest scheduling
 */
async function evaluateScheduleRecurring(
  agentId: string,
  currentRunId: string
): Promise<TriggerResult | null> {
  // Get recent runs for this agent (last 10)
  const recentRuns = await sql`
    SELECT id, created_at FROM runs
    WHERE agent_id = ${agentId}
    ORDER BY created_at DESC
    LIMIT 10
  `

  if (recentRuns.rows.length < RECURRING_RUN_COUNT) {
    return null
  }

  // Collect tool args from checkpoints for each run
  interface RunToolSignature {
    runId: string
    toolArgs: Record<string, unknown> | null
    createdAt: Date
  }

  const signatures: RunToolSignature[] = []

  for (const runRow of recentRuns.rows) {
    const checkpoints = await getCheckpointsForRun(runRow.id)
    // Get the first tool call checkpoint for each run as the "signature"
    const toolCheckpoint = checkpoints.find(cp => cp.tool_args !== null)
    signatures.push({
      runId: runRow.id,
      toolArgs: (toolCheckpoint?.tool_args as Record<string, unknown>) ?? null,
      createdAt: runRow.created_at,
    })
  }

  // Cluster by tool_args shape (same keys = same structure)
  const clusters = clusterByShape(signatures)

  for (const cluster of clusters) {
    if (cluster.items.length >= RECURRING_RUN_COUNT) {
      const intervals = computeIntervals(cluster.items)
      const variance = computeVariance(intervals)

      // Low variance = consistent interval = good candidate for scheduling
      // High variance = random = not schedulable
      if (variance < 0.5) {
        const cron = inferCron(intervals)
        const label = cronToHumanLabel(cron)

        return {
          type: 'schedule_recurring',
          confidence: Math.min(0.5 + cluster.items.length * 0.1, 0.95),
          triggerDescription: `This task ran ${cluster.items.length} times with the same structure`,
          triggerEvidence: cluster.items.map(
            item => `Run ${item.runId}: ${JSON.stringify(item.toolArgs)?.slice(0, 50)}...`
          ),
          proposalHeadline: `Schedule this to run ${label}`,
          proposalDetail: `You've run this ${cluster.items.length} times manually. I can run it automatically on a schedule so you don't have to trigger it each time.`,
          proposalAction: {
            type: 'schedule',
            payload: {
              agentId,
              cronExpression: cron,
              proposedLabel: label,
              estimatedWeeklyRuns: estimateWeeklyRuns(intervals),
            },
          },
        }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Trigger: follow_on_task
// ---------------------------------------------------------------------------

/**
 * Detects if the last run output schema has a known natural follower.
 * Known followers: email:read → email:send, hubspot:leads → email:send,
 * web:search → distill:summarize
 */
async function evaluateFollowOnTask(
  agentId: string,
  runId: string
): Promise<TriggerResult | null> {
  const checkpoints = await getCheckpointsForRun(runId)
  // Find the last tool that produced output
  const toolCheckpoints = checkpoints.filter(cp => cp.tool_name !== null && cp.tool_result !== null)
  if (toolCheckpoints.length === 0) return null

  const lastTool = toolCheckpoints[toolCheckpoints.length - 1].tool_name as string

  const knownFollowers: Record<string, { follower: string; archetype: string; goal: string }> = {
    'email:read': { follower: 'email:send', archetype: 'process', goal: 'follow up on the emails I read' },
    'hubspot:leads': { follower: 'email:send', archetype: 'process', goal: 'follow up with leads who haven\'t replied in 7 days' },
    'web:search': { follower: 'distill:summarize', archetype: 'distill', goal: 'summarize the search results' },
    'calendar:query': { follower: 'email:send', archetype: 'process', goal: 'send meeting notes to attendees' },
  }

  const followerInfo = knownFollowers[lastTool]
  if (!followerInfo) return null

  return {
    type: 'follow_on_task',
    confidence: 0.75,
    triggerDescription: `Output from ${lastTool} has a natural next step`,
    triggerEvidence: [`${lastTool} → ${followerInfo.follower}`],
    proposalHeadline: `Add a ${followerInfo.follower} step after this task`,
    proposalDetail: `This task produces output that typically gets followed up on manually. I can add an automated follow-on step to handle the next logical action.`,
    proposalAction: {
      type: 'add_node',
      payload: {
        archetype: followerInfo.archetype,
        triggerGoal: followerInfo.goal,
        wireTo: [agentId],
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Trigger: connector_gap
// ---------------------------------------------------------------------------

/**
 * Detects if the agent attempted to use a tool for an app that is not connected.
 * Looks for checkpoints with a connector_not_connected error in tool_result.
 */
async function evaluateConnectorGap(agentId: string): Promise<TriggerResult | null> {
  const recentRuns = await sql`
    SELECT id FROM runs
    WHERE agent_id = ${agentId}
    ORDER BY created_at DESC
    LIMIT 5
  `

  for (const runRow of recentRuns.rows) {
    const checkpoints = await getCheckpointsForRun(runRow.id)
    for (const cp of checkpoints) {
      if (cp.tool_result && typeof cp.tool_result === 'object') {
        const result = cp.tool_result as Record<string, unknown>
        // Detect connector_not_connected error
        if (
          result.error === true ||
          (result.errorCode && String(result.errorCode).toLowerCase().includes('connector_not_connected')) ||
          (result.message && String(result.message).toLowerCase().includes('connector') && String(result.message).toLowerCase().includes('not connected'))
        ) {
          const toolName = cp.tool_name as string
          const appName = inferAppFromTool(toolName)
          return {
            type: 'connector_gap',
            confidence: 0.9,
            triggerDescription: `Agent tried to use ${appName} but it's not connected`,
            triggerEvidence: [`Tool: ${toolName}`, `Error: ${JSON.stringify(result.errorCode ?? result.message ?? 'connector_not_connected')}`],
            proposalHeadline: `Connect ${appName} to unlock this capability`,
            proposalDetail: `I tried to read from ${appName} but you haven't connected it yet. Connecting it would let me handle this step automatically.`,
            proposalAction: {
              type: 'connect_app',
              payload: {
                missingCapability: toolName,
                appName,
                promptToConnect: `Connect ${appName} so I can handle ${toolName} automatically`,
              },
            },
          }
        }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Trigger: approval_bump
// ---------------------------------------------------------------------------

/**
 * Detects if 10+ consecutive runs were auto-approved without escalation.
 * Suggests raising the approval threshold.
 */
async function evaluateApprovalBump(agentId: string): Promise<TriggerResult | null> {
  const recentDecisions = await sql`
    SELECT ad.decision, ad.run_id, ad.created_at,
           pa.status as approval_status
    FROM approval_decisions ad
    JOIN pending_approvals pa ON pa.id = ad.approval_id
    WHERE ad.agent_id = ${agentId}
    ORDER BY ad.created_at DESC
    LIMIT 20
  `

  if (recentDecisions.rows.length === 0) return null

  // Count consecutive auto-approved runs (decision = 'approved' and no pending/escalated state)
  let consecutiveAutoApproved = 0
  const evidence: string[] = []

  for (const row of recentDecisions.rows) {
    if (row.decision === 'approved') {
      consecutiveAutoApproved++
      if (evidence.length < 5) {
        evidence.push(`Run ${row.run_id}: auto-approved`)
      }
    } else {
      break
    }
  }

  if (consecutiveAutoApproved >= 10) {
    return {
      type: 'approval_bump',
      confidence: 0.8,
      triggerDescription: `${consecutiveAutoApproved} consecutive runs were auto-approved without escalation`,
      triggerEvidence: evidence,
      proposalHeadline: 'Raise your approval threshold — I haven\'t needed help in a while',
      proposalDetail: `Out of my last ${recentDecisions.rows.length} runs, I handled ${consecutiveAutoApproved} without escalating. You could raise my autonomy level so I handle more automatically.`,
      proposalAction: {
        type: 'adjust_threshold',
        payload: {
          runsSinceLastEscalation: consecutiveAutoApproved,
        },
      },
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Connector gap helper
// ---------------------------------------------------------------------------

function inferAppFromTool(toolName: string): string {
  const [prefix] = toolName.split(':')
  const appNames: Record<string, string> = {
    gmail: 'Gmail',
    hubspot: 'HubSpot',
    salesforce: 'Salesforce',
    calendar: 'Google Calendar',
    slack: 'Slack',
    notion: 'Notion',
    web: 'Web',
    jira: 'Jira',
  }
  return appNames[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

// ---------------------------------------------------------------------------
// Clustering helpers
// ---------------------------------------------------------------------------

interface Cluster {
  shapeKey: string
  items: Array<{ runId: string; toolArgs: Record<string, unknown> | null; createdAt: Date }>
}

function clusterByShape(
  signatures: Array<{ runId: string; toolArgs: Record<string, unknown> | null; createdAt: Date }>
): Cluster[] {
  const map = new Map<string, typeof signatures>()

  for (const sig of signatures) {
    const key = shapeKey(sig.toolArgs)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(sig)
  }

  return Array.from(map.entries()).map(([shapeKey, items]) => ({ shapeKey, items }))
}

function shapeKey(toolArgs: Record<string, unknown> | null): string {
  if (!toolArgs) return 'null'
  return Object.keys(toolArgs).sort().join(',')
}

function computeIntervals(
  items: Array<{ createdAt: Date }>
): number[] {
  // Sort by date ascending
  const sorted = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const ms = sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime()
    intervals.push(ms / (1000 * 60 * 60)) // hours
  }
  return intervals
}

function computeVariance(intervals: number[]): number {
  if (intervals.length === 0) return 0
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const squaredDiffs = intervals.map(x => Math.pow(x - mean, 2))
  return squaredDiffs.reduce((a, b) => a + b, 0) / intervals.length
}

// ---------------------------------------------------------------------------
// Cron inference
// ---------------------------------------------------------------------------

function inferCron(intervalsHours: number[]): string {
  if (intervalsHours.length === 0) return '0 9 * * *' // default: 9am daily

  const avgHours = intervalsHours.reduce((a, b) => a + b, 0) / intervalsHours.length
  const avgDays = avgHours / 24

  if (avgDays >= 6.5 && avgDays <= 7.5) return '0 9 * * 1'         // weekly (Monday)
  if (avgDays >= 0.9 && avgDays <= 1.1) return '0 9 * * *'         // daily
  if (avgDays >= 13.5 && avgDays <= 14.5) return '0 9 * * *'        // every 2 weeks
  if (avgHours >= 23.5 && avgHours <= 24.5) return '0 9 * * *'      // ~daily

  return '0 9 * * *' // default
}

function cronToHumanLabel(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length !== 5) return 'on a regular schedule'

  const [minute, hour, , , dayOfWeek] = parts

  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  const dayMap: Record<string, string> = {
    '1': 'Mondays', '2': 'Tuesdays', '3': 'Wednesdays',
    '4': 'Thursdays', '5': 'Fridays', '6': 'Saturdays', '7': 'Sundays',
  }

  if (dayOfWeek === '*') return `daily at ${time}`
  const day = dayMap[dayOfWeek] ?? dayOfWeek
  return `every ${day} at ${time}`
}

function estimateWeeklyRuns(intervalsHours: number[]): number {
  if (intervalsHours.length === 0) return 1
  const avgHours = intervalsHours.reduce((a, b) => a + b, 0) / intervalsHours.length
  return Math.round(168 / avgHours) // 168 hours in a week
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistSuggestion(data: {
  agentId: string
  runId: string
  type: SuggestionType
  confidence: number
  triggerDescription: string
  triggerEvidence: string[]
  proposalHeadline: string
  proposalDetail: string
  proposalAction: Record<string, unknown>
}): Promise<EscalationSuggestion> {
  const id = ulid()

  const result = await sql`
    INSERT INTO escalation_suggestions (
      id, agent_id, run_id, type, confidence,
      trigger_description, trigger_evidence,
      proposal_headline, proposal_detail, proposal_action,
      status, created_at
    ) VALUES (
      ${id},
      ${data.agentId},
      ${data.runId},
      ${data.type},
      ${data.confidence},
      ${data.triggerDescription},
      ${JSON.stringify(data.triggerEvidence)},
      ${data.proposalHeadline},
      ${data.proposalDetail},
      ${JSON.stringify(data.proposalAction)},
      'pending',
      NOW()
    )
    RETURNING *
  `

  return result.rows[0] as EscalationSuggestion
}
