import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=no_token', req.url))
  }

  // Delegate to BetterAuth's magic link verification endpoint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const response = await fetch(`${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', req.url))
  }

  return NextResponse.redirect(new URL('/', req.url))
}
