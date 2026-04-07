import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { encrypt } from '@/lib/crypto'
import { saveCredential } from '@/lib/db/queries'
import { nanoid } from 'nanoid'

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET
const SLACK_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/connectors/slack/callback`

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=slack_unauthorized', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?error=slack_denied`, req.url))
  }

  const storedState = req.cookies.get('slack_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.redirect(new URL('/?error=slack_state_mismatch', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=slack_no_code', req.url))
  }

  try {
    // Exchange code for bot token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID!,
        client_secret: SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error(`Slack token exchange failed: ${tokenResponse.status}`)
    }

    const tokenData = await tokenResponse.json()

    if (!tokenData.ok) {
      throw new Error(`Slack API error: ${tokenData.error}`)
    }

    // Bot token expires when the workspace revokes it (no expiry for user tokens)
    // Slack doesn't provide an expires_in for bot tokens, so we set a far-future date
    const expiresAt = new Date('2030-01-01T00:00:00Z')

    const encryptedToken = encrypt(JSON.stringify({
      access_token: tokenData.access_token,
      bot_user_id: tokenData.authed_user?.id ?? null,
      team_id: tokenData.team?.id ?? null,
      team_name: tokenData.team?.name ?? null,
    }))

    await saveCredential(
      nanoid(),
      session.userId,
      'slack',
      encryptedToken,
      expiresAt
    )

    return NextResponse.redirect(new URL('/?slack=connected', req.url))
  } catch (err) {
    console.error('Slack callback error:', err)
    return NextResponse.redirect(new URL('/?error=slack_callback_failed', req.url))
  }
}
