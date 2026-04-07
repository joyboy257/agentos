/**
 * Slack Client — wraps Slack Web API for bot token operations.
 * Bot token stored in credentials table with provider = 'slack'.
 */

import { getCredential } from '@/lib/db/queries'
import { decrypt } from '@/lib/crypto'
import { withRetry, DEFAULT_RETRY_CONFIG, getRetryBudget } from '@/lib/middleware/with-retry'
import { translateToolError } from '@/lib/middleware/error-translation'
import { TimeoutError } from '@/lib/middleware/with-timeout'

const SLACK_API_BASE = 'https://slack.com/api'

export interface SlackClient {
  accessToken: string
}

interface TokenPayload {
  access_token: string
  bot_user_id?: string | null
  team_id?: string | null
  team_name?: string | null
}

/**
 * Get Slack bot token for a user from the credentials table.
 */
export async function getSlackToken(userId: string): Promise<string | null> {
  const cred = await getCredential(userId, 'slack')
  if (!cred) return null

  try {
    const decrypted = decrypt(cred.encrypted_token)
    const payload: TokenPayload = JSON.parse(decrypted)
    return payload.access_token
  } catch {
    return null
  }
}

/**
 * Build a Slack Web API request with retry + rate limit decorrelation.
 */
async function slackApiRequest<T = unknown>(
  method: string,
  token: string,
  body: Record<string, unknown>
): Promise<T> {
  const budget = getRetryBudget('slack', 10)

  const fn = async () => {
    const response = await fetch(`${SLACK_API_BASE}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const text = await response.text()
      throw Object.assign(new Error(`Slack API ${response.status}: ${text}`), { status: response.status })
    }

    const data = await response.json() as { ok: boolean; error?: string }
    if (!data.ok) {
      const err: any = new Error(`Slack API error: ${data.error}`)
      // 429 = rate limited, retryable
      if (data.error === 'ratelimited') {
        err.code = 'RATE_LIMITED'
      }
      throw err
    }

    return data as T
  }

  return withRetry(fn, DEFAULT_RETRY_CONFIG, (err: any) => {
    if (err?.code === 'RATE_LIMITED' || err?.code === 'RATE_LIMITED_BUDGET_EXHAUSTED') return true
    return false
  }, budget)
}

interface ChatPostMessageResult {
  ok: boolean
  channel: string
  ts: string
  message?: {
    bot_id?: string
    type?: string
    text?: string
    user?: string
    ts?: string
    app_id?: string
    team?: string
    bot_profile?: {
      app_id?: string
      bot_id?: string
      name?: string
      icons?: { image_36?: string; image_48?: string; image_72?: string }
      updated?: number
      is_enterprise_install?: boolean
    }
  }
}

/**
 * Post a message to a Slack channel using chat.postMessage.
 */
export async function postMessage(
  userId: string,
  channel: string,
  text: string
): Promise<{ success: true; ts: string; channel: string }> {
  const token = await getSlackToken(userId)
  if (!token) {
    throw Object.assign(new Error('Slack not connected. Please connect your Slack workspace.'), {
      code: 'UNAUTHORIZED',
    })
  }

  try {
    const data = await slackApiRequest<ChatPostMessageResult>('chat.postMessage', token, {
      channel,
      text,
      mrkdwn: true,
    })

    return { success: true, ts: data.ts!, channel: data.channel! }
  } catch (err: any) {
    const translated = translateToolError(err, 'slack.channel.post')
    throw Object.assign(new Error(translated.llmMessage), { code: translated.errorCode })
  }
}

interface ChatUpdateResult {
  ok: boolean
  channel: string
  ts: string
  text: string
}

/**
 * Update an existing Slack message using chat.update.
 */
export async function updateMessage(
  userId: string,
  channel: string,
  ts: string,
  text: string
): Promise<{ success: true; ts: string; channel: string }> {
  const token = await getSlackToken(userId)
  if (!token) {
    throw Object.assign(new Error('Slack not connected. Please connect your Slack workspace.'), {
      code: 'UNAUTHORIZED',
    })
  }

  try {
    const data = await slackApiRequest<ChatUpdateResult>('chat.update', token, {
      channel,
      ts,
      text,
      mrkdwn: true,
    })

    return { success: true, ts: data.ts!, channel: data.channel! }
  } catch (err: any) {
    const translated = translateToolError(err, 'slack.channel.update')
    throw Object.assign(new Error(translated.llmMessage), { code: translated.errorCode })
  }
}

/**
 * Post a formatted agent summary to a Slack channel.
 * This is the primary "notify" function for agent summaries.
 */
export async function postAgentSummary(
  userId: string,
  channel: string,
  summary: {
    agentName: string
    task: string
    outcome: string
    timestamp: string
  }
): Promise<{ success: true; ts: string; channel: string }> {
  const text = [
    `*Agent Summary — ${summary.agentName}*`,
    ``,
    `*Task:* ${summary.task}`,
    `*Outcome:* ${summary.outcome}`,
    ``,
    `_Completed at ${summary.timestamp}_`,
  ].join('\n')

  return postMessage(userId, channel, text)
}

// ---------------------------------------------------------------------------
// Additional Slack API functions
// ---------------------------------------------------------------------------

export async function listChannels(
  token: string,
  limit = 100
): Promise<{ channels: any[]; hasMore: boolean }> {
  const response = await fetch('https://slack.com/api/conversations.list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ limit, types: 'public_channel,private_channel' }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw Object.assign(new Error(`Slack API ${response.status}`), { status: response.status })
  }

  const data = await response.json() as { ok: boolean; channels?: any[]; error?: string }
  if (!data.ok) {
    throw Object.assign(new Error(`Slack API error: ${data.error}`), { code: data.error })
  }

  return { channels: data.channels ?? [], hasMore: false }
}

export async function getRecentMessages(
  token: string,
  channel: string,
  limit = 20
): Promise<{ messages: any[]; hasMore: boolean }> {
  const response = await fetch('https://slack.com/api/conversations.history', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, limit }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw Object.assign(new Error(`Slack API ${response.status}`), { status: response.status })
  }

  const data = await response.json() as { ok: boolean; messages?: any[]; has_more?: boolean; error?: string }
  if (!data.ok) {
    throw Object.assign(new Error(`Slack API error: ${data.error}`), { code: data.error })
  }

  return { messages: data.messages ?? [], hasMore: data.has_more ?? false }
}

export async function sendDirectMessage(
  token: string,
  userId: string,
  text: string
): Promise<{ success: true; ts: string }> {
  // Open a DM channel first
  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ users: userId }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!openRes.ok) {
    throw Object.assign(new Error(`Slack API ${openRes.status}`), { status: openRes.status })
  }

  const openData = await openRes.json() as { ok: boolean; channel?: { id: string }; error?: string }
  if (!openData.ok || !openData.channel) {
    throw Object.assign(new Error(`Slack API error: ${openData.error}`), { code: openData.error })
  }

  const postRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: openData.channel.id, text, mrkdwn: true }),
    signal: AbortSignal.timeout(30_000),
  })

  const postData = await postRes.json() as { ok: boolean; ts?: string; error?: string }
  if (!postData.ok || !postData.ts) {
    throw Object.assign(new Error(`Slack API error: ${postData.error}`), { code: postData.error })
  }

  return { success: true, ts: postData.ts }
}
