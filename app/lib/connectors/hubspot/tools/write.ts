/**
 * HubSpot write tools — all require 'needs_approval' permission.
 */

import { getHubSpotAccessToken } from '@/lib/connectors/hubspot/client'
import {
  createContact,
  updateContact,
  createDeal,
  updateDealStage,
  createNote,
  createTicket,
} from '@/lib/connectors/hubspot/client'
import { withRetry, DEFAULT_RETRY_CONFIG, getRetryBudget } from '@/lib/middleware/with-retry'
import type { RetryBudget } from '@/lib/middleware/retry-budget'

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

export interface HubSpotWriteTool {
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

export const hubspotWriteTools: HubSpotWriteTool[] = [
  // ── hubspot.contacts.create ────────────────────────────────────────────────
  {
    id: 'hubspot.contacts.create',
    description:
      'Create a new contact in HubSpot CRM. Provide first name, last name, email, and optionally phone and company.',
    triggers: [
      'create hubspot contact',
      'add hubspot contact',
      'new hubspot contact',
      'hubspot contact create',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        firstname: { type: 'string', description: 'First name of the contact' },
        lastname: { type: 'string', description: 'Last name of the contact' },
        email: { type: 'string', description: 'Email address of the contact' },
        phone: { type: 'string', description: 'Phone number (optional)' },
        company: { type: 'string', description: 'Company name (optional)' },
      },
      required: ['firstname', 'lastname', 'email'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        contact: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstname: { type: 'string' },
            lastname: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            company: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getHubSpotAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'HubSpot not connected. Please connect HubSpot in settings.',
        }
      }

      const budget = getRetryBudget('hubspot', 1)
      const contact = await executeWithRetry(
        () =>
          createContact(token, {
            firstname: args.firstname as string,
            lastname: args.lastname as string,
            email: args.email as string,
            phone: (args.phone as string) ?? undefined,
            company: (args.company as string) ?? undefined,
          }),
        budget
      )

      return {
        success: true,
        data: {
          contact: {
            id: contact.id,
            firstname: contact.properties.firstname,
            lastname: contact.properties.lastname,
            email: contact.properties.email,
            phone: contact.properties.phone,
            company: contact.properties.company,
          },
        },
      }
    },
  },

  // ── hubspot.contacts.update ────────────────────────────────────────────────
  {
    id: 'hubspot.contacts.update',
    description:
      'Update contact properties in HubSpot CRM. Provide the contact ID and the properties to update.',
    triggers: [
      'update hubspot contact',
      'edit hubspot contact',
      'hubspot contact update',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'HubSpot contact ID' },
        firstname: { type: 'string', description: 'First name (optional)' },
        lastname: { type: 'string', description: 'Last name (optional)' },
        email: { type: 'string', description: 'Email address (optional)' },
        phone: { type: 'string', description: 'Phone number (optional)' },
        company: { type: 'string', description: 'Company name (optional)' },
        lifecyclestage: {
          type: 'string',
          description: 'Lifecycle stage (e.g. lead, customer)',
        },
      },
      required: ['contactId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        contact: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstname: { type: 'string' },
            lastname: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getHubSpotAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'HubSpot not connected. Please connect HubSpot in settings.',
        }
      }

      const { contactId, ...updates } = args as {
        contactId: string
        firstname?: string
        lastname?: string
        email?: string
        phone?: string
        company?: string
        lifecyclestage?: string
      }

      const budget = getRetryBudget('hubspot', 1)
      const contact = await executeWithRetry(
        () => updateContact(token, contactId, updates),
        budget
      )

      return {
        success: true,
        data: {
          contact: {
            id: contact.id,
            firstname: contact.properties.firstname,
            lastname: contact.properties.lastname,
            email: contact.properties.email,
          },
        },
      }
    },
  },

  // ── hubspot.deals.create ────────────────────────────────────────────────────
  {
    id: 'hubspot.deals.create',
    description:
      'Create a new deal in HubSpot CRM. Provide deal name, amount, pipeline, and close date.',
    triggers: [
      'create hubspot deal',
      'add hubspot deal',
      'new hubspot deal',
      'hubspot deal create',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        dealname: { type: 'string', description: 'Name of the deal' },
        amount: { type: 'string', description: 'Deal amount (e.g. "5000")' },
        pipeline: {
          type: 'string',
          description: 'Pipeline ID (default: default)',
          default: 'default',
        },
        dealstage: {
          type: 'string',
          description: 'Initial deal stage ID (optional)',
        },
        closedate: {
          type: 'string',
          description: 'Expected close date as ISO string or YYYY-MM-DD',
        },
        description: { type: 'string', description: 'Deal description (optional)' },
      },
      required: ['dealname'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deal: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            dealname: { type: 'string' },
            amount: { type: 'string' },
            dealstage: { type: 'string' },
            closedate: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getHubSpotAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'HubSpot not connected. Please connect HubSpot in settings.',
        }
      }

      const budget = getRetryBudget('hubspot', 1)
      const deal = await executeWithRetry(
        () =>
          createDeal(token, {
            dealname: args.dealname as string,
            amount: (args.amount as string) ?? undefined,
            pipeline: (args.pipeline as string) ?? 'default',
            dealstage: (args.dealstage as string) ?? undefined,
            closedate: (args.closedate as string) ?? undefined,
            description: (args.description as string) ?? undefined,
          }),
        budget
      )

      return {
        success: true,
        data: {
          deal: {
            id: deal.id,
            dealname: deal.properties.dealname,
            amount: deal.properties.amount,
            dealstage: deal.properties.dealstage,
            closedate: deal.properties.closedate,
          },
        },
      }
    },
  },

  // ── hubspot.deals.update_stage ─────────────────────────────────────────────
  {
    id: 'hubspot.deals.update_stage',
    description:
      'Move a HubSpot deal to a new pipeline stage. Provide the deal ID and target stage.',
    triggers: [
      'update hubspot deal stage',
      'move hubspot deal',
      'change deal stage',
      'hubspot deal stage',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'HubSpot deal ID' },
        dealstage: { type: 'string', description: 'Target deal stage ID' },
      },
      required: ['dealId', 'dealstage'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deal: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            dealname: { type: 'string' },
            dealstage: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getHubSpotAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'HubSpot not connected. Please connect HubSpot in settings.',
        }
      }

      const budget = getRetryBudget('hubspot', 1)
      const deal = await executeWithRetry(
        () =>
          updateDealStage(
            token,
            args.dealId as string,
            args.dealstage as string
          ),
        budget
      )

      return {
        success: true,
        data: {
          deal: {
            id: deal.id,
            dealname: deal.properties.dealname,
            dealstage: deal.properties.dealstage,
          },
        },
      }
    },
  },

  // ── hubspot.notes.create ────────────────────────────────────────────────────
  {
    id: 'hubspot.notes.create',
    description:
      'Attach a note to a contact, company, or deal in HubSpot CRM. Provide the note body and target associations.',
    triggers: [
      'create hubspot note',
      'add hubspot note',
      'hubspot note',
      'attach note hubspot',
      'log note hubspot',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        body: {
          type: 'string',
          description: 'Note body text (hs_note_body)',
        },
        contactId: {
          type: 'string',
          description: 'Contact ID to attach note to (optional)',
        },
        companyId: {
          type: 'string',
          description: 'Company ID to attach note to (optional)',
        },
        dealId: {
          type: 'string',
          description: 'Deal ID to attach note to (optional)',
        },
      },
      required: ['body'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        note: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            hs_note_body: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getHubSpotAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'HubSpot not connected. Please connect HubSpot in settings.',
        }
      }

      const associations: Array<{ type: string; id: string }> = []
      if (args.contactId) {
        associations.push({ type: 'contact', id: args.contactId as string })
      }
      if (args.companyId) {
        associations.push({ type: 'company', id: args.companyId as string })
      }
      if (args.dealId) {
        associations.push({ type: 'deal', id: args.dealId as string })
      }

      const budget = getRetryBudget('hubspot', 1)
      const note = await executeWithRetry(
        () =>
          createNote(token, {
            body: args.body as string,
            associations,
          }),
        budget
      )

      return {
        success: true,
        data: {
          note: {
            id: note.id,
            hs_note_body: note.properties.hs_note_body,
          },
        },
      }
    },
  },

  // ── hubspot.tickets.create ─────────────────────────────────────────────────
  {
    id: 'hubspot.tickets.create',
    description:
      'Create a support ticket in HubSpot CRM. Provide subject, content, and priority.',
    triggers: [
      'create hubspot ticket',
      'add hubspot ticket',
      'new hubspot ticket',
      'hubspot ticket',
      'support ticket',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Ticket subject' },
        content: {
          type: 'string',
          description: 'Ticket description / body',
        },
        hs_ticket_priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'Ticket priority',
          default: 'MEDIUM',
        },
      },
      required: ['subject'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            subject: { type: 'string' },
            hs_ticket_priority: { type: 'string' },
            hs_ticket_state: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
    execute: async (args, context) => {
      const token = await getHubSpotAccessToken(context.userId)
      if (!token) {
        return {
          success: false,
          data: null,
          error: 'HubSpot not connected. Please connect HubSpot in settings.',
        }
      }

      const budget = getRetryBudget('hubspot', 1)
      const ticket = await executeWithRetry(
        () =>
          createTicket(token, {
            subject: args.subject as string,
            content: (args.content as string) ?? '',
            hs_ticket_priority:
              (args.hs_ticket_priority as string) ?? 'MEDIUM',
          }),
        budget
      )

      return {
        success: true,
        data: {
          ticket: {
            id: ticket.id,
            subject: ticket.properties.subject,
            hs_ticket_priority: ticket.properties.hs_ticket_priority,
            hs_ticket_state: ticket.properties.hs_ticket_state,
          },
        },
      }
    },
  },
]
