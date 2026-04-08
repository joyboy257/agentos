import { NextRequest, NextResponse } from 'next/server'
import { saveGmailTokenForUser } from '@/lib/gmail/client'
import { exchangeCodeForTokens } from '@/lib/gmail/oauth'
import { getUserId } from '@/lib/auth/middleware-helpers'

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`

export async function GET(request: NextRequest) {
  const userId = await getUserId(request)

  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    // Redirect to Google OAuth
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID!)
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    return NextResponse.redirect(authUrl.toString())
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  })

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: 'Failed to exchange code for tokens' }, { status: 500 })
  }

  const tokens = await tokenResponse.json()

  // Extract the user's Gmail address from their profile so we can route
  // incoming push notifications to the right account.
  let gmailAddress: string | undefined
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (profileRes.ok) {
      const profile = await profileRes.json()
      gmailAddress = profile.email
    }
  } catch {
    // Non-fatal — we can still store the token without the Gmail address
  }

  await saveGmailTokenForUser(
    userId,
    tokens.access_token,
    tokens.refresh_token,
    new Date(Date.now() + tokens.expires_in * 1000),
    gmailAddress
  )

  return NextResponse.redirect(new URL('/app?gmail=connected', request.url))
}
