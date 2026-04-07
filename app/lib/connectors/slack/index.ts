/**
 * Slack Connector — capability + tool definitions + execute implementations.
 * Registers slack.* tools via capabilityRegistry.
 */

import { z } from 'zod'
import { capabilityRegistry } from '@/lib/capability-registry'
import type { ToolDefinition, ToolContext, ToolResult } from '@/lib/capability-registry/types'
import { postMessage, updateMessage, postAgentSummary } from './client'

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

// ---------------------------------------------------------------------------
// Capability + Tool Definitions
// ---------------------------------------------------------------------------

const slackChannelPostDef: ToolDefinition = {
  name: 'slack.channel.post',
  description: 'Post a message to a Slack channel. Use this to send summaries, alerts, or status updates to a channel.',
  isConcurrencySafe: false, // writes are serial per agent
  isDestructive: false,
  permissionLevel: 'safe', // routine status posts are auto-approved by classifier
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
  ],
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  tools: ['slack.channel.post', 'slack.channel.update'],
  permissionLevel: 'safe' as const,
}

export const slackToolDefs = [slackChannelPostDef, slackChannelUpdateDef]

export function registerSlackCapabilities(): void {
  capabilityRegistry.registerCapability(slackCapability, slackToolDefs)
}

// Auto-register on import
registerSlackCapabilities()
