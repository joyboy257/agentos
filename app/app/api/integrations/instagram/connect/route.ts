/**
 * OAuth connect route — initiates Instagram/Meta OAuth flow.
 * Redirects the user to Meta's authorization page.
 *
 * Required scopes:
 *   instagram_basic, instagram_content_publish, pages_read_engagement
 *
 * Note: Instagram OAuth requires a Facebook Developer App with:
 *   - Instagram Basic Display or Instagram Graph API product
 *   - A Facebook Page linked to an Instagram Business account
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { randomBytes } from 'crypto'

const INSTAGRAM_AUTH_URL = 'https://www.instagram.com/oauth/authorize'

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_read_engagement',
].join(' ')

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=instagram_unauthorized', req.url))
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const redirectUri = `${baseUrl}/api/integrations/instagram/callback`
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: INSTAGRAM_SCOPES,
    response_type: 'code',
    state,
  })

  const authUrl = `${INSTAGRAM_AUTH_URL}?${params.toString()}`

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('instagram_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
