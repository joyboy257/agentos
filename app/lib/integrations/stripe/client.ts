/**
 * Stripe Client — wraps Stripe REST API for payments, invoices, and payment links.
 * Uses STRIPE_SECRET_KEY env var (API key auth, not OAuth).
 */

import Stripe from 'stripe'
import { withRetry, DEFAULT_RETRY_CONFIG, getRetryBudget } from '@/lib/middleware/with-retry'
import { translateToolError } from '@/lib/middleware/error-translation'
import type {
  StripePayment,
  StripePaymentListResponse,
  StripePaymentLink,
  StripeInvoice,
  CreatePaymentLinkInput,
  SendInvoiceInput,
} from './types'

// ---------------------------------------------------------------------------
// Stripe client (singleton per process)
// ---------------------------------------------------------------------------

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw Object.assign(new Error('STRIPE_SECRET_KEY is not set'), { code: 'UNAUTHORIZED' })
  }
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' })
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

// ---------------------------------------------------------------------------
// Internal retry helper
// ---------------------------------------------------------------------------

async function executeWithRetry<T>(fn: () => Promise<T>, budget: ReturnType<typeof getRetryBudget>): Promise<T> {
  return withRetry(fn, DEFAULT_RETRY_CONFIG, (err: any) => {
    const status = err?.status ?? err?.response?.status
    return status === 429 || (status >= 500 && status < 600)
  }, budget)
}

// ---------------------------------------------------------------------------
// listPayments — list recent payment intents
// ---------------------------------------------------------------------------

export async function listPayments(
  limit = 20,
  startingAfter?: string
): Promise<StripePaymentListResponse> {
  const stripe = getStripeClient()
  const budget = getRetryBudget('stripe', 1)

  const result = await executeWithRetry(async () => {
    const intents = await stripe.paymentIntents.list({
      limit: Math.min(limit, 100),
      starting_after: startingAfter,
    })

    const payments: StripePayment[] = intents.data.map((pi) => {
      // Stripe SDK v22 uses amount_received for partial refunds
      const refunded = (pi as any).amount_refunded > 0 || (pi as any).amount_received < pi.amount
      return {
        id: pi.id,
        type: 'payment_intent' as const,
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status,
        customer: pi.customer as string | undefined,
        customerEmail: pi.receipt_email ?? undefined,
        description: pi.description ?? undefined,
        metadata: pi.metadata,
        created: pi.created,
        livemode: pi.livemode,
        paid: pi.status === 'succeeded',
        refunded,
      }
    })

    // total_count is not on the Response type in Stripe v22 — use data length
    return {
      payments,
      hasMore: intents.has_more,
    }
  }, budget)

  return result
}

// ---------------------------------------------------------------------------
// getPaymentStatus — get a single payment intent by ID
// ---------------------------------------------------------------------------

export async function getPaymentStatus(paymentIntentId: string): Promise<StripePayment | null> {
  const stripe = getStripeClient()
  const budget = getRetryBudget('stripe', 1)

  try {
    const pi = await executeWithRetry(async () => {
      return stripe.paymentIntents.retrieve(paymentIntentId)
    }, budget)

    const refunded = (pi as any).amount_refunded > 0 || (pi as any).amount_received < pi.amount

    return {
      id: pi.id,
      type: 'payment_intent',
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
      customer: pi.customer as string | undefined,
      customerEmail: pi.receipt_email ?? undefined,
      description: pi.description ?? undefined,
      metadata: pi.metadata,
      created: pi.created,
      livemode: pi.livemode,
      paid: pi.status === 'succeeded',
      refunded,
    }
  } catch (err: any) {
    if (err?.code === 'StripeResourceNotFound') return null
    throw err
  }
}

// ---------------------------------------------------------------------------
// createPaymentLink — generate a Stripe payment link for a given amount
// ---------------------------------------------------------------------------

export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<StripePaymentLink> {
  const stripe = getStripeClient()
  const appUrl = getAppUrl()
  const budget = getRetryBudget('stripe', 1)

  const { amount, currency = 'usd', customerEmail, description, metadata } = input

  const result = await executeWithRetry(async () => {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // amount in cents
      currency,
      receipt_email: customerEmail,
      description,
      metadata,
      automatic_payment_methods: { enabled: true },
    })

    // Generate a hosted payment page URL for the payment intent
    const paymentIntentUrl = `${appUrl}/pay/${paymentIntent.id}`

    return {
      id: `plink_${paymentIntent.id}`,
      url: paymentIntentUrl,
      amount,
      currency,
      customerEmail,
      metadata,
      active: true,
      created: Math.floor(Date.now() / 1000),
    }
  }, budget)

  return result
}

// ---------------------------------------------------------------------------
// sendInvoice — create and send a Stripe invoice
// ---------------------------------------------------------------------------

export async function sendInvoice(input: SendInvoiceInput): Promise<{
  invoice: StripeInvoice
  paymentLinkUrl: string
}> {
  const stripe = getStripeClient()
  const appUrl = getAppUrl()
  const budget = getRetryBudget('stripe', 1)

  const { customerEmail, amount, currency = 'usd', description, metadata, dueDate } = input

  const result = await executeWithRetry(async () => {
    // First create a customer (or look up by email)
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 })
    let customerId: string

    if (customers.data.length > 0) {
      customerId = customers.data[0].id
    } else {
      const newCustomer = await stripe.customers.create({
        email: customerEmail,
        metadata,
      })
      customerId = newCustomer.id
    }

    // Create an invoice item
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: Math.round(amount),
      currency,
      description: description ?? `Invoice for ${customerEmail}`,
    })

    // Create and finalize the invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: dueDate ? Math.floor((dueDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24)) : 30,
      description,
      metadata,
      auto_advance: true,
    })

    // Finalize and send the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id)
    await stripe.invoices.sendInvoice(finalizedInvoice.id)

    // Get the updated invoice with hosted URL
    const sentInvoice = await stripe.invoices.retrieve(finalizedInvoice.id)

    // payment_intent may be a string or Stripe.PaymentIntent in v22 — normalize to string
    const paymentIntentValue = (sentInvoice as any).payment_intent
    const paymentIntentId = typeof paymentIntentValue === 'string'
      ? paymentIntentValue
      : paymentIntentValue?.id

    const invoiceOutput: StripeInvoice = {
      id: sentInvoice.id,
      object: 'invoice',
      amount_paid: sentInvoice.amount_paid,
      amount_due: sentInvoice.amount_due,
      currency: sentInvoice.currency,
      status: sentInvoice.status ?? 'open',
      customer: sentInvoice.customer as string,
      customer_email: sentInvoice.customer_email ?? customerEmail,
      description: sentInvoice.description ?? description,
      metadata: sentInvoice.metadata ?? undefined,
      hosted_invoice_url: sentInvoice.hosted_invoice_url ?? undefined,
      invoice_pdf: sentInvoice.invoice_pdf ?? undefined,
      created: sentInvoice.created,
      livemode: sentInvoice.livemode,
      paid: sentInvoice.status === 'paid',
      payment_intent: paymentIntentId,
    }

    return {
      invoice: invoiceOutput,
      paymentLinkUrl: sentInvoice.hosted_invoice_url ?? `${appUrl}/invoices/${sentInvoice.id}`,
    }
  }, budget)

  return result
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a dollar amount for display.
 */
export function formatCurrency(amount: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}
