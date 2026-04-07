/**
 * HubSpot Connector — registers hubspot.* tools with the capability registry.
 * Follows the same pattern as lib/connectors/drive/index.ts
 */

import { registry } from '@/lib/registry/capability-registry'
import {
  getHubSpotAccessToken,
  getContacts,
  getDeals,
  getLeads,
} from './client'
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

// ---------------------------------------------------------------------------
// Retry helper for HubSpot API calls
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

interface HubSpotToolDef {
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

const hubspotTools: HubSpotToolDef[] = [
  {
    id: 'hubspot.contacts.read',
    description:
      'Read contacts from HubSpot CRM — lists all contacts with their properties (name, email, phone, company).',
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
          description: 'Maximum number of contacts to return',
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
        () => getContacts(token, (args.limit as number) ?? 100),
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
            createdate: c.properties.createdate,
          })),
          hasMore: result.hasMore,
        },
      }
    },
  },

  {
    id: 'hubspot.deals.read',
    description:
      'Read deals from HubSpot CRM — lists all deals with their properties (name, amount, stage, close date).',
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
          description: 'Maximum number of deals to return',
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
        () => getDeals(token, (args.limit as number) ?? 100),
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
        },
      }
    },
  },

  {
    id: 'hubspot.leads.read',
    description:
      'Read leads from HubSpot CRM — lists contacts in the lead lifecycle stage (early-stage contacts for outreach).',
    triggers: [
      'get hubspot leads',
      'read hubspot leads',
      'list hubspot leads',
      'hubspot leads',
      'fetch hubspot leads',
      'get leads from hubspot',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of leads to return',
          default: 100,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        leads: {
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
              lifecyclestage: { type: 'string' },
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
        () => getLeads(token, (args.limit as number) ?? 100),
        budget
      )

      return {
        success: true,
        data: {
          leads: result.leads.map((l) => ({
            id: l.id,
            firstname: l.properties.firstname,
            lastname: l.properties.lastname,
            email: l.properties.email,
            phone: l.properties.phone,
            company: l.properties.company,
            lifecyclestage: l.properties.lifecyclestage,
            createdate: l.properties.createdate,
          })),
          hasMore: result.hasMore,
        },
      }
    },
  },
]

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerHubSpotCapabilities(): void {
  for (const tool of hubspotTools) {
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
registerHubSpotCapabilities()
