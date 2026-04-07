/**
 * HubSpot read tools.
 */

import { getHubSpotAccessToken, HubSpotContact } from '@/lib/connectors/hubspot/client'
import { listContacts, searchContacts, listDeals, getDeal, listTickets, getCompany } from '@/lib/connectors/hubspot/client'
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

export interface HubSpotReadTool {
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

export const hubspotReadTools: HubSpotReadTool[] = [
  // ── hubspot.contacts.list ─────────────────────────────────────────────────
  {
    id: 'hubspot.contacts.list',
    description:
      'List contacts from HubSpot CRM — returns all contacts with their properties (name, email, phone, company).',
    triggers: [
      'get hubspot contacts',
      'read hubspot contacts',
      'list hubspot contacts',
      'hubspot contacts',
      'fetch hubspot contacts',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of contacts to return (default 100, max 100)',
          default: 100,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              firstname: { type: 'string' },
              lastname: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              company: { type: 'string' },
              createdate: { type: 'string' },
            },
          },
        },
        hasMore: { type: 'boolean' },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
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
      const result = await executeWithRetry(
        () => listContacts(token, (args.limit as number) ?? 100),
        budget
      )

      return {
        success: true,
        data: {
          contacts: result.contacts.map((c: HubSpotContact) => ({
            id: c.id,
            firstname: c.properties.firstname,
            lastname: c.properties.lastname,
            email: c.properties.email,
            phone: c.properties.phone,
            company: c.properties.company,
            createdate: c.properties.createdate,
          })),
          hasMore: result.hasMore,
          after: result.after,
        },
      }
    },
  },

  // ── hubspot.contacts.search ────────────────────────────────────────────────
  {
    id: 'hubspot.contacts.search',
    description:
      'Search contacts in HubSpot CRM by name, email, or company name.',
    triggers: [
      'search hubspot contacts',
      'find hubspot contacts',
      'hubspot contact search',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (matches name, email, or company)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 20,
        },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          items: {
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
        hasMore: { type: 'boolean' },
        total: { type: 'number' },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
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
      const result = await executeWithRetry(
        () => searchContacts(token, args.query as string, (args.limit as number) ?? 20),
        budget
      )

      return {
        success: true,
        data: {
          contacts: result.contacts.map((c) => ({
            id: c.id,
            firstname: c.properties.firstname,
            lastname: c.properties.lastname,
            email: c.properties.email,
            phone: c.properties.phone,
            company: c.properties.company,
          })),
          hasMore: result.hasMore,
          total: result.total,
        },
      }
    },
  },

  // ── hubspot.deals.list ─────────────────────────────────────────────────────
  {
    id: 'hubspot.deals.list',
    description:
      'List deals from HubSpot CRM — returns all open deals with their properties (name, amount, stage, close date).',
    triggers: [
      'get hubspot deals',
      'read hubspot deals',
      'list hubspot deals',
      'hubspot deals',
      'fetch hubspot deals',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of deals to return (default 100)',
          default: 100,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              dealname: { type: 'string' },
              amount: { type: 'string' },
              dealstage: { type: 'string' },
              closedate: { type: 'string' },
              createdate: { type: 'string' },
            },
          },
        },
        hasMore: { type: 'boolean' },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
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
      const result = await executeWithRetry(
        () => listDeals(token, (args.limit as number) ?? 100),
        budget
      )

      return {
        success: true,
        data: {
          deals: result.deals.map((d) => ({
            id: d.id,
            dealname: d.properties.dealname,
            amount: d.properties.amount,
            dealstage: d.properties.dealstage,
            closedate: d.properties.closedate,
            createdate: d.properties.createdate,
          })),
          hasMore: result.hasMore,
          after: result.after,
        },
      }
    },
  },

  // ── hubspot.deals.get ──────────────────────────────────────────────────────
  {
    id: 'hubspot.deals.get',
    description:
      'Get a single deal from HubSpot CRM by ID — returns all properties.',
    triggers: [
      'get hubspot deal',
      'hubspot deal details',
      'get deal by id',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        dealId: {
          type: 'string',
          description: 'HubSpot deal ID',
        },
      },
      required: ['dealId'],
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
            createdate: { type: 'string' },
            pipeline: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
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
        () => getDeal(token, args.dealId as string),
        budget
      )

      if (!deal) {
        return {
          success: false,
          data: null,
          error: `Deal not found: ${args.dealId}`,
        }
      }

      return {
        success: true,
        data: {
          deal: {
            id: deal.id,
            dealname: deal.properties.dealname,
            amount: deal.properties.amount,
            dealstage: deal.properties.dealstage,
            closedate: deal.properties.closedate,
            createdate: deal.properties.createdate,
            pipeline: deal.properties.pipeline,
            description: deal.properties.description,
          },
        },
      }
    },
  },

  // ── hubspot.tickets.list ───────────────────────────────────────────────────
  {
    id: 'hubspot.tickets.list',
    description:
      'List open support tickets from HubSpot CRM.',
    triggers: [
      'get hubspot tickets',
      'list hubspot tickets',
      'hubspot tickets',
      'support tickets',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of tickets to return (default 100)',
          default: 100,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        tickets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subject: { type: 'string' },
              content: { type: 'string' },
              hs_ticket_priority: { type: 'string' },
              hs_pipeline: { type: 'string' },
              hs_ticket_state: { type: 'string' },
              createdate: { type: 'string' },
            },
          },
        },
        hasMore: { type: 'boolean' },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
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
      const result = await executeWithRetry(
        () => listTickets(token, (args.limit as number) ?? 100),
        budget
      )

      return {
        success: true,
        data: {
          tickets: result.tickets.map((t) => ({
            id: t.id,
            subject: t.properties.subject,
            content: t.properties.content,
            hs_ticket_priority: t.properties.hs_ticket_priority,
            hs_pipeline: t.properties.hs_pipeline,
            hs_ticket_state: t.properties.hs_ticket_state,
            createdate: t.properties.createdate,
          })),
          hasMore: result.hasMore,
          after: result.after,
        },
      }
    },
  },

  // ── hubspot.company.get ───────────────────────────────────────────────────
  {
    id: 'hubspot.company.get',
    description:
      'Get a company from HubSpot CRM by ID or domain name.',
    triggers: [
      'get hubspot company',
      'hubspot company',
      'get company by domain',
      'find company',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Company ID or domain (e.g. "acme.com")',
        },
      },
      required: ['identifier'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        company: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            domain: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
            country: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
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
      const company = await executeWithRetry(
        () => getCompany(token, args.identifier as string),
        budget
      )

      if (!company) {
        return {
          success: false,
          data: null,
          error: `Company not found: ${args.identifier}`,
        }
      }

      return {
        success: true,
        data: {
          company: {
            id: company.id,
            name: company.properties.name,
            domain: company.properties.domain,
            phone: company.properties.phone,
            address: company.properties.address,
            city: company.properties.city,
            state: company.properties.state,
            zip: company.properties.zip,
            country: company.properties.country,
          },
        },
      }
    },
  },
]
