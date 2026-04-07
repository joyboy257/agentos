/**
 * Twilio Client — wraps Twilio REST API for SMS notifications.
 * Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER env vars.
 */

import { withRetry, DEFAULT_RETRY_CONFIG, getRetryBudget } from '@/lib/middleware/with-retry'
import type { TwilioSmsResult } from './types'

// ---------------------------------------------------------------------------
// Twilio credentials from env
// ---------------------------------------------------------------------------

function getTwilioCredentials(): { accountSid: string; authToken: string; fromNumber: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    throw Object.assign(
      new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set'),
      { code: 'UNAUTHORIZED' }
    )
  }

  return { accountSid, authToken, fromNumber }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function twilioFetch(
  path: string,
  params?: Record<string, string>
): Promise<Response> {
  const { accountSid, authToken } = getTwilioCredentials()
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`)

  const body = params
    ? new URLSearchParams(params).toString()
    : undefined

  return fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(30_000),
  })
}

// ---------------------------------------------------------------------------
// sendSms — send an SMS message to a phone number
// ---------------------------------------------------------------------------

export async function sendSms(to: string, body: string): Promise<TwilioSmsResult> {
  const { fromNumber } = getTwilioCredentials()
  const budget = getRetryBudget('twilio', 1)

  const result = await executeWithRetry(
    async () => {
      const response = await twilioFetch('/Messages.json', {
        To: to,
        From: fromNumber,
        Body: body,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw Object.assign(
          new Error(`Twilio API error ${response.status}: ${JSON.stringify(errorData)}`),
          { status: response.status, body: errorData }
        )
      }

      const data = await response.json()
      return {
        success: true,
        sid: data.sid,
        status: data.status,
        to: data.to,
      }
    },
    budget,
    (err: any) => err?.status === 429 || (err?.status >= 500 && err?.status < 600)
  )

  return result
}

// ---------------------------------------------------------------------------
// sendSmsToUser — send an SMS to a user by their userId
// Uses the user's phone number stored in credentials
// ---------------------------------------------------------------------------

export async function sendSmsToUser(
  userId: string,
  body: string
): Promise<TwilioSmsResult> {
  // Look up the user's phone number from credentials
  const { getCredential } = await import('@/lib/db/queries')
  const { decrypt } = await import('@/lib/crypto')

  const cred = await getCredential(userId, 'twilio')
  if (!cred) {
    // Try NEXT_PUBLIC_ADMIN_PHONE as fallback
    const adminPhone = process.env.NEXT_PUBLIC_ADMIN_PHONE
    if (!adminPhone) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        errorMessage: 'Twilio not connected for this user and NEXT_PUBLIC_ADMIN_PHONE not set',
      }
    }
    return sendSms(adminPhone, body)
  }

  try {
    const decrypted = decrypt(cred.encrypted_token)
    const payload = JSON.parse(decrypted)
    const phoneNumber = payload.phoneNumber as string
    return sendSms(phoneNumber, body)
  } catch {
    return {
      success: false,
      errorCode: 'DECRYPT_ERROR',
      errorMessage: 'Failed to decrypt Twilio credentials',
    }
  }
}

// ---------------------------------------------------------------------------
// Internal retry helper
// ---------------------------------------------------------------------------

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  budget: ReturnType<typeof getRetryBudget>,
  isRetryable?: (err: any) => boolean
): Promise<T> {
  return withRetry(fn, DEFAULT_RETRY_CONFIG, (err: any) => {
    if (isRetryable) return isRetryable(err)
    const status = err?.status ?? err?.response?.status
    return status === 429 || (status >= 500 && status < 600)
  }, budget)
}
