import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { exchangeCodeForGoogleCalendarTokens, saveGoogleCalendarTokensForUser } from '@/lib/integrations/google-calendar/client'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback`

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=calendar_unauthorized', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?error=calendar_denied`, req.url))
  }

  const storedState = req.cookies.get('calendar_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.redirect(new URL('/?error=calendar_state_mismatch', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=calendar_no_code', req.url))
  }

  try {
    const tokens = await exchangeCodeForGoogleCalendarTokens(code, REDIRECT_URI)
    await saveGoogleCalendarTokensForUser(session.userId, tokens)

    return NextResponse.redirect(new URL('/?calendar=connected', req.url))
  } catch (err) {
    console.error('Google Calendar callback error:', err)
    return NextResponse.redirect(new URL('/?error=calendar_callback_failed', req.url))
  }
}