import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/middleware-helpers'

const HUBSPOT_AUTH_URL = 'https://app.hubspot.com/oauth/authorize'
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID

const SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.deals.read',
].join(' ')

export async function GET(request: NextRequest) {
  const userId = await getUserId(request)

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connectors/hubspot/callback`
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url')

  const params = new URLSearchParams({
    client_id: HUBSPOT_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: 'code',
    state,
  })

  const authUrl = `${HUBSPOT_AUTH_URL}?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
