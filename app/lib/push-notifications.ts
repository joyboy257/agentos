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

  // Fetch all active push subscriptions for this user
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
