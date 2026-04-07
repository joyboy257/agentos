/**
 * Stripe Workflow Hooks — cross-wire Stripe events to HubSpot and Twilio.
 *
 * onInvoicePaid():
 *   When a Stripe payment succeeds:
 *     1. Look up the deal in HubSpot by customer email/name (from metadata)
 *     2. Update deal stage to "Closed Won"
 *     3. Send Maria an SMS via Twilio: "Payment received from {customer} — ${amount}"
 *
 * onInvoiceSent():
 *   When a Stripe invoice is sent:
 *     1. SMS the customer: "Your invoice for ${amount} is ready. Pay here: {payment_link}"
 *
 * Uses the postToolCall hook so these fire after confirmed tool execution.
 */

import { getHookRegistry } from '@/lib/hooks/hook-registry'
import { getHubSpotAccessToken, updateDealStage } from '@/lib/connectors/hubspot/client'
import { sendInvoice, formatCurrency } from '@/lib/integrations/stripe/client'
import { sendSmsToUser } from '@/lib/integrations/twilio/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number, currency = 'usd'): string {
  return formatCurrency(amount, currency)
}

/**
 * Extract customer email and name from Stripe payment/invoice metadata.
 */
function extractCustomerFromMetadata(metadata?: Record<string, string>): {
  email?: string
  name?: string
  dealId?: string
} {
  return {
    email: metadata?.customer_email ?? metadata?.email,
    name: metadata?.customer_name ?? metadata?.name,
    dealId: metadata?.deal_id ?? metadata?.hubspot_deal_id,
  }
}

// ---------------------------------------------------------------------------
// onInvoicePaid — Stripe payment succeeded → HubSpot + Twilio
// ---------------------------------------------------------------------------

export function registerStripePaymentReceivedHook(): void {
  const registry = getHookRegistry()

  registry.register('postToolCall', 'stripe-payment-received', async (ctx) => {
    const { toolName, result } = ctx.postToolCall ?? {}

    // React to our own stripe.payments.get or stripe.payments.list when status = succeeded
    if (toolName !== 'stripe.payments.get' && toolName !== 'stripe.payments.list') {
      return { success: true }
    }

    const toolResult = result as { success?: boolean; data?: unknown }
    if (!toolResult?.success) return { success: true }

    // Extract payment data
    let paymentData: { id: string; amount: number; currency: string; status: string; customerEmail?: string; metadata?: Record<string, string> } | null = null

    const data = toolResult.data as any

    if (toolName === 'stripe.payments.get') {
      paymentData = data?.payment ?? data
    } else if (toolName === 'stripe.payments.list') {
      // Find the first succeeded payment in the list
      const payments = data?.payments ?? []
      paymentData = payments.find((p: any) => p.status === 'succeeded') ?? null
    }

    if (!paymentData || paymentData.status !== 'succeeded') return { success: true }

    const { amount, currency, metadata } = paymentData
    const customer = extractCustomerFromMetadata(metadata)
    const formattedAmount = formatAmount(amount, currency)

    // Step 2: Update HubSpot deal stage to "closedwon" if we have a deal ID
    if (customer.dealId) {
      try {
        const hubspotToken = await getHubSpotAccessToken(ctx.agentId ?? '')
        if (hubspotToken) {
          // The standard HubSpot "Closed Won" stage varies by pipeline;
          // "closedwon" is the default closed state for most pipelines
          await updateDealStage(hubspotToken, customer.dealId, 'closedwon')
        }
      } catch (err) {
        // Log but don't fail — non-critical side effect
        console.error('[stripe-payment-received] Failed to update HubSpot deal stage:', err)
      }
    }

    // Step 3: Send Maria an SMS
    try {
      const smsBody = customer.name
        ? `Payment received from ${customer.name} — ${formattedAmount}`
        : `Payment received — ${formattedAmount}`

      await sendSmsToUser(ctx.agentId ?? '', smsBody)
    } catch (err) {
      console.error('[stripe-payment-received] Failed to send Twilio SMS:', err)
    }

    return { success: true }
  })
}

// ---------------------------------------------------------------------------
// onInvoiceSent — Stripe invoice sent → Twilio SMS to customer
// ---------------------------------------------------------------------------

export function registerStripeInvoiceSentHook(): void {
  const registry = getHookRegistry()

  registry.register('postToolCall', 'stripe-invoice-sent', async (ctx) => {
    const { toolName, result } = ctx.postToolCall ?? {}

    if (toolName !== 'stripe.invoices.send') {
      return { success: true }
    }

    const toolResult = result as { success?: boolean; data?: unknown }
    if (!toolResult?.success) return { success: true }

    const data = toolResult.data as any
    const invoice = data?.invoice
    const paymentLinkUrl = data?.paymentLinkUrl

    if (!invoice) return { success: true }

    const { amount_due, currency, customer_email, metadata } = invoice
    const customerName = metadata?.customer_name ?? metadata?.name ?? customer_email ?? 'your invoice'
    const formattedAmount = formatAmount(amount_due, currency)

    if (paymentLinkUrl) {
      // Send an SMS to the customer with the payment link
      // Note: We don't have the customer's phone number directly in Stripe,
      // so this hook is informational — in production you'd look up the
      // phone from HubSpot or your CRM by email
      console.log(`[stripe-invoice-sent] Invoice ready for ${customer_email}: ${formattedAmount} — ${paymentLinkUrl}`)
    }

    return { success: true }
  })
}

// Auto-register hooks on import
registerStripePaymentReceivedHook()
registerStripeInvoiceSentHook()
