import { getCredential } from '@/lib/db/queries'
import { decrypt } from '@/lib/crypto'
import { refreshAccessToken } from '@/lib/gmail/oauth'
import { listEmails, sendEmail } from '@/lib/gmail/client'

export async function gmailReadTool(query: string = 'is:unread newer_than:1d', userId: string) {
  const credential = await getCredential(userId, 'gmail')
  if (!credential) {
    return { error: true, message: 'Gmail not connected' }
  }

  try {
    let tokens = JSON.parse(decrypt(credential.encrypted_token))

    if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
      const refreshed = await refreshAccessToken(tokens.refresh_token)
      tokens.access_token = refreshed.access_token
    }

    return await listEmails(tokens.access_token, query)
  } catch (err) {
    return { error: true, message: 'Gmail read failed' }
  }
}

export async function gmailSendTool(to: string, subject: string, body: string, userId: string) {
  const credential = await getCredential(userId, 'gmail')
  if (!credential) {
    return { error: true, message: 'Gmail not connected' }
  }

  try {
    let tokens = JSON.parse(decrypt(credential.encrypted_token))

    if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
      const refreshed = await refreshAccessToken(tokens.refresh_token)
      tokens.access_token = refreshed.access_token
    }

    return await sendEmail(tokens.access_token, to, subject, body)
  } catch (err) {
    return { error: true, message: 'Gmail send failed' }
  }
}
