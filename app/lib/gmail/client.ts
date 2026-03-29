import { gmail } from '@googleapis/gmail'

export function createGmailClient(accessToken: string) {
  const gmailClient = gmail({ version: 'v1', auth: accessToken })
  return gmailClient
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
