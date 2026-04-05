import { betterAuth } from 'better-auth'

async function sendEmail({ email, url }: { email: string; url: string }) {
  if (!process.env.RESEND_API_KEY) {
    // Dev mode: log the URL instead of sending email
    console.log(`[DEV] Magic link for ${email}: ${url}`)
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'AgentOS <noreply@agentos.ai>',
    to: email,
    subject: 'Your AgentOS login link',
    html: `Click to sign in: <a href="${url}">${url}</a>. This link expires in 15 minutes.`,
  })
}

export const auth = betterAuth({
  database: {
    type: 'postgres',
    connection: {
      url: process.env.POSTGRES_URL!,
    },
  },
  emailAndPassword: {
    enabled: false,
  },
  magicLink: {
    enabled: true,
    sendMagicLink: sendEmail,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
})

export type Session = typeof auth.$Infer.Session.session
export type User = typeof auth.$Infer.Session.user
