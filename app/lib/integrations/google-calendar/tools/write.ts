/**
 * Google Calendar write tools — all require user approval.
 */

import type { CalendarEvent } from '@/lib/integrations/google-calendar/types'
import {
  getGoogleCalendarAccessToken,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
} from '@/lib/integrations/google-calendar/client'
import { withRetry, DEFAULT_RETRY_CONFIG, getRetryBudget } from '@/lib/middleware/with-retry'
import type { RetryBudget } from '@/lib/middleware/retry-budget'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  budget: RetryBudget
): Promise<T> {
  return withRetry(fn, DEFAULT_RETRY_CONFIG, (err: any) => {
    const status = err?.status
    return status === 429 || (status >= 500 && status < 600)
  }, budget)
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export interface CalendarWriteTool {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'needs_approval'
  execute(
    args: Record<string, unknown>,
    context: { userId: string }
  ): Promise<ToolResult>
}

export const calendarWriteTools: CalendarWriteTool[] = [
  // ── calendar.events.create ─────────────────────────────────────────────────
  {
    id: 'calendar.events.create',
    description:
      'Create a new event on Google Calendar — blocks time, sends invites to attendees. Requires approval before executing.',
    triggers: [
      'create calendar event',
      'add event to calendar',
      'block calendar time',
      'schedule meeting',
      'add to calendar',
      'create event',
      'block time',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Event title (e.g. "Job Estimates", "Call with Smiths")',
        },
        start: {
          type: 'string',
          description:
            'Start time in ISO 8601 format (e.g. "2024-04-07T13:00:00Z")',
        },
        end: {
          type: 'string',
          description:
            'End time in ISO 8601 format (e.g. "2024-04-07T15:00:00Z")',
        },
        description: {
          type: 'string',
          description: 'Event description / notes',
        },
        location: {
          type: 'string',
          description: 'Physical location or video call link',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses of attendees to invite',
        },
      },
      required: ['summary', 'start', 'end'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        event: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            summary: { type: 'string' },
            description: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
            location: { type: 'string' },
            attendees: { type: 'array', items: { type: 'string' } },
            status: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getGoogleCalendarAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error:
            'Google Calendar not connected. Please connect Google Calendar in settings.',
        }
      }

      const { summary, start, end, description, location, attendees } = args as {
        summary: string
        start: string
        end: string
        description?: string
        location?: string
        attendees?: string[]
      }

      if (!summary || !start || !end) {
        return {
          success: false,
          data: null,
          error: 'summary, start, and end are required',
        }
      }

      const budget = getRetryBudget('google-calendar', 1)
      const event = await executeWithRetry(
        () =>
          createCalendarEvent(token, {
            summary,
            start,
            end,
            description,
            location,
            attendees,
          }),
        budget
      )

      return {
        success: true,
        data: {
          event: {
            id: event.id,
            summary: event.summary,
            description: event.description,
            start: event.start,
            end: event.end,
            location: event.location,
            attendees: event.attendees,
            status: event.status,
          },
        },
      }
    },
  },

  // ── calendar.events.update ─────────────────────────────────────────────────
  {
    id: 'calendar.events.update',
    description:
      'Update an existing Google Calendar event — change title, time, description, or attendees. Requires approval.',
    triggers: [
      'update calendar event',
      'modify calendar event',
      'change event time',
      'reschedule event',
      'update event',
      'edit calendar event',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'Google Calendar event ID to update',
        },
        summary: {
          type: 'string',
          description: 'New event title',
        },
        start: {
          type: 'string',
          description: 'New start time (ISO 8601)',
        },
        end: {
          type: 'string',
          description: 'New end time (ISO 8601)',
        },
        description: {
          type: 'string',
          description: 'New event description',
        },
        location: {
          type: 'string',
          description: 'New location or video call link',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'New list of attendee emails',
        },
      },
      required: ['eventId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        event: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            summary: { type: 'string' },
            description: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
            location: { type: 'string' },
            attendees: { type: 'array', items: { type: 'string' } },
            status: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getGoogleCalendarAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error:
            'Google Calendar not connected. Please connect Google Calendar in settings.',
        }
      }

      const { eventId, summary, start, end, description, location, attendees } =
        args as {
          eventId: string
          summary?: string
          start?: string
          end?: string
          description?: string
          location?: string
          attendees?: string[]
        }

      if (!eventId) {
        return { success: false, data: null, error: 'eventId is required' }
      }

      const budget = getRetryBudget('google-calendar', 1)
      const event = await executeWithRetry(
        () =>
          updateCalendarEvent(token, eventId, {
            summary,
            start,
            end,
            description,
            location,
            attendees,
          }),
        budget
      )

      return {
        success: true,
        data: {
          event: {
            id: event.id,
            summary: event.summary,
            description: event.description,
            start: event.start,
            end: event.end,
            location: event.location,
            attendees: event.attendees,
            status: event.status,
          },
        },
      }
    },
  },

  // ── calendar.events.delete ─────────────────────────────────────────────────
  {
    id: 'calendar.events.delete',
    description:
      'Cancel and delete a Google Calendar event. Attendees will be notified of the cancellation. Requires approval.',
    triggers: [
      'delete calendar event',
      'cancel calendar event',
      'remove event from calendar',
      'delete event',
      'cancel event',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'Google Calendar event ID to delete',
        },
      },
      required: ['eventId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean' },
        eventId: { type: 'string' },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getGoogleCalendarAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error:
            'Google Calendar not connected. Please connect Google Calendar in settings.',
        }
      }

      const { eventId } = args as { eventId: string }

      if (!eventId) {
        return { success: false, data: null, error: 'eventId is required' }
      }

      const budget = getRetryBudget('google-calendar', 1)
      await executeWithRetry(
        () => deleteCalendarEvent(token, eventId),
        budget
      )

      return {
        success: true,
        data: {
          deleted: true,
          eventId,
        },
      }
    },
  },
]

