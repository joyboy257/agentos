import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { nanoid } from 'nanoid'

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID
const SLACK_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/connectors/slack/callback`

const SLACK_SCOPES = 'chat:write,channels:read'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=slack_unauthorized', req.url))
  }

  const state = nanoid()

  const authUrl = new URL('https://slack.com/oauth/v2/authorize')
  authUrl.searchParams.set('client_id', SLACK_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', SLACK_REDIRECT_URI)
  authUrl.searchParams.set('scope', SLACK_SCOPES)
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('slack_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })

  return response
}
