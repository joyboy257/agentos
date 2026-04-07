/**
 * Slack Integration — credential helpers and OAuth utilities.
 */

export {
  buildSlackAuthUrl,
  exchangeCodeForSlackTokens,
  getSlackToken,
  saveSlackTokenForUser,
  isSlackConnected,
  listChannels,
  getRecentMessages,
  sendMessage,
} from './client'

export type {
  SlackChannel,
  SlackMessage,
  SlackTokens,
  SlackUser,
  SlackAttachment,
  SlackBlock,
} from './types'