// ---------------------------------------------------------------------------
// HubSpot Closed Won → Calendar Reminder Workflow
// Wires hubspot.deals.update_stage (stage: "Closed Won") to automatically
// create a calendar reminder event 1 day before the deal's scheduled date.
// ---------------------------------------------------------------------------

import { sendApprovalPush } from '@/lib/push-notifications'
import { getHookRegistry } from '@/lib/hooks/hook-registry'
import { sql } from '@vercel/postgres'

/**
 * Register the hubspot.closed-won → calendar reminder workflow.
 *
 * Flow:
 * 1. Listens for postToolCall of hubspot.deals.update_stage where stage=Closed Won
 * 2. Looks up the deal's close date
 * 3. Creates a calendar reminder event 1 day before the close date
 * 4. Sends a push notification to Maria confirming the reminder was created
 */
export function registerClosedWonCalendarWorkflow(): void {
  const hooks = getHookRegistry()

  hooks.register(
    'postToolCall',
    'closed-won-calendar-reminder',
    async (ctx) => {
      const { toolName, result } = ctx.postToolCall ?? {}

      // Only trigger on hubspot.deals.update_stage
      if (toolName !== 'hubspot.deals.update_stage') return { success: true }

      // Check if the deal was moved to Closed Won
      const toolResult = result as { success: boolean; data?: { dealstage?: string; closedate?: string; dealname?: string; id?: string } }
      if (!toolResult?.success) return { success: true }

      const dealData = toolResult.data as { dealstage?: string; closedate?: string; dealname?: string; id?: string } | undefined
      if (!dealData || dealData.dealstage !== 'closedwon') return { success: true }

      const dealName = dealData.dealname ?? 'Appointment'
      const dealId = dealData.id ?? ''
      const closeDate = dealData.closedate

      // Look up userId from runId
      let userId: string
      try {
        const runResult = await sql`SELECT user_id FROM runs WHERE id = ${ctx.runId} LIMIT 1`
        if (runResult.rows.length === 0) {
          console.warn('[workflow] run not found:', ctx.runId)
          return { success: true, error: 'run not found' }
        }
        userId = runResult.rows[0].user_id
      } catch (err) {
        console.error('[workflow] failed to look up run:', err)
        return { success: true, error: 'failed to look up userId' }
      }

      try {
        // Get Google Calendar access token
        const token = await getGoogleCalendarAccessToken(userId)
        if (!token) {
          console.warn('[workflow] Google Calendar not connected for user:', userId)
          return { success: true, error: 'Google Calendar not connected' }
        }

        // Parse the close date and compute reminder time (1 day before at 9am)
        if (!closeDate) {
          console.warn('[workflow] No close date on deal:', dealId)
          return { success: true, error: 'No close date' }
        }

        const closeDateMs = new Date(closeDate).getTime()
        const reminderDate = new Date(closeDateMs - 24 * 60 * 60 * 1000)
        // Set reminder time to 9am local
        reminderDate.setHours(9, 0, 0, 0)
        const reminderEnd = new Date(reminderDate.getTime() + 15 * 60 * 1000) // 15 min

        // Check if a reminder already exists for this deal
        const now = new Date().toISOString()
        const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const existing = await listCalendarEvents(token, {
          timeMin: now,
          timeMax: weekFromNow,
          maxResults: 50,
        })

        const alreadyReminded = existing.events.some(
          (e: CalendarEvent) =>
            e.summary?.includes(`REMINDER: ${dealName}`) ||
            e.summary?.includes(`[${dealId}]`)
        )

        if (alreadyReminded) {
          console.log('[workflow] Reminder already exists for deal:', dealName)
          return { success: true }
        }

        // Create the reminder event
        const reminderEvent = await createCalendarEvent(token, {
          summary: `REMINDER: ${dealName}`,
          description: `Reminder for closed deal: ${dealName}\nDeal ID: ${dealId}`,
          start: reminderDate.toISOString(),
          end: reminderEnd.toISOString(),
        })

        console.log('[workflow] Created calendar reminder:', reminderEvent.id)

        // Send push notification to Maria
        await sendApprovalPush({
          runId: ctx.runId,
          agentId: ctx.agentId ?? 'agent',
          toolName: 'calendar.events.create',
          summary: `Reminder created for ${dealName} on ${reminderDate.toLocaleDateString()}`,
          toolCallId: `reminder-${dealId}`,
        })

        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[workflow] Closed Won → Calendar reminder failed:', message)
        return { success: false, error: message }
      }
    }
  )
}

// Auto-register on import
registerClosedWonCalendarWorkflow()
