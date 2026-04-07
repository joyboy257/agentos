/**
 * Slack → HubSpot Alert Wiring
 *
 * When hubspot.deals.create fires with amount > $5000, send a Slack DM
 * to the deal's assigned owner alerting them of the new high-value deal.
 *
 * Uses the postToolCall hook so the alert fires after the deal is confirmed.
 */

import { getHookRegistry } from '@/lib/hooks/hook-registry'
import { getHubSpotAccessToken, getDeal } from '@/lib/connectors/hubspot/client'
import { getSlackToken, sendMessage } from '@/lib/integrations/slack/client'

const DEAL_ALERT_THRESHOLD = 5000

/**
 * Format a dollar amount for display.
 */
function formatCurrency(amount: string | undefined): string {
  if (!amount) return 'unknown'
  const num = parseFloat(amount)
  if (isNaN(num)) return amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

/**
 * Look up a user's Slack ID from their email using Slack's users.lookupByEmail API.
 */
async function findSlackUserId(token: string, email: string): Promise<string | null> {
  const res = await fetch('https://slack.com/api/users.lookupByEmail', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  if (!res.ok) return null

  const data = await res.json() as { ok: boolean; user?: { id: string } }
  if (!data.ok || !data.user) return null

  return data.user.id
}

/**
 * Send a Slack DM to a user by their Slack user ID.
 */
async function sendDealAlertDm(
  slackToken: string,
  slackUserId: string,
  dealName: string,
  amount: string,
  dealId: string
): Promise<void> {
  const formattedAmount = formatCurrency(amount)
  const text =
    `:moneybag: *New high-value deal created*\n\n` +
    `*Deal:* ${dealName}\n` +
    `*Amount:* ${formattedAmount}\n` +
    `*Deal ID:* ${dealId}\n\n` +
    `A new deal over $5K has been added to your pipeline. Time to follow up!`

  // Slack DMs use the user's Slack ID as the channel
  await sendMessage(slackToken, slackUserId, text)
}

/**
 * Register the HubSpot deal alert hook.
 * Fires on postToolCall — only after a tool has successfully executed.
 */
export function registerHubSpotDealAlertHook(): void {
  const registry = getHookRegistry()

  registry.register('postToolCall', 'hubspot-deal-alert', async (ctx) => {
    const { toolName, result } = ctx.postToolCall ?? {}

    // Only react to hubspot.deals.create
    if (toolName !== 'hubspot.deals.create') return { success: true }

    // result must be a successful tool result
    const toolResult = result as { success?: boolean; data?: unknown }
    if (!toolResult?.success) return { success: true }

    const data = toolResult.data as {
      deal?: { id?: string; amount?: string; dealname?: string; dealstage?: string }
    }
    const deal = data?.deal
    if (!deal?.id) return { success: true }

    // Check threshold
    const amount = deal.amount ?? '0'
    const numericAmount = parseFloat(amount.replace(/[^0-9.-]/g, ''))
    if (isNaN(numericAmount) || numericAmount <= DEAL_ALERT_THRESHOLD) {
      return { success: true }
    }

    // Get the deal to find the owner email
    let ownerEmail: string | undefined

    try {
      const hubspotToken = await getHubSpotAccessToken(ctx.agentId ?? '')
      if (!hubspotToken) return { success: true }

      const fullDeal = await getDeal(hubspotToken, deal.id)
      if (!fullDeal) return { success: true }

      // HubSpot deal owner email — stored in hubspot_owner_email property
      ownerEmail = (fullDeal as any).properties?.hubspot_owner_email
        ?? (fullDeal as any).properties?.owner_email

      if (!ownerEmail) return { success: true }
    } catch {
      // Network errors — silently skip
      return { success: true }
    }

    // Send the Slack DM
    try {
      const slackToken = await getSlackToken(ctx.agentId ?? '')
      if (!slackToken) return { success: true }

      const slackUserId = await findSlackUserId(slackToken, ownerEmail!)
      if (!slackUserId) return { success: true }

      await sendDealAlertDm(
        slackToken,
        slackUserId,
        deal.dealname ?? 'Unnamed Deal',
        amount,
        deal.id
      )
    } catch (err) {
      // Log but don't fail — this is a non-critical side effect
      console.error('[hubspot-deal-alert] Failed to send Slack DM:', err)
    }

    return { success: true }
  })
}

// Auto-register on import
registerHubSpotDealAlertHook()
