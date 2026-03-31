import { getGmailClientForUser } from '../../gmail/client'
import { listEmails, sendEmail } from '@/lib/gmail/client'

export async function gmailReadTool(userId: string, args: { query?: string; maxResults?: number }) {
  const gmailClient = await getGmailClientForUser(userId)

  if (!gmailClient) {
    return {
      success: false,
      error: 'Gmail not connected. Please connect your Gmail account.',
      code: 'GMAIL_NOT_CONNECTED',
    }
  }

  try {
    const result = await listEmails(gmailClient.accessToken, args.query ?? 'is:unread newer_than:1d')
    return {
      success: true,
      data: {
        emails: result.emails,
        total: result.emails.length,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: 'Failed to read Gmail',
      code: 'GMAIL_API_ERROR',
    }
  }
}

export async function gmailSendTool(
  userId: string,
  args: { to: string; subject: string; body: string; cc?: string }
) {
  const gmailClient = await getGmailClientForUser(userId)

  if (!gmailClient) {
    return {
      success: false,
      error: 'Gmail not connected. Please connect your Gmail account.',
      code: 'GMAIL_NOT_CONNECTED',
    }
  }

  try {
    const result = await sendEmail(gmailClient.accessToken, args.to, args.subject, args.body)
    return {
      success: true,
      data: {
        messageId: result.messageId,
        to: args.to,
        subject: args.subject,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: 'Failed to send email',
      code: 'GMAIL_API_ERROR',
    }
  }
}
