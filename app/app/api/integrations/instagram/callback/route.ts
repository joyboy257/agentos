/**
 * OAuth callback route — handles Instagram/Meta OAuth redirect.
 * Exchanges code for tokens, encrypts, stores in credentials table,
 * and resolves the Instagram Business Account ID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import {
  exchangeCodeForInstagramTokens,
  getLongLivedInstagramToken,
  getInstagramBusinessAccountId,
} from '@/lib/integrations/instagram/client'
import { saveInstagramTokenForUser } from '@/lib/integrations/instagram'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=instagram_unauthorized', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?error=instagram_denied`, req.url))
  }

  const storedState = req.cookies.get('instagram_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.redirect(new URL('/?error=instagram_state_mismatch', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=instagram_no_code', req.url))
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const redirectUri = `${baseUrl}/api/integrations/instagram/callback`

    // Exchange code for tokens
    let tokens = await exchangeCodeForInstagramTokens(code, redirectUri)

    // Upgrade to long-lived token if short-lived
    if (tokens.accessToken && !tokens.refreshToken) {
      const longLived = await getLongLivedInstagramToken(tokens.accessToken)
      tokens = { ...tokens, ...longLived }
    }

    // Resolve Instagram Business Account ID
    try {
      const instagramBusinessAccountId = await getInstagramBusinessAccountId(tokens.accessToken)
      tokens.instagramBusinessAccountId = instagramBusinessAccountId
    } catch (err) {
      console.error('Instagram callback: could not resolve business account ID:', err)
      // Store token anyway — account resolution can be retried later
    }

    await saveInstagramTokenForUser(session.userId, tokens)

    return NextResponse.redirect(new URL('/?instagram=connected', req.url))
  } catch (err) {
    console.error('Instagram callback error:', err)
    return NextResponse.redirect(new URL('/?error=instagram_callback_failed', req.url))
  }
}
