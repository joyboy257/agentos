/**
 * HubSpot API Client — OAuth token management and REST API wrapper.
 * Uses the generic `credentials` table with provider = 'hubspot'.
 */

import { getCredential, saveCredential } from '@/lib/db/queries'
import { encrypt, decrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HubSpotTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
}

export interface HubSpotContact {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    phone?: string
    company?: string
    createdate?: string
    lastmodifieddate?: string
    lifecyclestage?: string
  }
}

export interface HubSpotDeal {
  id: string
  properties: {
    dealname?: string
    amount?: string
    dealstage?: string
    closedate?: string
    createdate?: string
    hs_lastmodifieddate?: string
    pipeline?: string
    hs_deal_stage_probability?: string
    description?: string
  }
}

export interface HubSpotLead {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    phone?: string
    company?: string
    lifecyclestage?: string
    createdate?: string
  }
}

// ---------------------------------------------------------------------------
// OAuth Token Management
// ---------------------------------------------------------------------------

const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'
const HUBSPOT_API_BASE = 'https://api.hubapi.com'

const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

export async function exchangeCodeForHubSpotTokens(
  code: string,
  redirectUri: string
): Promise<HubSpotTokens> {
  const clientId = process.env.HUBSPOT_CLIENT_ID
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be set')
  }

  const res = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HubSpot token exchange failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  }
}

