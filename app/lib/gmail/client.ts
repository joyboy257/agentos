import { gmail } from '@googleapis/gmail'
import { nanoid } from 'nanoid'
import { getCredential, saveCredential } from '../db/queries'
import { decrypt, encrypt } from '../crypto'
import { refreshAccessToken } from './oauth'

export interface GmailClient {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export function createGmailClient(accessToken: string) {
  const gmailClient = gmail({ version: 'v1', auth: accessToken })
  return gmailClient
}

interface StoredGmailTokens {
  access_token: string
  refresh_token?: string
}

export async function getGmailClientForUser(userId: string): Promise<GmailClient | null> {
  const credential = await getCredential(userId, 'gmail')

  if (!credential) return null

  let tokens: StoredGmailTokens
  try {
    tokens = JSON.parse(decrypt(credential.encrypted_token)) as StoredGmailTokens
  } catch {
    return null
  }

  // Check if token is expired (with 5-min buffer)
  if (credential.expires_at && new Date(credential.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    if (!tokens.refresh_token) {
      return null
    }

    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token)
      tokens = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
      }

      const expiresAt = new Date(Date.now() + Number(refreshed.expires_in ?? 3600) * 1000)
      await saveCredential(
        nanoid(),
        userId,
        'gmail',
        encrypt(JSON.stringify(tokens)),
        expiresAt
      )

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      }
    } catch {
      return null
    }
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: credential.expires_at ?? undefined,
  }
}

export async function saveGmailTokenForUser(
  userId: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: Date,
  gmailAddress?: string
): Promise<void> {
  await saveCredential(
    nanoid(),
    userId,
    'gmail',
    encrypt(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        gmail_address: gmailAddress,
      })
    ),
    expiresAt ?? null
  )
}

export async function listEmails(accessToken: string, query: string = 'is:unread newer_than:1d') {
  const gmail = createGmailClient(accessToken)

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20,
  })

  const messages = res.data.messages || []

  const emails = await Promise.all(
    messages.slice(0, 10).map(async (msg: any) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      })

      const headers = detail.data.payload?.headers || []
      const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || ''

      return {
        id: msg.id,
        from: getHeader('From'),
        subject: getHeader('Subject'),
        snippet: detail.data.snippet || '',
        date: getHeader('Date'),
      }
    })
  )

  return { emails }
}

export async function sendEmail(accessToken: string, to: string, subject: string, body: string) {
  const gmail = createGmailClient(accessToken)

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`
  ).toString('base64url')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return { sent: true, messageId: res.data.id }
}
