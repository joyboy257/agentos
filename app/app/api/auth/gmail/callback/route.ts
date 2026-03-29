import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie, createSessionForUser } from '@/lib/auth/session'
import { exchangeCodeForTokens } from '@/lib/gmail/oauth'
import { encrypt } from '@/lib/crypto'
import { saveCredential } from '@/lib/db/queries'
import { nanoid } from 'nanoid'

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.redirect(new URL('/login?error=gmail_unauthorized', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/?error=gmail_denied`, req.url))
  }

  const storedState = req.cookies.get('gmail_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.redirect(new URL('/?error=gmail_state_mismatch', req.url))
  }

  try {
    const tokens = await exchangeCodeForTokens(code!)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    const encryptedTokens = encrypt(JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    }))

    await saveCredential(
      nanoid(),
      session.user_id,
      'gmail',
      encryptedTokens,
      expiresAt
    )

    return NextResponse.redirect(new URL('/?gmail=connected', req.url))
  } catch (err) {
    console.error('Gmail callback error:', err)
    return NextResponse.redirect(new URL('/?error=gmail_callback_failed', req.url))
  }
}
