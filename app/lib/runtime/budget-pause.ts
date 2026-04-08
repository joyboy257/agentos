/**
 * Budget pause logic — called when an agent's budget is exhausted.
 *
 * 1. Updates agent status to `paused_budget` in the DB
 * 2. Logs to activity log: "Agent paused — budget exhausted"
 * 3. Sends Maria a push notification
 * 4. Sets paused_budget_at timestamp
 */

import { sql } from '@vercel/postgres'
import { updateAgentStatus } from '../db/queries'
import { sendBudgetExhaustedPush } from '../push-notifications'

export interface BudgetPauseResult {
  agentId: string
  pausedAt: Date
}

/**
 * Pause an agent due to budget exhaustion.
 * Called from durable-runner.ts when stopReason === 'budget_exceeded'.
 */
export async function pauseAgentForBudget(params: {
  agentId: string
  userId: string
  agentName: string
  budgetMs: number
  elapsedMs: number
}): Promise<BudgetPauseResult> {
  const { agentId, userId, agentName, budgetMs, elapsedMs } = params
  const now = new Date()

  // 1. Update agent status to paused_budget and set timestamp
  await sql`
    UPDATE agents
    SET status = 'paused_budget', paused_budget_at = ${now.toISOString()}, updated_at = NOW()
    WHERE id = ${agentId}
  `

  // 2. Log to activity log (runs table)
  await sql`
    UPDATE runs
    SET budget_exhausted_at = ${now.toISOString()}
    WHERE agent_id = ${agentId}
    ORDER BY created_at DESC
    LIMIT 1
  `

  // 3. Send push notification to Maria
  await sendBudgetExhaustedPush({
    agentId,
    userId,
    agentName,
    budgetMs,
    elapsedMs,
  })

  console.info(`[BudgetPause] Agent ${agentId} paused for budget exhaustion`)

  return { agentId, pausedAt: now }
}

/**
 * Resume a paused_budget agent — clears the paused status.
 * Called from the resume endpoint (/api/agents/[id]/resume).
 */
export async function resumeAgentFromBudget(agentId: string): Promise<void> {
  await sql`
    UPDATE agents
    SET status = 'idle', paused_budget_at = NULL, updated_at = NOW()
    WHERE id = ${agentId} AND status = 'paused_budget'
  `
  console.info(`[BudgetPause] Agent ${agentId} resumed from budget pause`)
}
