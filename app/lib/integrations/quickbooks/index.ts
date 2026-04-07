/**
 * QuickBooks Credential helpers — getCredential + refreshTokenIfNeeded.
 * Stores tokens encrypted in the generic `credentials` table with provider = 'quickbooks'.
 */

import { getCredential, saveCredential } from '@/lib/db/queries'
import { encrypt, decrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'
import type { QuickBooksTokens } from './types'

const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Get decrypted QuickBooks tokens for a user.
 */
export async function getQuickBooksTokens(
  userId: string
): Promise<QuickBooksTokens | null> {
  const cred = await getCredential(userId, 'quickbooks')
  if (!cred) return null

  try {
    return JSON.parse(decrypt(cred.encrypted_token))
  } catch {
    return null
  }
}

/**
 * Get a valid QuickBooks access token, proactively refreshing if near expiry.
 * Returns null if no token is stored or refresh fails.
 */
export async function getQuickBooksAccessToken(
  userId: string
): Promise<string | null> {
  const cred = await getCredential(userId, 'quickbooks')
  if (!cred) return null

  let tokens: QuickBooksTokens
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
      tokens = await refreshQuickBooksAccessToken(tokens.refreshToken, tokens.realmId)
      const encrypted = encrypt(JSON.stringify(tokens))
      await saveCredential(
        cred.id,
        userId,
        'quickbooks',
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
 * Refresh the QuickBooks token if needed and re-encrypt + save.
 */
export async function refreshTokenIfNeeded(
  userId: string
): Promise<string | null> {
  return getQuickBooksAccessToken(userId)
}

/**
 * Store QuickBooks tokens for a user.
 */
export async function saveQuickBooksTokensForUser(
  userId: string,
  tokens: QuickBooksTokens
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens))
  await saveCredential(
    nanoid(),
    userId,
    'quickbooks',
    encrypted,
    tokens.expiresAt ?? null
  )
}

/**
 * Exchange authorization code for QuickBooks tokens.
 */
export async function exchangeCodeForQuickBooksTokens(
  code: string,
  redirectUri: string,
  realmId?: string
): Promise<QuickBooksTokens> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be set')
  }

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
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

  const json = await res.json()
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    realmId: json.realmId ?? realmId,
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

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
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

/**
 * Check if QuickBooks has been connected for a user.
 */
export async function isQuickBooksConnected(userId: string): Promise<boolean> {
  const token = await getQuickBooksAccessToken(userId)
  return token !== null
}