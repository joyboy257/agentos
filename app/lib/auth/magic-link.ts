import { createHash } from 'crypto'
import { nanoid } from 'nanoid'
import { getUserByEmail, createUser, createMagicLinkToken, getMagicLinkToken, markMagicLinkUsed } from '@/lib/db/queries'
import { Resend } from 'resend'

const TOKEN_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function sendMagicLink(email: string, appUrl: string) {
  const resend = new Resend(process.env.RESEND_API_KEY)

  // Find or create user
  let user = await getUserByEmail(email)
  if (!user) {
    await createUser(nanoid(), email)
    user = await getUserByEmail(email)
  }

  // Generate token
  const token = nanoid(32)
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS)

  await createMagicLinkToken(tokenHash, user.id, expiresAt)

  const verifyUrl = `${appUrl}/api/auth/verify?token=${token}`

  if (process.env.RESEND_API_KEY) {
    await resend.emails.send({
      from: 'AgentOS <noreply@agentos.ai>',
      to: email,
      subject: 'Your AgentOS login link',
      html: `Click to sign in: <a href="${verifyUrl}">${verifyUrl}</a>. This link expires in 15 minutes.`,
    })
  } else {
    // Dev mode: log the token
    console.log(`[DEV] Magic link for ${email}: ${verifyUrl}`)
  }
}

export async function verifyMagicLink(token: string) {
  const tokenHash = hashToken(token)
  const record = await getMagicLinkToken(tokenHash)
  if (!record) return null

  await markMagicLinkUsed(tokenHash)
  return { id: record.user_id, email: record.email }
}
