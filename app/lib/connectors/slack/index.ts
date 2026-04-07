/**
 * Slack Connector — capability + tool definitions + execute implementations.
 * Registers slack.* tools via capabilityRegistry.
 */

import { z } from 'zod'
import { capabilityRegistry } from '@/lib/capability-registry'
import type { ToolDefinition, ToolContext, ToolResult } from '@/lib/capability-registry/types'
import { postMessage, updateMessage, postAgentSummary, getSlackToken } from './client'
// HubSpot deal alert hook — wires hubspot.deals.create (amount > $5K) → Slack DM to owner
import '@/lib/integrations/slack/tools/notify'

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

async function executeSlackChannelPost(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    channel: z.string().describe('Slack channel ID or name (e.g. C012AB3CD)'),
    text: z.string().describe('Message text to post'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  const { channel, text } = parsed.data

  // Extract userId from context (passed by executor)
  const userId = (_context as any).userId as string
  if (!userId) {
    return { success: false, error: 'No userId in context' }
  }

  try {
    const result = await postMessage(userId, channel, text)
    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function executeSlackChannelUpdate(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    channel: z.string().describe('Slack channel ID'),
    ts: z.string().describe('Timestamp of message to update'),
    text: z.string().describe('New message text'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  const { channel, ts, text } = parsed.data

  const userId = (_context as any).userId as string
  if (!userId) {
    return { success: false, error: 'No userId in context' }
  }

  try {
    const result = await updateMessage(userId, channel, ts, text)
    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function executeSlackMessagesSend(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    channel: z.string().describe('Slack channel ID or name like #general or @username'),
    text: z.string().describe('Message text to send'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  const { channel, text } = parsed.data
  const userId = (_context as any).userId as string
  if (!userId) {
    return { success: false, error: 'No userId in context' }
  }

  try {
    const result = await postMessage(userId, channel, text)
    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function executeSlackChannelsList(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    limit: z.number().optional().describe('Max channels to return (default 100)'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  const userId = (_context as any).userId as string
  if (!userId) {
    return { success: false, error: 'No userId in context' }
  }

  const { listChannels } = await import('@/lib/integrations/slack/client')
  const token = await getSlackToken(userId)
  if (!token) {
    return { success: false, error: 'Slack not connected. Please connect Slack in settings.' }
  }

  try {
    const result = await listChannels(token, (parsed.data.limit as number) ?? 100)
    return {
      success: true,
      data: {
        channels: result.channels.map((c) => ({
          id: c.id,
          name: c.name,
          num_members: c.num_members,
          is_private: c.is_private,
          is_archived: c.is_archived,
        })),
        hasMore: result.hasMore,
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function executeSlackMessagesRecent(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    channel: z.string().describe('Slack channel ID'),
    limit: z.number().optional().describe('Max messages to return (default 20)'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  const { channel, limit } = parsed.data

  const userId = (_context as any).userId as string
  if (!userId) {
    return { success: false, error: 'No userId in context' }
  }

  const { getRecentMessages } = await import('@/lib/integrations/slack/client')
  const token = await getSlackToken(userId)
  if (!token) {
    return { success: false, error: 'Slack not connected. Please connect Slack in settings.' }
  }

  try {
    const result = await getRecentMessages(token, channel, (limit as number) ?? 20)
    return {
      success: true,
      data: {
        messages: result.messages.map((m) => ({
          ts: m.ts,
          text: m.text,
          user: m.user,
          thread_ts: m.thread_ts,
          reply_count: m.reply_count,
        })),
        hasMore: result.hasMore,
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// Capability + Tool Definitions
// ---------------------------------------------------------------------------

const slackChannelPostDef: ToolDefinition = {
  name: 'slack.channel.post',
  description: 'Post a message to a Slack channel. Use this to send summaries, alerts, or status updates to a channel.',
  isConcurrencySafe: false, // writes are serial per agent
  isDestructive: false,
  permissionLevel: 'needs_approval', // always requires approval (Slack posts affect external state)
  execute: executeSlackChannelPost,
}

const slackChannelUpdateDef: ToolDefinition = {
  name: 'slack.channel.update',
  description: 'Update an existing message in a Slack channel.',
  isConcurrencySafe: false,
  isDestructive: false,
  permissionLevel: 'safe',
  execute: executeSlackChannelUpdate,
}

const slackChannelsListDef: ToolDefinition = {
  name: 'slack.channels.list',
  description: 'List all channels in the Slack workspace that the bot has access to.',
  isConcurrencySafe: true,
  isDestructive: false,
  permissionLevel: 'safe',
  execute: executeSlackChannelsList,
}

const slackMessagesRecentDef: ToolDefinition = {
  name: 'slack.messages.recent',
  description: 'Get recent messages from a specific Slack channel.',
  isConcurrencySafe: true,
  isDestructive: false,
  permissionLevel: 'safe',
  execute: executeSlackMessagesRecent,
}

const slackMessagesSendDef: ToolDefinition = {
  name: 'slack.messages.send',
  description:
    'Send a direct message to a Slack channel or DM. Use this to notify team members, send alerts, or slide into a teammate\'s DMs. Channel can be a channel ID (C012AB3CD) or a channel name like #general.',
  isConcurrencySafe: false,
  isDestructive: false,
  permissionLevel: 'needs_approval', // always requires approval before sending
  execute: executeSlackMessagesSend,
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const slackCapability = {
  id: 'slack.notify',
  name: 'Slack Notify',
  description: 'Send summaries and status updates to Slack channels via bot',
  archetype: 'distill' as const,
  triggerPhrases: [
    'post to slack',
    'send to slack',
    'notify slack',
    'slack summary',
    'slack notification',
    'slack alert',
    'slack status',
    'message slack channel',
    'send summary to slack',
    'list slack channels',
    'get slack channels',
    'read slack messages',
    'get recent slack messages',
  ],
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  tools: ['slack.channel.post', 'slack.channel.update', 'slack.channels.list', 'slack.messages.recent', 'slack.messages.send'],
  permissionLevel: 'safe' as const,
}

export const slackToolDefs = [slackChannelPostDef, slackChannelUpdateDef, slackChannelsListDef, slackMessagesRecentDef, slackMessagesSendDef]

export function registerSlackCapabilities(): void {
  capabilityRegistry.registerCapability(slackCapability, slackToolDefs)
}

// Auto-register on import
registerSlackCapabilities()
