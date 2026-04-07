/**
 * Instagram Integration — credential helpers and OAuth utilities.
 * Uses the generic `credentials` table with provider = 'instagram'.
 */

import { getCredential, saveCredential } from '@/lib/db/queries'
import { encrypt, decrypt } from '@/lib/crypto'
import { nanoid } from 'nanoid'
import type { InstagramTokens } from './types'
import { refreshInstagramAccessToken } from './client'

const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

/**
 * Get decrypted Instagram tokens for a user.
 */
export async function getInstagramToken(
  userId: string
): Promise<InstagramTokens | null> {
  const cred = await getCredential(userId, 'instagram')
  if (!cred) return null

  try {
    return JSON.parse(decrypt(cred.encrypted_token))
  } catch {
    return null
  }
}

/**
 * Get a valid Instagram access token for a user.
 * Proactively refreshes if within TOKEN_REFRESH_BUFFER_MS of expiry.
 */
export async function getInstagramAccessToken(
  userId: string
): Promise<string | null> {
  const cred = await getCredential(userId, 'instagram')
  if (!cred) return null

  let tokens: InstagramTokens
  try {
    tokens = JSON.parse(decrypt(cred.encrypted_token))
  } catch {
    return null
  }

  if (
    tokens.expiresAt &&
    new Date(tokens.expiresAt).getTime() < Date.now() + TOKEN_REFRESH_BUFFER_MS
  ) {
    try {
      tokens = await refreshInstagramAccessToken(tokens.accessToken)
      const encrypted = encrypt(JSON.stringify(tokens))
      await saveCredential(
        cred.id,
        userId,
        'instagram',
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
 * Store Instagram tokens for a user.
 */
export async function saveInstagramTokenForUser(
  userId: string,
  tokens: InstagramTokens
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens))
  await saveCredential(
    nanoid(),
    userId,
    'instagram',
    encrypted,
    tokens.expiresAt ?? null
  )
}

/**
 * Check if Instagram has been connected for a user.
 */
export async function isInstagramConnected(userId: string): Promise<boolean> {
  const token = await getInstagramAccessToken(userId)
  return token !== null
}

/**
 * Get Instagram tokens + business account ID.
 */
export async function getInstagramTokenWithAccount(
  userId: string
): Promise<{ accessToken: string; instagramBusinessAccountId: string } | null> {
  const cred = await getCredential(userId, 'instagram')
  if (!cred) return null

  let tokens: InstagramTokens
  try {
    tokens = JSON.parse(decrypt(cred.encrypted_token))
  } catch {
    return null
  }

  if (!tokens.instagramBusinessAccountId) return null
  return {
    accessToken: tokens.accessToken,
    instagramBusinessAccountId: tokens.instagramBusinessAccountId,
  }
}
