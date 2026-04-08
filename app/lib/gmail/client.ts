import { gmail } from '@googleapis/gmail'
import { getGmailToken, setGmailToken } from '../db/queries'

export interface GmailClient {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export function createGmailClient(accessToken: string) {
  const gmailClient = gmail({ version: 'v1', auth: accessToken })
  return gmailClient
}

export async function getGmailClientForUser(userId: string): Promise<GmailClient | null> {
  const token = await getGmailToken(userId)

  if (!token) return null

  // Check if token is expired (with 5-min buffer)
  if (token.expires_at && new Date(token.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    // Token expired — in Phase 1, users need to re-authenticate
    // Full refresh flow deferred to Phase 2
    return null
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? undefined,
    expiresAt: token.expires_at ?? undefined,
  }
}

export async function saveGmailTokenForUser(
  userId: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: Date,
  gmailAddress?: string
): Promise<void> {
  await setGmailToken({
    user_id: userId,
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
    expires_at: expiresAt ?? null,
    gmail_address: gmailAddress ?? null,
  })
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
