/**
 * Instagram read tools.
 * Read-only tools with permissionLevel: 'safe'
 */

import {
  getInstagramTokenWithAccount,
} from '@/lib/integrations/instagram'
import { getMedia, getInsights, getUserProfile } from '@/lib/integrations/instagram/client'
import type { InstagramMedia, InstagramUserProfile } from '@/lib/integrations/instagram/types'

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

interface InstagramPostInsights {
  reach: number
  impressions: number
  engagement: number
  saved: number
  comments: number
  likes: number
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export interface InstagramReadTool {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'safe' | 'needs_approval'
  execute(args: Record<string, unknown>, context: { userId: string }): Promise<ToolResult>
}

export const instagramReadTools: InstagramReadTool[] = [
  // ── instagram.media.list ──────────────────────────────────────────────────
  {
    id: 'instagram.media.list',
    description:
      'Get recent posts from your Instagram Business account with insights (reach, impressions, engagement, saved, comments, likes).',
    triggers: [
      'get instagram posts',
      'list instagram posts',
      'instagram posts',
      'get instagram media',
      'show instagram posts',
      'what did I post on instagram',
      'instagram recent posts',
      'my instagram posts',
      'posts with most engagement',
      'which posts got the most engagement',
      'best performing instagram posts',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of posts to return (default 25, max 100)',
          default: 25,
        },
        include_insights: {
          type: 'boolean',
          description: 'Include insights for each post (reach, impressions, engagement)',
          default: true,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              caption: { type: 'string' },
              media_type: { type: 'string' },
              media_url: { type: 'string' },
              permalink: { type: 'string' },
              timestamp: { type: 'string' },
              insights: {
                type: 'object',
                properties: {
                  reach: { type: 'number' },
                  impressions: { type: 'number' },
                  engagement: { type: 'number' },
                  saved: { type: 'number' },
                  comments: { type: 'number' },
                  likes: { type: 'number' },
                },
              },
            },
          },
        },
        hasMore: { type: 'boolean' },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (args, context) => {
      const account = await getInstagramTokenWithAccount(context.userId)
      if (!account) {
        return {
          success: false,
          data: null,
          error: 'Instagram not connected. Please connect Instagram in settings.',
        }
      }

      try {
        const { media } = await getMedia(account.accessToken, account.instagramBusinessAccountId, {
          limit: (args.limit as number) ?? 25,
        })

        const includeInsights = args.include_insights !== false

        // Fetch insights for each post (insights are only available for Business accounts)
        const posts = await Promise.all(
          media.map(async (m: InstagramMedia) => {
            let insights: InstagramPostInsights = {
              reach: 0,
              impressions: 0,
              engagement: 0,
              saved: 0,
              comments: 0,
              likes: 0,
            }

            if (includeInsights) {
              try {
                const insightsData = await getInsights(
                  account.accessToken,
                  account.instagramBusinessAccountId,
                  m.id
                )
                insights = insightsData.insights
              } catch {
                // Some media types don't support insights
              }
            }

            return {
              id: m.id,
              caption: m.caption,
              media_type: m.media_type,
              media_url: m.media_url,
              permalink: m.permalink,
              timestamp: m.timestamp,
              insights,
            }
          })
        )

        return {
          success: true,
          data: { posts, hasMore: posts.length === (args.limit as number ?? 25) },
        }
      } catch (err: any) {
        return {
          success: false,
          data: null,
          error: err.message ?? 'Failed to fetch Instagram posts',
        }
      }
    },
  },

  // ── instagram.profile.get ─────────────────────────────────────────────────
  {
    id: 'instagram.profile.get',
    description:
      'Get your Instagram Business profile — shows username, bio, follower count, following count, and post count.',
    triggers: [
      'get instagram profile',
      'instagram profile',
      'my instagram stats',
      'instagram followers',
      'show my instagram profile',
      'get my instagram account',
    ],
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            name: { type: 'string' },
            biography: { type: 'string' },
            website: { type: 'string' },
            followers_count: { type: 'number' },
            follows_count: { type: 'number' },
            media_count: { type: 'number' },
            profile_picture_url: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (_args, context) => {
      const account = await getInstagramTokenWithAccount(context.userId)
      if (!account) {
        return {
          success: false,
          data: null,
          error: 'Instagram not connected. Please connect Instagram in settings.',
        }
      }

      try {
        const profile: InstagramUserProfile = await getUserProfile(
          account.accessToken,
          account.instagramBusinessAccountId
        )

        return {
          success: true,
          data: {
            profile: {
              id: profile.id,
              username: profile.username,
              name: profile.name,
              biography: profile.biography,
              website: profile.website,
              followers_count: profile.followers_count,
              follows_count: profile.follows_count,
              media_count: profile.media_count,
              profile_picture_url: profile.profile_picture_url,
            },
          },
        }
      } catch (err: any) {
        return {
          success: false,
          data: null,
          error: err.message ?? 'Failed to fetch Instagram profile',
        }
      }
    },
  },
]
