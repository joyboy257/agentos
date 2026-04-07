/**
 * QuickBooks read tools — safe, no modification.
 */

import { getQuickBooksAccessToken } from '@/lib/integrations/quickbooks/index'
import { listInvoices, getInvoice, listCustomers } from '@/lib/integrations/quickbooks/client'
import { getCredential } from '@/lib/db/queries'
import { decrypt } from '@/lib/crypto'
import type { QuickBooksTokens } from '@/lib/integrations/quickbooks/types'
import { withRetry, DEFAULT_RETRY_CONFIG, getRetryBudget } from '@/lib/middleware/with-retry'
import type { RetryBudget } from '@/lib/middleware/retry-budget'

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

async function executeWithRetry<T>(fn: () => Promise<T>, budget: RetryBudget): Promise<T> {
  return withRetry(fn, DEFAULT_RETRY_CONFIG, (err: any) => {
    const status = err?.status
    return status === 429 || (status >= 500 && status < 600)
  }, budget)
}

async function getRealmId(userId: string): Promise<string | null> {
  const cred = await getCredential(userId, 'quickbooks')
  if (!cred) return null
  try {
    const tokens: QuickBooksTokens = JSON.parse(decrypt(cred.encrypted_token))
    return tokens.realmId ?? null
  } catch {
    return null
  }
}

export interface QuickBooksReadTool {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'safe'
  execute(args: Record<string, unknown>, context: { userId: string }): Promise<ToolResult>
}

export const quickbooksReadTools: QuickBooksReadTool[] = [
  // ── quickbooks.invoices.list ────────────────────────────────────────────────
  {
    id: 'quickbooks.invoices.list',
    description: 'List invoices from QuickBooks Online — filterable by status (open, paid, overdue).',
    triggers: [
      'get quickbooks invoices',
      'list quickbooks invoices',
      'quickbooks invoices',
      'quickbooks invoice list',
      'outstanding invoices',
      'overdue invoices',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'open', 'paid', 'overdue'],
          description: 'Filter by invoice status (default: all)',
          default: 'all',
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        invoices: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Id: { type: 'string' },
              DocNumber: { type: 'string' },
              CustomerRef: { type: 'object' },
              TotalAmt: { type: 'number' },
              Balance: { type: 'number' },
              DueDate: { type: 'string' },
              InvoiceDate: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (args, context) => {
      const token = await getQuickBooksAccessToken(context.userId)
      if (!token) {
        return { success: false, data: null, error: 'QuickBooks not connected. Please connect QuickBooks in settings.' }
      }

      const realmId = await getRealmId(context.userId)
      if (!realmId) {
        return { success: false, data: null, error: 'QuickBooks realm ID not found. Please reconnect QuickBooks.' }
      }

      const budget = getRetryBudget('quickbooks', 1)
      const status = (args.status as string) ?? 'all'
      const result = await executeWithRetry(
        () => listInvoices(token, realmId, status as any),
        budget
      )

      return {
        success: true,
        data: {
          invoices: result.invoices.map((inv) => ({
            Id: inv.Id,
            DocNumber: inv.DocNumber,
            CustomerRef: inv.CustomerRef,
            TotalAmt: inv.TotalAmt,
            Balance: inv.Balance,
            DueDate: inv.DueDate,
            InvoiceDate: inv.InvoiceDate,
            status: inv.status,
          })),
        },
      }
    },
  },

  // ── quickbooks.invoices.get ─────────────────────────────────────────────────
  {
    id: 'quickbooks.invoices.get',
    description: 'Get a single invoice from QuickBooks Online by ID.',
    triggers: [
      'get quickbooks invoice',
      'quickbooks invoice details',
      'get invoice by id',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'QuickBooks invoice ID' },
      },
      required: ['invoiceId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        invoice: {
          type: 'object',
          properties: {
            Id: { type: 'string' },
            DocNumber: { type: 'string' },
            CustomerRef: { type: 'object' },
            Line: { type: 'array' },
            TotalAmt: { type: 'number' },
            Balance: { type: 'number' },
            DueDate: { type: 'string' },
            InvoiceDate: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (args, context) => {
      const token = await getQuickBooksAccessToken(context.userId)
      if (!token) {
        return { success: false, data: null, error: 'QuickBooks not connected. Please connect QuickBooks in settings.' }
      }

      const realmId = await getRealmId(context.userId)
      if (!realmId) {
        return { success: false, data: null, error: 'QuickBooks realm ID not found. Please reconnect QuickBooks.' }
      }

      const budget = getRetryBudget('quickbooks', 1)
      const invoice = await executeWithRetry(
        () => getInvoice(token, realmId, args.invoiceId as string),
        budget
      )

      if (!invoice) {
        return { success: false, data: null, error: `Invoice not found: ${args.invoiceId}` }
      }

      return { success: true, data: { invoice } }
    },
  },

  // ── quickbooks.customers.list ───────────────────────────────────────────────
  {
    id: 'quickbooks.customers.list',
    description: 'List all customers from QuickBooks Online.',
    triggers: [
      'get quickbooks customers',
      'list quickbooks customers',
      'quickbooks customers',
      'customer list',
    ],
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        customers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              Id: { type: 'string' },
              DisplayName: { type: 'string' },
              PrimaryEmailAddr: { type: 'object' },
              PrimaryPhone: { type: 'object' },
              CompanyName: { type: 'string' },
              GivenName: { type: 'string' },
              FamilyName: { type: 'string' },
            },
          },
        },
      },
    },
    isConcurrencySafe: true,
    permissionLevel: 'safe',
    execute: async (_args, context) => {
      const token = await getQuickBooksAccessToken(context.userId)
      if (!token) {
        return { success: false, data: null, error: 'QuickBooks not connected. Please connect QuickBooks in settings.' }
      }

      const realmId = await getRealmId(context.userId)
      if (!realmId) {
        return { success: false, data: null, error: 'QuickBooks realm ID not found. Please reconnect QuickBooks.' }
      }

      const budget = getRetryBudget('quickbooks', 1)
      const result = await executeWithRetry(
        () => listCustomers(token, realmId),
        budget
      )

      return {
        success: true,
        data: {
          customers: result.customers.map((c) => ({
            Id: c.Id,
            DisplayName: c.DisplayName,
            PrimaryEmailAddr: c.PrimaryEmailAddr,
            PrimaryPhone: c.PrimaryPhone,
            CompanyName: c.CompanyName,
            GivenName: c.GivenName,
            FamilyName: c.FamilyName,
          })),
        },
      }
    },
  },
]