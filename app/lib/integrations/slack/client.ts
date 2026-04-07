/**
 * Slack API Client — uses Slack Web API via native fetch.
 * Bot token stored in credentials table with provider = 'slack'.
 */

import { getCredential, saveCredential } from '@/lib/db/queries'
import { encrypt, decrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'
import type { SlackChannel, SlackMessage, SlackTokens } from './types'

const SLACK_API_BASE = 'https://slack.com/api'
const SLACK_OAUTH_URL = 'https://slack.com/oauth/v2'

// Refresh buffer: proactively refresh when within 5 minutes of expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

const SLACK_SCOPES = [
  'channels:read',
  'channels:write',
  'chat:write',
  'groups:read',
  'groups:write',
  'users:read',
  'users:read.email',
].join(',')

export function buildSlackAuthUrl(state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const redirectUri = `${baseUrl}/api/integrations/slack/callback`

  if (!clientId) {
    throw new Error('SLACK_CLIENT_ID must be set')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUri,
    state,
  })

  return `${SLACK_OAUTH_URL}/authorize?${params.toString()}`
}

export async function exchangeCodeForSlackTokens(
  code: string
): Promise<SlackTokens> {
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const redirectUri = `${baseUrl}/api/integrations/slack/callback`

  if (!clientId || !clientSecret) {
    throw new Error('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set')
  }

  const res = await fetch(`${SLACK_OAUTH_URL}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Slack token exchange failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  if (!json.ok) {
    throw new Error(`Slack OAuth error: ${json.error}`)
  }

  return {
    accessToken: json.access_token,
    botUserId: json.bot_user_id,
    teamId: json.team_id,
    teamName: json.team_name,
  }
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export async function getSlackToken(userId: string): Promise<string | null> {
  const cred = await getCredential(userId, 'slack')
  if (!cred) return null

  try {
    const decrypted = decrypt(cred.encrypted_token)
    const payload: SlackTokens = JSON.parse(decrypted)
    return payload.accessToken
  } catch {
    return null
  }
}

export async function saveSlackTokenForUser(
  userId: string,
  tokens: SlackTokens
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens))
  // Slack tokens don't expire (bot tokens are long-lived)
  await saveCredential(nanoid(), userId, 'slack', encrypted, null)
}

export async function isSlackConnected(userId: string): Promise<boolean> {
  const token = await getSlackToken(userId)
  return token !== null
}

// ---------------------------------------------------------------------------
// Slack API calls
// ---------------------------------------------------------------------------

async function slackApiRequest<T = unknown>(
  method: string,
  token: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw Object.assign(new Error(`Slack API ${res.status}: ${text}`), {
      status: res.status,
    })
  }

  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) {
    throw Object.assign(new Error(`Slack API error: ${data.error}`), {
      code: data.error,
    })
  }

  return data as T
}

interface ConversationsListResult {
  ok: boolean
  channels: SlackChannel[]
  response_metadata?: { next_cursor?: string }
}

interface ConversationsHistoryResult {
  ok: boolean
  messages: SlackMessage[]
  has_more: boolean
  channel: string
  response_metadata?: { next_cursor?: string }
}

/**
 * List all channels the bot is a member of.
 */
export async function listChannels(
  token: string,
  limit = 100
): Promise<{ channels: SlackChannel[]; hasMore: boolean }> {
  const data = await slackApiRequest<ConversationsListResult>(
    'conversations.list',
    token,
    { limit, types: 'public_channel,private_channel' }
  )

  return {
    channels: data.channels ?? [],
    hasMore: !!data.response_metadata?.next_cursor,
  }
}

/**
 * Get recent messages from a channel.
 */
export async function getRecentMessages(
  token: string,
  channel: string,
  limit = 20
): Promise<{ messages: SlackMessage[]; hasMore: boolean }> {
  const data = await slackApiRequest<ConversationsHistoryResult>(
    'conversations.history',
    token,
    { channel, limit }
  )

  return {
    messages: data.messages ?? [],
    hasMore: data.has_more,
  }
}

/**
 * Send a message to a Slack channel.
 */
export async function sendMessage(
  token: string,
  channel: string,
  text: string
): Promise<{ success: true; ts: string; channel: string }> {
  const data = await slackApiRequest<{
    ok: boolean
    ts: string
    channel: string
    message: SlackMessage
  }>('chat.postMessage', token, { channel, text, mrkdwn: true })

  return { success: true, ts: data.ts, channel: data.channel }
}
