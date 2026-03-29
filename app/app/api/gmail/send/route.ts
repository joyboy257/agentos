import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getCredential } from '@/lib/db/queries'
import { decrypt } from '@/lib/crypto'
import { refreshAccessToken } from '@/lib/gmail/oauth'
import { sendEmail } from '@/lib/gmail/client'

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const credential = await getCredential(session.user_id, 'gmail')
  if (!credential) {
    return NextResponse.json({ error: true, message: 'Gmail not connected.' }, { status: 400 })
  }

  try {
    let tokens = JSON.parse(decrypt(credential.encrypted_token))

    if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
      const refreshed = await refreshAccessToken(tokens.refresh_token)
      tokens.access_token = refreshed.access_token
    }

    const { to, subject, body } = await req.json()
    const result = await sendEmail(tokens.access_token, to, subject, body)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Gmail send error:', err)
    return NextResponse.json({
      error: true,
      message: 'Gmail access expired. Please reconnect.'
    }, { status: 401 })
  }
}
