/**
 * Slack Write Tools
 *
 * slack.messages.send — send a message to a channel or DM.
 * permissionLevel: 'needs_approval' — always requires user approval before sending.
 */

import { z } from 'zod'
import { getSlackToken, postMessage } from '@/lib/connectors/slack/client'
import type { ToolContext, ToolResult } from '@/lib/capability-registry/types'

export const slackMessagesSendTool = {
  id: 'slack.messages.send',
  name: 'Slack Message Send',
  description:
    'Send a message to a Slack channel or DM. Use this tool to notify team members, ' +
    'send alerts to channels, or slide into a teammate\'s DMs. Channel can be a channel ID (C012AB3CD) ' +
    'or a channel name like #general or #office.',
  triggers: [
    'send a slack message',
    'message to slack',
    'notify slack',
    'post to #',
    'send to #',
    'slack message',
    'message slack channel',
    'dm on slack',
  ],
  inputSchema: {
    type: 'object' as const,
    properties: {
      channel: {
        type: 'string' as const,
        description: 'Slack channel ID (C012AB3CD) or channel name like #general or @username',
      },
      text: {
        type: 'string' as const,
        description: 'Message text to send. Supports Slack Markdown formatting.',
      },
    },
    required: ['channel', 'text'],
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' },
      ts: { type: 'string', description: 'Slack timestamp of the sent message' },
      channel: { type: 'string', description: 'Channel ID the message was posted to' },
    },
    required: ['success'],
  },
  isConcurrencySafe: false,
  permissionLevel: 'needs_approval' as const,

  async execute(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const parsed = z.object({
      channel: z.string().min(1, 'channel is required'),
      text: z.string().min(1, 'text is required'),
    }).safeParse(args)

    if (!parsed.success) {
      return { success: false, error: `Invalid args: ${parsed.error.message}` }
    }

    const { channel, text } = parsed.data
    const userId = context.userId

    if (!userId) {
      return { success: false, error: 'No userId in context' }
    }

    const token = await getSlackToken(userId)
    if (!token) {
      return {
        success: false,
        data: null,
        error: 'Slack not connected. Please connect Slack in settings.',
      }
    }

    try {
      const result = await postMessage(userId, channel, text)
      return { success: true, data: result }
    } catch (err: any) {
      return { success: false, data: null, error: err.message }
    }
  },
}
