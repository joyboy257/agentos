/**
 * Slack Types — TypeScript types for Slack Web API objects.
 */

export interface SlackChannel {
  id: string
  name: string
  is_channel: boolean
  is_group: boolean
  is_im: boolean
  is_mpim: boolean
  is_private: boolean
  created: number
  creator: string
  is_archived: boolean
  is_general: boolean
  name_normalized: string
  num_members: number
  priority: number
  topic: string
  purpose: string
  who_can_view_channel: string
  previous_names: string[]
}

export interface SlackMessage {
  type: string
  channel: string
  user: string
  text: string
  ts: string
  thread_ts?: string
  reply_count?: number
  reply_users?: string[]
  reply_users_count?: number
  latest_reply?: string
  team?: string
  bot_id?: string
  app_id?: string
  subtype?: string
  hidden?: boolean
  deleted_count?: number
  attachments?: SlackAttachment[]
  blocks?: SlackBlock[]
}

export interface SlackAttachment {
  msg_subtype?: string
  fallback?: string
  callback_id?: string
  color?: string
  pretext?: string
  author_id?: string
  author_name?: string
  author_link?: string
  author_icon?: string
  title?: string
  title_link?: string
  formated_title?: string
  short_name?: boolean
  text?: string
  fields?: SlackField[]
  image_url?: string
  image_width?: number
  image_height?: number
  image_bytes?: number
  thumb_url?: string
  thumb_width?: number
  thumb_height?: number
  footer?: string
  footer_icon?: string
  ts?: string
  mrkdwn_in?: string[]
  actions?: SlackAction[]
}

export interface SlackField {
  title?: string
  value?: string
  short?: boolean
}

export interface SlackAction {
  id?: string
  name?: string
  type?: string
  text?: string
  value?: string
  style?: string
  url?: string
  confirm?: unknown
}

export interface SlackBlock {
  type: string
  block_id?: string
  text?: {
    type: string
    text: string
    emoji?: boolean
    verbatim?: boolean
  }
  elements?: unknown[]
}

export interface SlackUser {
  id: string
  team_id: string
  name: string
  deleted: boolean
  real_name: string
  profile: {
    display_name: string
    display_name_normalized: string
    real_name: string
    real_name_normalized: string
    email?: string
    image_192?: string
    image_72?: string
    image_48?: string
  }
}

export interface SlackTokens {
  accessToken: string
  botUserId?: string
  teamId?: string
  teamName?: string
}
