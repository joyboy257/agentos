/**
 * Stripe Connector — registers stripe.* tools with the capability registry.
 */

import { z } from 'zod'
import { capabilityRegistry } from '@/lib/capability-registry'
import type { ToolDefinition, ToolContext, ToolResult } from '@/lib/capability-registry/types'
import { listPayments, getPaymentStatus, createPaymentLink, sendInvoice } from '@/lib/integrations/stripe/client'
import { translateToolError } from '@/lib/middleware/error-translation'

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

async function executeStripePaymentsList(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    limit: z.number().optional().default(20).describe('Max payments to return'),
    startingAfter: z.string().optional().describe('Payment ID to start after (pagination)'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  try {
    const result = await listPayments(parsed.data.limit, parsed.data.startingAfter)
    return {
      success: true,
      data: {
        payments: result.payments.map((p) => ({
          id: p.id,
          type: p.type,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          customerEmail: p.customerEmail,
          description: p.description,
          paid: p.paid,
          refunded: p.refunded,
          created: p.created,
        })),
        hasMore: result.hasMore,
        totalCount: result.totalCount,
      },
    }
  } catch (err: any) {
    const translated = translateToolError(err, 'stripe.payments.list')
    return { success: false, error: translated.llmMessage }
  }
}

async function executeStripePaymentsGet(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    paymentIntentId: z.string().describe('Stripe Payment Intent ID'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  try {
    const payment = await getPaymentStatus(parsed.data.paymentIntentId)
    if (!payment) {
      return { success: false, error: `Payment not found: ${parsed.data.paymentIntentId}` }
    }
    return {
      success: true,
      data: {
        payment: {
          id: payment.id,
          type: payment.type,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          customerEmail: payment.customerEmail,
          description: payment.description,
          paid: payment.paid,
          refunded: payment.refunded,
          created: payment.created,
          metadata: payment.metadata,
        },
      },
    }
  } catch (err: any) {
    const translated = translateToolError(err, 'stripe.payments.get')
    return { success: false, error: translated.llmMessage }
  }
}

async function executeStripePaymentLinkCreate(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    amount: z.number().describe('Amount in cents (e.g. 5000 for $50.00)'),
    currency: z.string().optional().default('usd').describe('Currency code (ISO 4217)'),
    customerEmail: z.string().optional().describe('Customer email address'),
    description: z.string().optional().describe('Description shown on payment page'),
    metadata: z.record(z.string()).optional().describe('Key-value metadata pairs'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  try {
    const result = await createPaymentLink(parsed.data)
    return {
      success: true,
      data: {
        paymentLink: {
          id: result.id,
          url: result.url,
          amount: result.amount,
          currency: result.currency,
          active: result.active,
          created: result.created,
        },
      },
    }
  } catch (err: any) {
    const translated = translateToolError(err, 'stripe.payment_link.create')
    return { success: false, error: translated.llmMessage }
  }
}

async function executeStripeInvoicesSend(
  args: unknown,
  _context: ToolContext
): Promise<ToolResult> {
  const parsed = z.object({
    customerEmail: z.string().describe('Customer email address'),
    amount: z.number().describe('Invoice amount in cents'),
    currency: z.string().optional().default('usd').describe('Currency code'),
    description: z.string().optional().describe('Invoice description'),
    metadata: z.record(z.string()).optional().describe('Metadata pairs'),
    dueDate: z.number().optional().describe('Due date as Unix timestamp'),
  }).safeParse(args)

  if (!parsed.success) {
    return { success: false, error: `Invalid args: ${parsed.error.message}` }
  }

  try {
    const result = await sendInvoice(parsed.data)
    return {
      success: true,
      data: {
        invoice: {
          id: result.invoice.id,
          amountDue: result.invoice.amount_due,
          amountPaid: result.invoice.amount_paid,
          currency: result.invoice.currency,
          status: result.invoice.status,
          customerEmail: result.invoice.customer_email,
          hostedInvoiceUrl: result.invoice.hosted_invoice_url,
          invoicePdf: result.invoice.invoice_pdf,
          paid: result.invoice.paid,
          created: result.invoice.created,
        },
        paymentLinkUrl: result.paymentLinkUrl,
      },
    }
  } catch (err: any) {
    const translated = translateToolError(err, 'stripe.invoices.send')
    return { success: false, error: translated.llmMessage }
  }
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const stripePaymentsListDef: ToolDefinition = {
  name: 'stripe.payments.list',
  description: 'List recent payment intents from Stripe. Returns payments with amount, currency, status, and customer info.',
  isConcurrencySafe: true,
  isDestructive: false,
  permissionLevel: 'safe',
  execute: executeStripePaymentsList,
}

const stripePaymentsGetDef: ToolDefinition = {
  name: 'stripe.payments.get',
  description: 'Get details of a specific Stripe payment intent by its ID.',
  isConcurrencySafe: true,
  isDestructive: false,
  permissionLevel: 'safe',
  execute: executeStripePaymentsGet,
}

const stripePaymentLinkCreateDef: ToolDefinition = {
  name: 'stripe.payment_link.create',
  description: 'Create a Stripe payment link for a given amount. Generates a hosted payment page URL that can be shared with a customer.',
  isConcurrencySafe: false,
  isDestructive: false,
  permissionLevel: 'needs_approval',
  execute: executeStripePaymentLinkCreate,
}

const stripeInvoicesSendDef: ToolDefinition = {
  name: 'stripe.invoices.send',
  description: 'Create and send a Stripe invoice to a customer email. The invoice includes a hosted payment link for the customer to pay.',
  isConcurrencySafe: false,
  isDestructive: false,
  permissionLevel: 'needs_approval',
  execute: executeStripeInvoicesSend,
}

// ---------------------------------------------------------------------------
// Capability + Registration
// ---------------------------------------------------------------------------

export const stripeCapability = {
  id: 'stripe.payments',
  name: 'Stripe Payments',
  description: 'View Stripe payments, create payment links, and send invoices',
  archetype: 'ingest' as const,
  triggerPhrases: [
    'list stripe payments',
    'get stripe payment',
    'check payment status',
    'create payment link',
    'send stripe invoice',
    'invoice customer',
    'send invoice',
    'stripe payments',
  ],
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  tools: [
    'stripe.payments.list',
    'stripe.payments.get',
    'stripe.payment_link.create',
    'stripe.invoices.send',
  ],
  permissionLevel: 'safe' as const,
}

export const stripeToolDefs: ToolDefinition[] = [
  stripePaymentsListDef,
  stripePaymentsGetDef,
  stripePaymentLinkCreateDef,
  stripeInvoicesSendDef,
]

export function registerStripeCapabilities(): void {
  capabilityRegistry.registerCapability(stripeCapability, stripeToolDefs)
}

// Auto-register on import
registerStripeCapabilities()
