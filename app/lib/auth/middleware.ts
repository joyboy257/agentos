import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromCookie } from './session';

// Paths that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth/send-link',
  '/api/auth/verify',
  '/api/auth/logout',
  '/api/health',
];

export async function authMiddleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip auth for public paths
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for /api/* routes that need auth
  if (pathname.startsWith('/api/')) {
    const session = await getSessionFromCookie();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Add userId to request headers for downstream handlers
    const headers = new Headers(request.headers);
    headers.set('x-user-id', session.userId);

    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}
