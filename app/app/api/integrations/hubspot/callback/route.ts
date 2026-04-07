/**
 * OAuth callback route — handles HubSpot OAuth redirect.
 * Exchanges code for tokens, encrypts, and stores in credentials table.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { exchangeCodeForHubSpotTokens } from '@/lib/connectors/hubspot/client'
import { saveHubSpotTokensForUser } from '@/lib/integrations/hubspot'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?error=hubspot_denied`, req.url))
  }

  const storedState = req.cookies.get('hubspot_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.redirect(new URL('/?error=hubspot_state_mismatch', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=hubspot_no_code', req.url))
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const redirectUri = `${baseUrl}/api/integrations/hubspot/callback`
    const tokens = await exchangeCodeForHubSpotTokens(code, redirectUri)

    await saveHubSpotTokensForUser(session.userId, tokens)

    return NextResponse.redirect(new URL('/?hubspot=connected', req.url))
  } catch (err) {
    console.error('HubSpot callback error:', err)
    return NextResponse.redirect(new URL('/?error=hubspot_callback_failed', req.url))
  }
}
