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

// Refresh token proactively when within 10 minutes of expiry
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

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

/**
 * Get a valid HubSpot access token for a user.
 * Proactively refreshes if within TOKEN_REFRESH_BUFFER_MS of expiry.
 */
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

  // Proactively refresh if expiring soon
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

/**
 * Store HubSpot tokens for a user.
 */
export async function saveHubSpotTokensForUser(
  userId: string,
  tokens: HubSpotTokens
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens))
  await saveCredential(nanoid(), userId, 'hubspot', encrypted, tokens.expiresAt ?? null)
}

/**
 * Check if a user has connected HubSpot.
 */
export async function isHubSpotConnected(userId: string): Promise<boolean> {
  const token = await getHubSpotAccessToken(userId)
  return token !== null
}

// ---------------------------------------------------------------------------
// HubSpot API Calls
// ---------------------------------------------------------------------------

async function hubSpotFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${HUBSPOT_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Get contacts from HubSpot CRM.
 */
export async function getContacts(
  accessToken: string,
  limit = 100
): Promise<{ contacts: HubSpotContact[]; hasMore: boolean; after?: string }> {
  const res = await hubSpotFetch(
    `/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,email,phone,company,createdate,lastmodifieddate`,
    accessToken
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot getContacts failed: ${res.status}`), {
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

/**
 * Get deals from HubSpot CRM.
 */
export async function getDeals(
  accessToken: string,
  limit = 100
): Promise<{ deals: HubSpotDeal[]; hasMore: boolean; after?: string }> {
  const res = await hubSpotFetch(
    `/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,closedate,createdate,hs_lastmodifieddate`,
    accessToken
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot getDeals failed: ${res.status}`), {
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

/**
 * Get leads from HubSpot — uses contacts API filtered to leads lifecycle stage.
 * Returns contacts that are in the "lead" or earlier lifecycle stages.
 */
export async function getLeads(
  accessToken: string,
  limit = 100
): Promise<{ leads: HubSpotLead[]; hasMore: boolean; after?: string }> {
  // HubSpot doesn't have a separate "leads" object; leads are contacts with specific lifecyclestage
  const res = await hubSpotFetch(
    `/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,email,phone,company,lifecyclestage,createdate}&filterGroups[0][filters][0][propertyName]=lifecyclestage&filterGroups[0][filters][0][operator]=IN&filterGroups[0][filters][0][values]=lead,marketingqualifiedlead,salesqualifiedlead`,
    accessToken
  )

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw Object.assign(new Error(`HubSpot getLeads failed: ${res.status}`), {
      status: res.status,
      body: error,
    })
  }

  const json = await res.json()
  return {
    leads: (json.results ?? []).map((c: any) => ({
      id: c.id,
      properties: {
        firstname: c.properties.firstname,
        lastname: c.properties.lastname,
        email: c.properties.email,
        phone: c.properties.phone,
        company: c.properties.company,
        lifecyclestage: c.properties.lifecyclestage,
        createdate: c.properties.createdate,
      },
    })),
    hasMore: json.hasMore ?? false,
    after: json.paging?.next?.after,
  }
}
