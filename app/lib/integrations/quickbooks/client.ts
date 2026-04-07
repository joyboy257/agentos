/**
 * QuickBooks Online API v3 client.
 * OAuth token exchange and refresh, plus CRUD operations for invoices and customers.
 */

import type {
  QuickBooksTokens,
  QuickBooksInvoice,
  QuickBooksCustomer,
  QuickBooksOAuthTokens,
} from './types'

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QUICKBOOKS_API_BASE = 'https://quickbooks.api.intuit.com'

/**
 * Exchange authorization code for QuickBooks tokens.
 */
export async function exchangeCodeForQuickBooksTokens(
  code: string,
  redirectUri: string
): Promise<QuickBooksTokens> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be set')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QuickBooks token exchange failed: ${res.status} ${text}`)
  }

  const json: QuickBooksOAuthTokens = await res.json()
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    realmId: json.realmId,
  }
}

/**
 * Refresh an expired QuickBooks access token.
 */
export async function refreshQuickBooksAccessToken(
  refreshToken: string,
  realmId?: string
): Promise<QuickBooksTokens> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be set')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QuickBooks token refresh failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    realmId: realmId ?? json.realmId,
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function quickBooksFetch(
  path: string,
  accessToken: string,
  realmId: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${QUICKBOOKS_API_BASE}${path}`
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  })
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'open' | 'paid' | 'overdue' | 'all'

/**
 * List invoices, optionally filtered by status.
 * status: 'open' | 'paid' | 'overdue' | 'all' (default 'all')
 */
export async function listInvoices(
  accessToken: string,
  realmId: string,
  status: InvoiceStatus = 'all'
): Promise<{ invoices: QuickBooksInvoice[] }> {
  let query = "SELECT * FROM Invoice ORDERBY MetaData.CreateTime DESC"
  if (status === 'open') {
    query = "SELECT * FROM Invoice WHERE DocStatus = 'Open' ORDERBY MetaData.CreateTime DESC"
  } else if (status === 'paid') {
    query = "SELECT * FROM Invoice WHERE DocStatus = 'Paid' ORDERBY MetaData.CreateTime DESC"
  } else if (status === 'overdue') {
    query = "SELECT * FROM Invoice WHERE Balance > 0 AND DueDate < TODAY ORDERBY DueDate ASC"
  }

  const res = await quickBooksFetch(
    `/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
    accessToken,
    realmId
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`QuickBooks listInvoices failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()
  return { invoices: json.QueryResponse?.Invoice ?? [] }
}

/**
 * Get a single invoice by ID.
 */
export async function getInvoice(
  accessToken: string,
  realmId: string,
  invoiceId: string
): Promise<QuickBooksInvoice | null> {
  const res = await quickBooksFetch(
    `/v3/company/${realmId}/invoice/${invoiceId}`,
    accessToken,
    realmId
  )

  if (!res.ok) return null
  return res.json()
}

export interface CreateInvoiceLineItem {
  description?: string
  amount: number
  quantity?: number
  unitPrice?: number
  itemRef?: string // QuickBooks Item ID
}

export interface CreateInvoiceInput {
  customerId: string
  lineItems: CreateInvoiceLineItem[]
  dueDate?: string // YYYY-MM-DD
  docNumber?: string
  emailDelivery?: boolean
}

/**
 * Create an invoice with line items.
 * If emailDelivery is true, sends the invoice via email.
 */
export async function createInvoice(
  accessToken: string,
  realmId: string,
  input: CreateInvoiceInput
): Promise<QuickBooksInvoice> {
  const lines = input.lineItems.map((item, index) => ({
    Id: String(index + 1),
    LineNum: index + 1,
    Description: item.description ?? `Line item ${index + 1}`,
    Amount: item.amount,
    DetailType: 'SalesItemLineDetail' as const,
    SalesItemLineDetail: {
      Qty: item.quantity ?? 1,
      UnitPrice: item.unitPrice ?? item.amount,
      ItemRef: item.itemRef ? { id: item.itemRef } : undefined,
    },
  }))

  const payload = {
    CustomerRef: { id: input.customerId },
    Line: lines,
    DueDate: input.dueDate,
    DocNumber: input.docNumber,
    EmailStatus: input.emailDelivery ? 'NeedToSend' : 'NotSet',
  }

  const res = await quickBooksFetch(
    `/v3/company/${realmId}/invoice`,
    accessToken,
    realmId,
    { method: 'POST', body: JSON.stringify(payload) }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`QuickBooks createInvoice failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}

/**
 * Send an existing invoice via email.
 */
export async function sendInvoice(
  accessToken: string,
  realmId: string,
  invoiceId: string
): Promise<QuickBooksInvoice> {
  const res = await quickBooksFetch(
    `/v3/company/${realmId}/invoice/${invoiceId}/send`,
    accessToken,
    realmId,
    { method: 'POST' }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`QuickBooks sendInvoice failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}

/**
 * Record a payment to mark an invoice as paid.
 */
export async function recordPayment(
  accessToken: string,
  realmId: string,
  invoiceId: string,
  amount?: number // partial payment supported
): Promise<{ payment: any }> {
  const invoice = await getInvoice(accessToken, realmId, invoiceId)
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)

  const paymentAmount = amount ?? invoice.Balance ?? invoice.TotalAmt ?? 0

  const payload = {
    TotalAmt: paymentAmount,
    Line: [
      {
        Amount: paymentAmount,
        LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }],
      },
    ],
  }

  const res = await quickBooksFetch(
    `/v3/company/${realmId}/purchase`,
    accessToken,
    realmId,
    { method: 'POST', body: JSON.stringify(payload) }
  )

  if (!res.ok) {
    // Fallback: try payment endpoint
    const paymentRes = await quickBooksFetch(
      `/v3/company/${realmId}/payment`,
      accessToken,
      realmId,
      {
        method: 'POST',
        body: JSON.stringify({
          TotalAmt: paymentAmount,
          Line: [{ Amount: paymentAmount, LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }] }],
        }),
      }
    )

    if (!paymentRes.ok) {
      const error = await paymentRes.json().catch(() => ({}))
      throw Object.assign(new Error(`QuickBooks recordPayment failed: ${paymentRes.status}`), {
        status: paymentRes.status,
        body: error,
      })
    }

    return { payment: await paymentRes.json() }
  }

  return { payment: await res.json() }
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * List all customers.
 */
export async function listCustomers(
  accessToken: string,
  realmId: string
): Promise<{ customers: QuickBooksCustomer[] }> {
  const res = await quickBooksFetch(
    `/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer ORDERBY DisplayName ASC MAXRESULTS 1000')}`,
    accessToken,
    realmId
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`QuickBooks listCustomers failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()
  return { customers: json.QueryResponse?.Customer ?? [] }
}