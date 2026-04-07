/**
 * QuickBooks write tools — all require 'needs_approval' permission.
 */

import { getQuickBooksAccessToken } from '@/lib/integrations/quickbooks/index'
import { createInvoice, sendInvoice, recordPayment } from '@/lib/integrations/quickbooks/client'
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

export interface QuickBooksWriteTool {
  id: string
  description: string
  triggers: string[]
  inputSchema: object
  outputSchema: object
  isConcurrencySafe: boolean
  permissionLevel: 'needs_approval'
  execute(args: Record<string, unknown>, context: { userId: string }): Promise<ToolResult>
}

export const quickbooksWriteTools: QuickBooksWriteTool[] = [
  // ── quickbooks.invoices.create ─────────────────────────────────────────────
  {
    id: 'quickbooks.invoices.create',
    description: 'Create and optionally email an invoice in QuickBooks Online. Provide customer ID, line items, and due date.',
    triggers: [
      'create quickbooks invoice',
      'create invoice quickbooks',
      'new quickbooks invoice',
      'quickbooks invoice create',
      'invoice the',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'QuickBooks customer ID' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              amount: { type: 'number' },
              quantity: { type: 'number', default: 1 },
            },
            required: ['amount'],
          },
        },
        dueDate: { type: 'string', description: 'Due date as YYYY-MM-DD or ISO string' },
        docNumber: { type: 'string', description: 'Invoice number (optional, auto-generated if not provided)' },
        emailDelivery: { type: 'boolean', description: 'Send invoice via email after creation', default: false },
      },
      required: ['customerId', 'lineItems'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        invoice: {
          type: 'object',
          properties: {
            Id: { type: 'string' },
            DocNumber: { type: 'string' },
            TotalAmt: { type: 'number' },
            Balance: { type: 'number' },
            DueDate: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
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
        () =>
          createInvoice(token, realmId, {
            customerId: args.customerId as string,
            lineItems: args.lineItems as any[],
            dueDate: args.dueDate as string | undefined,
            docNumber: args.docNumber as string | undefined,
            emailDelivery: args.emailDelivery as boolean | undefined,
          }),
        budget
      )

      return {
        success: true,
        data: {
          invoice: {
            Id: invoice.Id,
            DocNumber: invoice.DocNumber,
            TotalAmt: invoice.TotalAmt,
            Balance: invoice.Balance,
            DueDate: invoice.DueDate,
          },
        },
      }
    },
  },

  // ── quickbooks.invoices.send ───────────────────────────────────────────────
  {
    id: 'quickbooks.invoices.send',
    description: 'Send an existing QuickBooks invoice via email to the customer.',
    triggers: [
      'send quickbooks invoice',
      'email quickbooks invoice',
      'quickbooks invoice send',
      'send invoice',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'QuickBooks invoice ID to send' },
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
            EmailStatus: { type: 'string' },
          },
        },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
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
        () => sendInvoice(token, realmId, args.invoiceId as string),
        budget
      )

      return {
        success: true,
        data: {
          invoice: {
            Id: invoice.Id,
            EmailStatus: invoice.EmailStatus,
          },
        },
      }
    },
  },

  // ── quickbooks.invoices.record_payment ─────────────────────────────────────
  {
    id: 'quickbooks.invoices.record_payment',
    description: 'Record a payment to mark a QuickBooks invoice as fully or partially paid.',
    triggers: [
      'record quickbooks payment',
      'mark invoice paid',
      'quickbooks payment',
      'invoice paid',
      'record payment quickbooks',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'QuickBooks invoice ID' },
        amount: { type: 'number', description: 'Payment amount (optional, defaults to full balance)' },
      },
      required: ['invoiceId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        payment: { type: 'object' },
      },
    },
    isConcurrencySafe: false,
    permissionLevel: 'needs_approval',
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
      const result = await executeWithRetry(
        () => recordPayment(token, realmId, args.invoiceId as string, args.amount as number | undefined),
        budget
      )

      return { success: true, data: { payment: result.payment } }
    },
  },
]