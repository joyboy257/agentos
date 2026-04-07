/**
 * Slack OAuth callback — exchanges code for tokens and stores encrypted bot token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { exchangeCodeForSlackTokens, saveSlackTokenForUser } from '@/lib/integrations/slack'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=slack_unauthorized', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    console.warn(`[slack] OAuth error: ${error}`)
    return NextResponse.redirect(new URL(`/?error=slack_denied`, req.url))
  }

  const storedState = req.cookies.get('slack_oauth_state')?.value
  if (state !== storedState) {
    console.warn('[slack] state mismatch')
    return NextResponse.redirect(new URL('/?error=slack_state_mismatch', req.url))
  }

  try {
    const tokens = await exchangeCodeForSlackTokens(code!)
    await saveSlackTokenForUser(session.userId, tokens)

    return NextResponse.redirect(new URL('/?slack=connected', req.url))
  } catch (err) {
    console.error('[slack] callback error:', err)
    return NextResponse.redirect(new URL('/?error=slack_callback_failed', req.url))
  }
}
