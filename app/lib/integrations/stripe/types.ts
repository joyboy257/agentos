/**
 * Stripe types for payments, invoices, and payment links.
 */

export interface StripePaymentIntent {
  id: string
  object: 'payment_intent'
  amount: number
  currency: string
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded'
  customer?: string
  customer_email?: string
  description?: string
  metadata?: Record<string, string>
  created: number
  livemode: boolean
}

export interface StripePayment {
  id: string
  type: 'payment_intent' | 'charge' | 'invoice'
  amount: number
  currency: string
  status: string
  customer?: string
  customerEmail?: string
  description?: string
  metadata?: Record<string, string>
  created: number
  livemode: boolean
  paid: boolean
  refunded: boolean
}

export interface StripePaymentListResponse {
  payments: StripePayment[]
  hasMore: boolean
  totalCount?: number
}

export interface StripePaymentLink {
  id: string
  url: string
  amount?: number
  currency?: string
  customerEmail?: string
  metadata?: Record<string, string>
  active: boolean
  created: number
}

export interface StripeInvoice {
  id: string
  object: string // Stripe v22 uses string; use 'invoice' as the known value
  amount_paid: number
  amount_due: number
  currency: string
  status: string // Stripe v22: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  customer?: string
  customer_email?: string
  description?: string
  metadata?: Record<string, string>
  hosted_invoice_url?: string
  invoice_pdf?: string
  created: number
  livemode: boolean
  paid: boolean
  payment_intent?: string
}

export interface CreatePaymentLinkInput {
  amount: number
  currency?: string
  customerEmail?: string
  description?: string
  metadata?: Record<string, string>
}

export interface SendInvoiceInput {
  customerEmail: string
  amount: number
  currency?: string
  description?: string
  metadata?: Record<string, string>
  dueDate?: number // Unix timestamp
}
