/**
 * HubSpot Credential helpers — getCredential + refreshTokenIfNeeded.
 * Stores tokens encrypted in the generic `credentials` table with provider = 'hubspot'.
 */

import { getCredential, saveCredential } from '@/lib/db/queries'
import { encrypt, decrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'
import type { HubSpotTokens } from './types'
import { refreshHubSpotAccessToken } from './client'

const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

/**
 * Get decrypted HubSpot tokens for a user.
 */
export async function getHubSpotTokens(
  userId: string
): Promise<HubSpotTokens | null> {
  const cred = await getCredential(userId, 'hubspot')
  if (!cred) return null

  try {
    return JSON.parse(decrypt(cred.encrypted_token))
  } catch {
    return null
  }
}

/**
 * Get a valid HubSpot access token, proactively refreshing if near expiry.
 * Returns null if no token is stored or refresh fails.
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
 * Refresh the token if needed and re-encrypt + save.
 * Call this before any HubSpot API call to ensure a fresh token.
 */
export async function refreshTokenIfNeeded(
  userId: string
): Promise<string | null> {
  return getHubSpotAccessToken(userId)
}

/**
 * Store HubSpot tokens for a user.
 */
export async function saveHubSpotTokensForUser(
  userId: string,
  tokens: HubSpotTokens
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens))
  await saveCredential(
    nanoid(),
    userId,
    'hubspot',
    encrypted,
    tokens.expiresAt ?? null
  )
}

/**
 * Check if HubSpot has been connected for a user.
 */
export async function isHubSpotConnected(userId: string): Promise<boolean> {
  const token = await getHubSpotAccessToken(userId)
  return token !== null
}
