/**
 * Push Notifications — Web Push implementation
 *
 * Flow: approval-manager.ts emits a preApproval hook → sendApprovalPush sends
 * Web Push to all subscribed browsers for the user whose run it is.
 *
 * VAPID keys — must be set via environment variables.
 * Generate them with: npx web-push generate-vapid-keys
 */

import webpush from 'web-push'
import { sql } from '@vercel/postgres'

import { isSlackConnected, sendMessage as sendSlackMessage, getSlackToken, listChannels } from './integrations/slack'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@agentos.ai'

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('Missing VAPID keys: set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars')
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

export { VAPID_PUBLIC_KEY }

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: Date
}

/**
 * Send a push notification to all browser subscriptions for the user who owns the run.
 * Also routes to Slack if the user has Slack connected.
 * Called from the preApproval hook in approval-manager.ts.
 */
export async function sendApprovalPush(params: {
  runId: string
  agentId: string
  toolName: string
  summary: string
  toolCallId: string
}): Promise<void> {
  const { runId, agentId, toolName, summary, toolCallId } = params

  // Look up userId and agent name from the run
  const runResult = await sql`
    SELECT r.user_id, a.name
    FROM runs r
    JOIN agents a ON a.id = r.agent_id
    WHERE r.id = ${runId}
  `
  if (runResult.rows.length === 0) {
    console.warn(`[push] run not found: ${runId}`)
    return
  }
  const userId = runResult.rows[0].user_id
  const agentName = runResult.rows[0].name || 'Agent'

  // ── Slack notification transport ────────────────────────────────────────────
  if (await isSlackConnected(userId)) {
    const token = await getSlackToken(userId)
    if (token) {
      try {
        // Find the user's default channel (#general or first available)
        const { channels } = await listChannels(token, 10)
        const defaultChannel = channels.find((c) => c.name === 'general') ?? channels[0]
        if (defaultChannel) {
          const text = [
            `*Agent needs your input — ${agentName}*`,
            ``,
            `*Waiting on:* ${summary}`,
            ``,
            `_View and approve at ${process.env.NEXT_PUBLIC_APP_URL}/runs/${runId}_`,
          ].join('\n')
          await sendSlackMessage(token, defaultChannel.id, text)
        }
      } catch (err) {
        console.error('[push] slack send error:', err)
      }
    }
  }

  // ── Web Push notification transport ────────────────────────────────────────
  const result = await sql`
    SELECT endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE user_id = ${userId}
  `

  if (result.rows.length === 0) return

  const payload = JSON.stringify({
    title: 'Agent needs your input',
    body: `${agentName} is waiting on: ${summary}`,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: `approval-${toolCallId}`,
    data: { runId, toolCallId, agentId },
    actions: [
      { action: 'approve', title: 'Approve' },
      { action: 'view', title: 'View' },
    ],
  })

  for (const row of result.rows) {
    const sub = {
      endpoint: row.endpoint as string,
      keys: { p256dh: row.p256dh as string, auth: row.auth as string },
    }
    try {
      await webpush.sendNotification(sub, payload)
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      // If subscription expired or gone, delete it
      if (statusCode === 404 || statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint}`
      } else {
        console.error('[push] send error:', err)
      }
    }
  }
}

/**
 * Send a push notification when an agent's budget is exhausted.
 */
export async function sendBudgetExhaustedPush(params: {
  agentId: string
  userId: string
  agentName: string
  budgetMs: number
  elapsedMs: number
}): Promise<void> {
  const { agentId, userId, agentName, budgetMs, elapsedMs } = params

  const budgetDollars = (budgetMs / 1000 * 0.001).toFixed(2) // rough conversion

  // ── Slack notification transport ────────────────────────────────────────────
  if (await isSlackConnected(userId)) {
    const token = await getSlackToken(userId)
    if (token) {
      try {
        const { channels } = await listChannels(token, 10)
        const defaultChannel = channels.find((c) => c.name === 'general') ?? channels[0]
        if (defaultChannel) {
          const text = [
            `*Agent paused — ${agentName}*`,
            ``,
            `Budget of $${budgetDollars} has been reached.`,
            ``,
            `_Add more budget at ${process.env.NEXT_PUBLIC_APP_URL}/settings/agents_`,
          ].join('\n')
          await sendSlackMessage(token, defaultChannel.id, text)
        }
      } catch (err) {
        console.error('[push] slack send error:', err)
      }
    }
  }

  // ── Web Push notification transport ────────────────────────────────────────
  const result = await sql`
    SELECT endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE user_id = ${userId}
  `

  if (result.rows.length === 0) return

  const payload = JSON.stringify({
    title: 'Agent paused — budget reached',
    body: `${agentName} paused — budget of $${budgetDollars} reached. Tap to add more budget.`,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: `budget-${agentId}`,
    data: { agentId, type: 'budget_exhausted' },
    actions: [
      { action: 'add_budget', title: 'Add budget' },
      { action: 'view', title: 'View agent' },
    ],
  })

  for (const row of result.rows) {
    const sub = {
      endpoint: row.endpoint as string,
      keys: { p256dh: row.p256dh as string, auth: row.auth as string },
    }
    try {
      await webpush.sendNotification(sub, payload)
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint}`
      } else {
        console.error('[push] send error:', err)
      }
    }
  }
}

