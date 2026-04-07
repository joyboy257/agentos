/**
 * OAuth callback route — handles QuickBooks OAuth redirect.
 * Exchanges code for tokens, encrypts, and stores in credentials table.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { exchangeCodeForQuickBooksTokens } from '@/lib/integrations/quickbooks/client'
import { saveQuickBooksTokensForUser } from '@/lib/integrations/quickbooks'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')
  const realmId = req.nextUrl.searchParams.get('realmId') ?? undefined

  if (error) {
    return NextResponse.redirect(new URL(`/?error=quickbooks_denied`, req.url))
  }

  const storedState = req.cookies.get('quickbooks_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.redirect(new URL('/?error=quickbooks_state_mismatch', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=quickbooks_no_code', req.url))
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
    const redirectUri = `${baseUrl}/api/integrations/quickbooks/callback`
    const tokens = await exchangeCodeForQuickBooksTokens(code, redirectUri)

    // Include realmId if present
    if (realmId && !tokens.realmId) {
      tokens.realmId = realmId
    }

    await saveQuickBooksTokensForUser(session.userId, tokens)

    return NextResponse.redirect(new URL('/?quickbooks=connected', req.url))
  } catch (err) {
    console.error('QuickBooks callback error:', err)
    return NextResponse.redirect(new URL('/?error=quickbooks_callback_failed', req.url))
  }
}