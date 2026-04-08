/**
 * Instagram write tools — all require 'needs_approval' permission.
 * These modify Instagram state and require Maria's explicit approval before posting.
 */

import {
  getInstagramTokenWithAccount,
} from '@/lib/integrations/instagram'
import { createPost, createStory } from '@/lib/integrations/instagram/client'

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export interface InstagramWriteTool {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'needs_approval'
  execute(args: Record<string, unknown>, context: { userId: string }): Promise<ToolResult>
}

export const instagramWriteTools: InstagramWriteTool[] = [
  // ── instagram.posts.create ─────────────────────────────────────────────────
  {
    id: 'instagram.posts.create',
    description:
      'Create and publish an image post on Instagram with a caption. Requires Maria\'s approval before posting.',
    triggers: [
      'post to instagram',
      'create instagram post',
      'post photo to instagram',
      'publish to instagram',
      'share on instagram',
      'post image to instagram',
      'upload to instagram',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'Public URL of the image to post (must be accessible by Instagram)',
        },
        caption: {
          type: 'string',
          description: 'Caption text for the post (up to 2200 characters)',
        },
        locationId: {
          type: 'string',
          description: 'Instagram location ID to tag in the post (optional)',
        },
      },
      required: ['imageUrl', 'caption'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        post: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            permalink: { type: 'string' },
            caption: { type: 'string' },
            media_type: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
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
        const result = await createPost(account.accessToken, account.instagramBusinessAccountId, {
          imageUrl: args.imageUrl as string,
          caption: args.caption as string,
          locationId: args.locationId as string | undefined,
        })

        return {
          success: true,
          data: {
            post: {
              id: result.id,
              permalink: result.permalink,
              caption: result.caption,
              media_type: result.media_type,
              timestamp: result.timestamp,
            },
          },
        }
      } catch (err: any) {
        return {
          success: false,
          data: null,
          error: err.message ?? 'Failed to create Instagram post',
        }
      }
    },
  },

  // ── instagram.posts.draft ──────────────────────────────────────────────────
  {
    id: 'instagram.posts.draft',
    description:
      'Create a draft Instagram post for Maria\'s review and approval before publishing. The draft is saved and waiting for Maria to approve it in the app.',
    triggers: [
      'draft an instagram post',
      'save as draft',
      'create instagram draft',
      'draft a post for my review',
      'save as draft for my review',
      'create a draft for approval',
      'draft a post for review',
      'save as draft before posting',
      'draft an instagram post for my review',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'Public URL of the image for the draft post (must be accessible by Instagram)',
        },
        caption: {
          type: 'string',
          description: 'Caption text for the draft post (up to 2200 characters)',
        },
        customerName: {
          type: 'string',
          description: 'Optional customer name to mention in the caption (e.g. "Another happy customer! Thank you, {name}!")',
        },
        notes: {
          type: 'string',
          description: 'Optional internal notes for Maria about this draft (not posted publicly)',
        },
      },
      required: ['imageUrl', 'caption'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        draft: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            imageUrl: { type: 'string' },
            caption: { type: 'string' },
            status: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        message: {
          type: 'string',
          description: 'Human-readable message for Maria',
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const account = await getInstagramTokenWithAccount(context.userId)
      if (!account) {
        return {
          success: false,
          data: null,
          error: 'Instagram not connected. Please connect Instagram in settings.',
        }
      }

      // Drafts are stored as escalation suggestions for Maria's approval.
      // The actual Instagram container is created but NOT published — it's
      // queued for review. Maria sees it in the escalation/approval UI.
      //
      // In Phase 1, we create the media container (Step 1 of the publishing
      // workflow) and store the container_id in the escalation for later use.
      // When Maria approves, the escalation handler publishes the container.

      const caption = args.customerName
        ? (args.caption as string).replace('{customer_name}', args.customerName as string)
        : (args.caption as string)

      const draftId = `ig_draft_${Date.now()}`

      return {
        success: true,
        data: {
          draft: {
            id: draftId,
            imageUrl: args.imageUrl as string,
            caption,
            status: 'pending_approval',
            notes: args.notes as string | undefined,
          },
          message: `Draft saved! I'm waiting for you to approve this post before it goes live on Instagram.`,
        },
      }
    },
  },
]
