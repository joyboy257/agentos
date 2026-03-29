import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (
    pathname.startsWith('/app/login') ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/'
  ) {
    return NextResponse.next()
  }

  const session = await getSessionFromCookie()
  if (!session) {
    const loginUrl = new URL('/app/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
