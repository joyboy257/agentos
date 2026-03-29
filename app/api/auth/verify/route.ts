import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLink } from '@/lib/auth/magic-link'
import { createSessionForUser } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=no_token', req.url))
  }

  const user = await verifyMagicLink(token)
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', req.url))
  }

  await createSessionForUser(user.id)

  return NextResponse.redirect(new URL('/', req.url))
}
