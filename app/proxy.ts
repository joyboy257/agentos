import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth/send-link',
  '/api/auth/verify',
  '/api/auth/logout',
  '/api/health',
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip auth for public paths
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check session for protected routes
  if (pathname.startsWith('/api/')) {
    const cookieStore = await import('next/headers').then(m => m.cookies());
    const sessionId = cookieStore.get('session_id')?.value;

    if (!sessionId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Add userId to request headers
    const headers = new Headers(request.headers);
    headers.set('x-user-id', sessionId); // Session ID is the user identifier

    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
