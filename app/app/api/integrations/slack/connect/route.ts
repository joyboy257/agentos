/**
 * Slack OAuth connect endpoint.
 * Generates state token and redirects to Slack authorization.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { buildSlackAuthUrl } from '@/lib/integrations/slack'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=slack_unauthorized', req.url))
  }

  // Generate state token for CSRF protection
  const state = crypto.randomUUID()
  const response = NextResponse.redirect(
    new URL(buildSlackAuthUrl(state), req.url),
    { status: 302 }
  )

  // Store state in cookie for verification in callback
  response.cookies.set('slack_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })

  return response
}