/**
 * Save a push subscription for a user (called from /api/push/subscribe).
 */
export async function savePushSubscription(params: {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}): Promise<void> {
  const { userId, endpoint, p256dh, auth } = params
  await sql`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
    VALUES (gen_random_uuid(), ${userId}, ${endpoint}, ${p256dh}, ${auth}, NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth
  `
}

/**
 * Delete a push subscription (called when user opts out).
 */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`
}

/**
 * Send a push notification when a proactive (scheduled) agent run completes.
 * Tells Maria what the agent did while she slept.
 *
 * Title example: "Email Agent ran at 7am — 3 emails processed"
 */
export async function sendProactiveRunPush(params: {
  agentId: string
  agentName: string
  userId: string
  runId: string
  status: string
  cronExpression?: string
}): Promise<void> {
  const { agentName, userId, runId, status } = params

  const summary = status === 'completed'
    ? `${agentName} completed its scheduled run successfully.`
    : status === 'waiting_for_approval'
    ? `${agentName} completed — 1 escalation needs your input.`
    : `${agentName} run ended with status: ${status}.`

  const title = `${agentName} ran on schedule`

  // ── Slack notification transport ────────────────────────────────────────────
  if (await isSlackConnected(userId)) {
    const token = await getSlackToken(userId)
    if (token) {
      try {
        const { channels } = await listChannels(token, 10)
        const defaultChannel = channels.find((c) => c.name === 'general') ?? channels[0]
        if (defaultChannel) {
          const text = [
            `*${title}*`,
            ``,
            `_${summary}_`,
            ``,
            `_View run at ${process.env.NEXT_PUBLIC_APP_URL}/runs/${runId}_`,
          ].join('\n')
          await sendSlackMessage(token, defaultChannel.id, text)
        }
      } catch (err) {
        console.error('[push] proactive run slack send error:', err)
      }
    }
  }

  // ── Web Push notification transport ────────────────────────────────────────
  const result = await sql`
    SELECT endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE user_id = ${userId}
  `

  if (result.rows.length === 0) return

  const payload = JSON.stringify({
    title,
    body: summary,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: `proactive-${runId}`,
    data: { runId, agentId: params.agentId },
    actions: [
      { action: 'view', title: 'View' },
    ],
  })

  for (const row of result.rows) {
    const sub = {
      endpoint: row.endpoint as string,
      keys: { p256dh: row.p256dh as string, auth: row.auth as string },
    }
    try {
      await webpush.sendNotification(sub, payload)
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint}`
      } else {
        console.error('[push] proactive run send error:', err)
      }
    }
  }
}
