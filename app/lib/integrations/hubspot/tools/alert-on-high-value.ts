/**
 * HubSpot Alert Tools — wire HubSpot events to Slack notifications.
 *
 * These are not agent tools in the traditional sense — they are triggered
 * automatically when HubSpot events fire (via hook listeners), and they
 * send Slack DMs or channel posts to notify the appropriate people.
 *
 * Triggers:
 *   - hubspot.deals.create (amount > $5000) → Slack DM to deal owner
 *   - hubspot.deals.update_stage (stage → "Closed Won") → post to #office
 */

import { getHubSpotAccessToken, getDeal, listContacts } from '@/lib/connectors/hubspot/client'
import { getSlackToken, postMessage } from '@/lib/connectors/slack/client'
import { listChannels } from '@/lib/integrations/slack/client'
import type { ToolResult } from '@/lib/capability-registry/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findSlackUserIdByEmail(token: string, email: string): Promise<string | null> {
  // Look up a Slack user by their email to send a DM
  const slackApiRequest = async (method: string, body: Record<string, unknown>) => {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    return response.json() as Promise<{ ok: boolean; user?: { id: string }; error?: string }>
  }

  const data = await slackApiRequest('users.lookupByEmail', { email })
  if (!data.ok || !data.user) return null
  return data.user.id
}

async function findSlackChannelId(token: string, channelName: string): Promise<string | null> {
  // Find a channel ID by name
  const { channels } = await listChannels(token, 100)
  const channel = channels.find((c: { name: string }) => c.name === channelName.replace(/^#/, ''))
  return channel?.id ?? null
}

// ---------------------------------------------------------------------------
// Tool: alert on high-value deal
// ---------------------------------------------------------------------------

export interface AlertHighValueDealInput {
  dealId: string
}

export async function alertHighValueDeal(
  args: AlertHighValueDealInput
): Promise<ToolResult> {
  const { dealId } = args

  // Get the deal details from HubSpot
  const ownersResult = await listContacts(process.env.HUBSPOT_DEMO_USER_ID ?? 'demo', 100)
  // We need to get the deal with its owner info
  // For now, fetch the deal and check amount
  let hubspotToken: string | null = null
  let deal: any = null
  let dealOwnerEmail: string | null = null
  let dealOwnerName: string | null = null
  let dealName: string = 'Unknown Deal'
  let dealAmount: string = '0'

  try {
    hubspotToken = await getHubSpotAccessToken(process.env.HUBSPOT_DEMO_USER_ID ?? 'demo')
  } catch {
    // no token available in this context
  }

  if (hubspotToken) {
    try {
      deal = await getDeal(hubspotToken, dealId)
      if (deal) {
        dealName = deal.properties.dealname ?? dealName
        dealAmount = deal.properties.amount ?? '0'
        // HubSpot deal owners are stored as email in hs_owner_id or similar
        // For now we'll try to get the owner's email from the deal's properties
        dealOwnerEmail = (deal.properties as any).hs_email ?? (deal.properties as any).owner_email ?? null
        dealOwnerName = (deal.properties as any).hs_name ?? (deal.properties as any).owner_name ?? null
      }
    } catch {
      // proceed without deal details
    }
  }

  const amount = parseFloat(dealAmount.replace(/[^0-9.]/g, ''))
  if (isNaN(amount) || amount <= 5000) {
    return { success: true, data: { skipped: true, reason: 'deal amount <= $5000' } }
  }

  const userId = process.env.HUBSPOT_DEMO_USER_ID ?? 'demo'
  const slackToken = await getSlackToken(userId)
  if (!slackToken) {
    return { success: false, data: null, error: 'Slack not connected' }
  }

  try {
    // Try to send DM to deal owner
    if (dealOwnerEmail) {
      const slackUserId = await findSlackUserIdByEmail(slackToken, dealOwnerEmail)
      if (slackUserId) {
        const text = [
          `*High-Value Deal Created — $${amount.toLocaleString()}*`,
          ``,
          `*Deal:* ${dealName}`,
          `*Amount:* $${amount.toLocaleString()}`,
          ``,
          `_New deal created in HubSpot_`,
        ].join('\n')
        await postMessage(userId, slackUserId, text)
        return { success: true, data: { notified: dealOwnerEmail } }
      }
    }

    // Fallback: post to #general
    const generalChannelId = await findSlackChannelId(slackToken, 'general')
    if (generalChannelId) {
      const text = [
        `*New High-Value Deal — $${amount.toLocaleString()}*`,
        ``,
        `*Deal:* ${dealName}`,
        `*Amount:* $${amount.toLocaleString()}`,
        dealOwnerName ? `*Owner:* ${dealOwnerName}` : '',
      ].join('\n')
      await postMessage(userId, generalChannelId, text)
      return { success: true, data: { notified: 'general' } }
    }

    return { success: false, data: null, error: 'Could not find owner or default channel' }
  } catch (err: any) {
    return { success: false, data: null, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// Tool: alert on deal closed won
// ---------------------------------------------------------------------------

export interface AlertClosedWonInput {
  dealId: string
  dealName?: string
}

export async function alertClosedWon(
  args: AlertClosedWonInput
): Promise<ToolResult> {
  const { dealId, dealName: dealNameArg } = args

  let hubspotToken: string | null = null
  let deal: any = null
  let dealName = dealNameArg ?? 'Unknown Deal'

  try {
    hubspotToken = await getHubSpotAccessToken(process.env.HUBSPOT_DEMO_USER_ID ?? 'demo')
  } catch {
    // no token
  }

  if (hubspotToken) {
    try {
      deal = await getDeal(hubspotToken, dealId)
      if (deal) {
        dealName = deal.properties.dealname ?? dealName
      }
    } catch {
      // proceed with args
    }
  }

  const userId = process.env.HUBSPOT_DEMO_USER_ID ?? 'demo'
  const slackToken = await getSlackToken(userId)
  if (!slackToken) {
    return { success: false, data: null, error: 'Slack not connected' }
  }

  try {
    const officeChannelId = await findSlackChannelId(slackToken, 'office')
    if (!officeChannelId) {
      return { success: false, data: null, error: 'Could not find #office channel' }
    }

    const text = [
      `*Job Complete!* :tada:`,
      ``,
      `*Deal:* ${dealName}`,
      ``,
      `_Marked as Closed Won in HubSpot_`,
    ].join('\n')

    await postMessage(userId, officeChannelId, text)
    return { success: true, data: { notified: '#office' } }
  } catch (err: any) {
    return { success: false, data: null, error: err.message }
  }
}
