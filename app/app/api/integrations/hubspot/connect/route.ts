/**
 * OAuth connect route — initiates HubSpot OAuth flow.
 * Redirects the user to HubSpot's authorization page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { randomBytes } from 'crypto'

const HUBSPOT_AUTH_URL = 'https://app.hubspot.com/oauth/authorize'
const HUBSPOT_SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.companies.read',
  'crm.objects.companies.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.objects.tickets.read',
  'crm.objects.tickets.write',
  'crm.objects.notes.write',
].join(' ')

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', req.url))
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const redirectUri = `${baseUrl}/api/integrations/hubspot/callback`
  const state = randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: HUBSPOT_SCOPES,
    response_type: 'code',
    state,
  })

  const authUrl = `${HUBSPOT_AUTH_URL}?${params.toString()}`

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('hubspot_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
