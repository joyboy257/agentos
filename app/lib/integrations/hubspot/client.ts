/**
 * HubSpot API client with token refresh support.
 */

import type {
  HubSpotTokens,
  HubSpotContact,
  HubSpotCompany,
  HubSpotDeal,
  HubSpotTicket,
  HubSpotNote,
  HubSpotSearchResult,
} from './types'

// ---------------------------------------------------------------------------
// OAuth token management
// ---------------------------------------------------------------------------

const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'
const HUBSPOT_API_BASE = 'https://api.hubapi.com'

/**
 * Exchange authorization code for HubSpot tokens.
 */
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

/**
 * Refresh an expired HubSpot access token.
 */
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
  'firstname',
  'lastname',
  'email',
  'phone',
  'company',
  'createdate',
  'lastmodifieddate',
  'lifecyclestage',
].join(',')

/**
 * List contacts with optional pagination.
 */
export async function listContacts(
  accessToken: string,
  limit = 100,
  after?: string
): Promise<HubSpotSearchResult<HubSpotContact>> {
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
    results: json.results ?? [],
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
  }
}

/**
 * Search contacts by name, email, or company.
 */
export async function searchContacts(
  accessToken: string,
  query: string,
  limit = 100
): Promise<HubSpotSearchResult<HubSpotContact>> {
  const res = await hubSpotFetch(`/crm/v3/objects/contacts/search`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      query,
      limit,
      properties: CONTACT_PROPERTIES.split(','),
      filterGroups: [
        {
          filters: [
            { propertyName: 'email', operator: 'CONTAINS', value: query },
            { propertyName: 'firstname', operator: 'CONTAINS', value: query },
            { propertyName: 'lastname', operator: 'CONTAINS', value: query },
            { propertyName: 'company', operator: 'CONTAINS', value: query },
          ],
        },
      ],
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
    results: json.results ?? [],
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
    total: json.total ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

const COMPANY_PROPERTIES = [
  'name',
  'domain',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'country',
  'createdate',
  'lastmodifieddate',
].join(',')

/**
 * Get a company by ID or domain.
 */
export async function getCompany(
  accessToken: string,
  identifier: string
): Promise<HubSpotCompany | null> {
  // Try to fetch by ID first; if it looks like a domain, search instead
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
    // Try searching by domain
    const searchRes = await hubSpotFetch(`/crm/v3/objects/companies/search`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        limit: 1,
        properties: COMPANY_PROPERTIES.split(','),
        filterGroups: [
          {
            filters: [{ propertyName: 'domain', operator: 'EQ', value: identifier }],
          },
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
// Deals
// ---------------------------------------------------------------------------

const DEAL_PROPERTIES = [
  'dealname',
  'amount',
  'dealstage',
  'closedate',
  'createdate',
  'hs_lastmodifieddate',
  'pipeline',
  'hs_deal_stage_probability',
  'description',
].join(',')

/**
 * List deals with optional pagination.
 */
export async function listDeals(
  accessToken: string,
  limit = 100,
  after?: string
): Promise<HubSpotSearchResult<HubSpotDeal>> {
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
    results: json.results ?? [],
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
  }
}

/**
 * Get a single deal by ID with all properties.
 */
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
  'subject',
  'content',
  'hs_ticket_priority',
  'hs_pipeline',
  'hs_ticket_state',
  'createdate',
  'hs_lastmodifieddate',
].join(',')

/**
 * List open support tickets.
 */
export async function listTickets(
  accessToken: string,
  limit = 100,
  after?: string
): Promise<HubSpotSearchResult<HubSpotTicket>> {
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
    results: json.results ?? [],
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
  }
}
