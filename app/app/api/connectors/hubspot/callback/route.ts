import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForHubSpotTokens, saveHubSpotTokensForUser } from '@/lib/connectors/hubspot/client'
import { getUserId } from '@/lib/auth/middleware-helpers'

export async function GET(request: NextRequest) {
  const userId = await getUserId(request)
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connectors/hubspot/callback`

  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=hubspot_denied&message=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=hubspot_no_code', request.url))
  }

  try {
    const tokens = await exchangeCodeForHubSpotTokens(code, redirectUri)
    await saveHubSpotTokensForUser(userId, tokens)
    return NextResponse.redirect(new URL('/?hubspot=connected', request.url))
  } catch (err) {
    console.error('HubSpot OAuth callback error:', err)
    return NextResponse.redirect(
      new URL('/?error=hubspot_callback_failed', request.url)
    )
  }
}
