/**
 * OAuth connect route — initiates QuickBooks OAuth flow.
 * Redirects the user to Intuit's authorization page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { randomBytes } from 'crypto'

const QUICKBOOKS_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', req.url))
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const redirectUri = `${baseUrl}/api/integrations/quickbooks/callback`
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: 'com.intuit.quickbooks.accounting',
    response_type: 'code',
    state,
  })

  const authUrl = `${QUICKBOOKS_AUTH_URL}?${params.toString()}`

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('quickbooks_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}