export async function refreshHubSpotAccessToken(
  refreshToken: string
): Promise<HubSpotTokens> {
  const clientId = process.env.HUBSPOT_CLIENT_ID
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be set')
  }

  const res = await fetch(HUBSPOT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HubSpot token refresh failed: ${res.status} ${text}`)
  }

  const json = await res.json()
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  }
}

export async function getHubSpotAccessToken(
  userId: string
): Promise<string | null> {
  const cred = await getCredential(userId, 'hubspot')
  if (!cred) return null

  let tokens: HubSpotTokens
  try {
    tokens = JSON.parse(decrypt(cred.encrypted_token))
  } catch {
    return null
  }

  if (
    tokens.expiresAt &&
    new Date(tokens.expiresAt).getTime() < Date.now() + TOKEN_REFRESH_BUFFER_MS
  ) {
    if (!tokens.refreshToken) return null
    try {
      tokens = await refreshHubSpotAccessToken(tokens.refreshToken)
      const encrypted = encrypt(JSON.stringify(tokens))
      await saveCredential(
        cred.id,
        userId,
        'hubspot',
        encrypted,
        tokens.expiresAt ?? null
      )
    } catch {
      return null
    }
  }

  return tokens.accessToken
}

export async function saveHubSpotTokensForUser(
  userId: string,
  tokens: HubSpotTokens
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens))
  await saveCredential(nanoid(), userId, 'hubspot', encrypted, tokens.expiresAt ?? null)
}

export async function isHubSpotConnected(userId: string): Promise<boolean> {
  const token = await getHubSpotAccessToken(userId)
  return token !== null
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function hubSpotFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const CONTACT_PROPERTIES = [
  'firstname', 'lastname', 'email', 'phone', 'company',
  'createdate', 'lastmodifieddate', 'lifecyclestage',
].join(',')

export async function listContacts(
  accessToken: string,
  limit = 100,
  after?: string
): Promise<{ contacts: HubSpotContact[]; hasMore: boolean; after?: string }> {
  const params = new URLSearchParams({ limit: String(limit), properties: CONTACT_PROPERTIES })
  if (after) params.set('after', after)

  const res = await hubSpotFetch(`/crm/v3/objects/contacts?${params}`, accessToken)
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot listContacts failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()
  return {
    contacts: json.results ?? [],
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
  }
}

export async function searchContacts(
  accessToken: string,
  query: string,
  limit = 20
): Promise<{ contacts: HubSpotContact[]; hasMore: boolean; total?: number }> {
  const res = await hubSpotFetch('/crm/v3/objects/contacts/search', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      query,
      limit,
      properties: CONTACT_PROPERTIES.split(','),
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot searchContacts failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()
  return {
    contacts: json.results ?? [],
    hasMore: json.hasMore ?? false,
    total: json.total,
  }
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

const DEAL_PROPERTIES = [
  'dealname', 'amount', 'dealstage', 'closedate',
  'createdate', 'hs_lastmodifieddate', 'pipeline',
  'hs_deal_stage_probability', 'description',
].join(',')

export async function listDeals(
  accessToken: string,
  limit = 100,
  after?: string
): Promise<{ deals: HubSpotDeal[]; hasMore: boolean; after?: string }> {
  const params = new URLSearchParams({ limit: String(limit), properties: DEAL_PROPERTIES })
  if (after) params.set('after', after)

  const res = await hubSpotFetch(`/crm/v3/objects/deals?${params}`, accessToken)
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot listDeals failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()
  return {
    deals: json.results ?? [],
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
  }
}

export async function getDeal(
  accessToken: string,
  dealId: string
): Promise<HubSpotDeal | null> {
  const res = await hubSpotFetch(
    `/crm/v3/objects/deals/${dealId}?properties=${DEAL_PROPERTIES}`,
    accessToken
  )
  if (!res.ok) return null
  return res.json()
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

const TICKET_PROPERTIES = [
  'subject', 'content', 'hs_ticket_priority',
  'hs_pipeline', 'hs_ticket_state', 'createdate', 'hs_lastmodifieddate',
].join(',')

export async function listTickets(
  accessToken: string,
  limit = 100,
  after?: string
): Promise<{ tickets: any[]; hasMore: boolean; after?: string }> {
  const params = new URLSearchParams({ limit: String(limit), properties: TICKET_PROPERTIES })
  if (after) params.set('after', after)

  const res = await hubSpotFetch(`/crm/v3/objects/tickets?${params}`, accessToken)
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot listTickets failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()
  return {
    tickets: json.results ?? [],
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
  }
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

const COMPANY_PROPERTIES = [
  'name', 'domain', 'phone', 'address',
  'city', 'state', 'zip', 'country', 'createdate', 'lastmodifieddate',
].join(',')

export async function getCompany(
  accessToken: string,
  identifier: string
): Promise<any | null> {
  let res: Response
  try {
    res = await hubSpotFetch(
      `/crm/v3/objects/companies/${identifier}?properties=${COMPANY_PROPERTIES}`,
      accessToken
    )
  } catch {
    return null
  }

  if (res.status === 404) {
    const searchRes = await hubSpotFetch('/crm/v3/objects/companies/search', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: COMPANY_PROPERTIES.split(','),
        filterGroups: [
          { filters: [{ propertyName: 'domain', operator: 'EQ', value: identifier }] },
        ],
      }),
    })
    if (!searchRes.ok) return null
    const searchJson = await searchRes.json()
    if (!searchJson.results?.length) return null
    return searchJson.results[0]
  }

  if (!res.ok) return null
  return res.json()
}

// ---------------------------------------------------------------------------
// Write — Contacts
// ---------------------------------------------------------------------------

export interface CreateContactInput {
  firstname: string
  lastname: string
  email: string
  phone?: string
  company?: string
}

export async function createContact(
  accessToken: string,
  input: CreateContactInput
): Promise<HubSpotContact> {
  const res = await hubSpotFetch('/crm/v3/objects/contacts', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        firstname: input.firstname,
        lastname: input.lastname,
        email: input.email,
        phone: input.phone,
        company: input.company,
      },
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot createContact failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}

export interface UpdateContactInput {
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  company?: string
  lifecyclestage?: string
}

export async function updateContact(
  accessToken: string,
  contactId: string,
  input: UpdateContactInput
): Promise<HubSpotContact> {
  const res = await hubSpotFetch(
    `/crm/v3/objects/contacts/${contactId}`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ properties: input }),
    }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot updateContact failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Write — Deals
// ---------------------------------------------------------------------------

export interface CreateDealInput {
  dealname: string
  amount?: string
  pipeline?: string
  dealstage?: string
  closedate?: string
  description?: string
}

export async function createDeal(
  accessToken: string,
  input: CreateDealInput
): Promise<HubSpotDeal> {
  const res = await hubSpotFetch('/crm/v3/objects/deals', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        dealname: input.dealname,
        amount: input.amount,
        pipeline: input.pipeline ?? 'default',
        dealstage: input.dealstage,
        closedate: input.closedate,
        description: input.description,
      },
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot createDeal failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}

export async function updateDealStage(
  accessToken: string,
  dealId: string,
  dealstage: string
): Promise<HubSpotDeal> {
  const res = await hubSpotFetch(
    `/crm/v3/objects/deals/${dealId}`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ properties: { dealstage } }),
    }
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot updateDealStage failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Write — Notes
// ---------------------------------------------------------------------------

export interface CreateNoteInput {
  body: string
  associations: Array<{ type: string; id: string }>
}

export async function createNote(
  accessToken: string,
  input: CreateNoteInput
): Promise<any> {
  const res = await hubSpotFetch('/crm/v3/objects/notes', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        hs_note_body: input.body,
        hs_timestamp: new Date().toISOString(),
      },
      associations: input.associations.map((a) => ({
        to: { id: a.id },
        types: [{
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: getAssociationTypeId(a.type),
        }],
      })),
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot createNote failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}

/** Maps logical type to HubSpot association type IDs (v3 CRM). */
function getAssociationTypeId(type: string): number {
  const map: Record<string, number> = {
    contact: 1,
    company: 2,
    deal: 3,
    ticket: 4,
  }
  return map[type] ?? 1
}

// ---------------------------------------------------------------------------
// Write — Tickets
// ---------------------------------------------------------------------------

export interface CreateTicketInput {
  subject: string
  content?: string
  hs_ticket_priority?: string
}

export async function createTicket(
  accessToken: string,
  input: CreateTicketInput
): Promise<any> {
  const res = await hubSpotFetch('/crm/v3/objects/tickets', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        subject: input.subject,
        content: input.content,
        hs_ticket_priority: input.hs_ticket_priority ?? 'MEDIUM',
      },
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot createTicket failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  return res.json()
}
