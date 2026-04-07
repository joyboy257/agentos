import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { nanoid } from 'nanoid'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const BASE_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback`

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=calendar_unauthorized', req.url))
  }

  const state = nanoid(16)
  const redirectUri = BASE_REDIRECT_URI

  // Store state in a cookie for verification
  const response = NextResponse.redirect(
    new URL(
      `${GOOGLE_AUTH_URL}?${new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: CALENDAR_SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString()}`,
      req.url
    )
  )

  response.cookies.set('calendar_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}