/**
 * Google Calendar Connector — capability + tool definitions + execute implementations.
 * Follows the same pattern as lib/connectors/hubspot/index.ts
 */

import { registry } from '@/lib/registry/capability-registry'
import {
  getGoogleCalendarAccessToken,
  listCalendarEvents,
  getCalendarEvent,
  getCalendarAvailability,
} from '@/lib/integrations/google-calendar/client'
import { withRetry, DEFAULT_RETRY_CONFIG, getRetryBudget } from '@/lib/middleware/with-retry'
import type { RetryBudget } from '@/lib/middleware/retry-budget'
// Write tools — auto-registers closed-won → calendar reminder workflow
import { calendarWriteTools } from '@/lib/integrations/google-calendar/tools/write'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// Retry helper for Google Calendar API calls
// ---------------------------------------------------------------------------

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  budget: RetryBudget
): Promise<T> {
  return withRetry(fn, DEFAULT_RETRY_CONFIG, (err: any) => {
    // Retry on 429 rate limit or 5xx server errors
    const status = err?.status
    return status === 429 || (status >= 500 && status < 600)
  }, budget)
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

interface CalendarToolDef {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'safe' | 'needs_approval'
  execute(
    args: Record<string, unknown>,
    context: { userId: string }
  ): Promise<ToolResult>
}

const calendarTools: CalendarToolDef[] = [
  {
    id: 'calendar.events.list',
    description:
      'List calendar events from Google Calendar — returns events within a date range (default: next 7 days).',
    triggers: [
      'list calendar events',
      'get calendar events',
      'read calendar',
      'show my calendar',
      'what is on my calendar',
      'calendar events',
      'list events',
      'get events this week',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        timeMin: {
          type: 'string',
          description: 'Start of date range (ISO date string, e.g. "2024-04-01T00:00:00Z"). Defaults to now.',
        },
        timeMax: {
          type: 'string',
          description: 'End of date range (ISO date string, e.g. "2024-04-07T23:59:59Z"). Defaults to 7 days from now.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of events to return',
          default: 100,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              summary: { type: 'string' },
              description: { type: 'string' },
              start: { type: 'string' },
              end: { type: 'string' },
              location: { type: 'string' },
              attendees: { type: 'array', items: { type: 'string' } },
              organizer: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
        hasMore: { type: 'boolean' },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (args, context) => {
      const token = await getGoogleCalendarAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'Google Calendar not connected. Please connect Google Calendar in settings.',
        }
      }

      // Default time range: now to 7 days from now
      const timeMin = (args.timeMin as string) ?? new Date().toISOString()
      const timeMax =
        (args.timeMax as string) ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const maxResults = (args.maxResults as number) ?? 100

      const budget = getRetryBudget('google-calendar', 1)
      const result = await executeWithRetry(
        () => listCalendarEvents(token, { timeMin, timeMax, maxResults }),
        budget
      )

      return {
        success: true,
        data: {
          events: result.events.map((e) => ({
            id: e.id,
            summary: e.summary,
            description: e.description,
            start: e.start,
            end: e.end,
            location: e.location,
            attendees: e.attendees,
            organizer: e.organizer,
            status: e.status,
          })),
          hasMore: result.hasMore,
        },
      }
    },
  },

  {
    id: 'calendar.events.get',
    description:
      'Get a single calendar event by ID from Google Calendar.',
    triggers: [
      'get calendar event',
      'get event by id',
      'find calendar event',
      'event details',
      'get event',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The Google Calendar event ID',
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
            organizer: { type: 'string' },
            status: { type: 'string' },
            created: { type: 'string' },
            updated: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (args, context) => {
      const token = await getGoogleCalendarAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'Google Calendar not connected. Please connect Google Calendar in settings.',
        }
      }

      const eventId = args.eventId as string
      if (!eventId) {
        return { success: false, data: null, error: 'eventId is required' }
      }

      const budget = getRetryBudget('google-calendar', 1)
      const event = await executeWithRetry(
        () => getCalendarEvent(token, eventId),
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
            organizer: event.organizer,
            status: event.status,
            created: event.created,
            updated: event.updated,
          },
        },
      }
    },
  },

  {
    id: 'calendar.availability.get',
    description:
      'Check free/busy status for a set of email addresses within a date range — used to find meeting slots.',
    triggers: [
      'check availability',
      'free busy',
      'find meeting slot',
      'when is everyone free',
      'check if free',
      'calendar availability',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of email addresses to check availability for',
        },
        timeMin: {
          type: 'string',
          description: 'Start of date range (ISO date string)',
        },
        timeMax: {
          type: 'string',
          description: 'End of date range (ISO date string)',
        },
      },
      required: ['emails', 'timeMin', 'timeMax'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        availabilities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              busy: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { start: { type: 'string' }, end: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (args, context) => {
      const token = await getGoogleCalendarAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'Google Calendar not connected. Please connect Google Calendar in settings.',
        }
      }

      const emails = args.emails as string[]
      const timeMin = args.timeMin as string
      const timeMax = args.timeMax as string

      if (!emails?.length || !timeMin || !timeMax) {
        return { success: false, data: null, error: 'emails, timeMin, and timeMax are required' }
      }

      const budget = getRetryBudget('google-calendar', 1)
      const result = await executeWithRetry(
        () => getCalendarAvailability(token, emails, timeMin, timeMax),
        budget
      )

      return {
        success: true,
        data: {
          availabilities: result.map((r) => ({
            email: r.email,
            busy: r.busy,
          })),
        },
      }
    },
  },
]

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCalendarCapabilities(): void {
  for (const tool of calendarTools) {
    registry.register({
      id: tool.id,
      description: tool.description,
      triggers: tool.triggers,
      tools: [tool.id],
      inputSchema: tool.inputSchema as any,
      outputSchema: tool.outputSchema as any,
      approvalConfig: {
        approverType: tool.permissionLevel === 'needs_approval' ? 'user' : 'none',
        timeoutSeconds: 300,
        fallback: 'abort',
      },
      agentRole: tool.id.replace(/[^a-z_]/g, '_'),
    })
  }

  // Register write tools (calendar.events.create, update, delete) — all need_approval
  for (const tool of calendarWriteTools) {
    registry.register({
      id: tool.id,
      description: tool.description,
      triggers: tool.triggers,
      tools: [tool.id],
      inputSchema: tool.inputSchema as any,
      outputSchema: tool.outputSchema as any,
      approvalConfig: {
        approverType: tool.permissionLevel === 'needs_approval' ? 'user' : 'none',
        timeoutSeconds: 300,
        fallback: 'abort',
      },
      agentRole: tool.id.replace(/[^a-z_]/g, '_'),
    })
  }
}

// Auto-register on import
registerCalendarCapabilities()