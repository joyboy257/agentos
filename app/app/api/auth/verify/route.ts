import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  // In production: validate token from DB, check expiry, delete token (single use)
  // For prototype: accept any token and create a demo session

  // TODO: Validate token against stored tokens in DB
  // const storedToken = await validateMagicLinkToken(token);
  // if (!storedToken) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  // For prototype: extract email from token or use demo
  const userId = `demo-${token.slice(0, 8)}`; // Demo user

  const sessionId = await createSessionToken(userId);

  const response = NextResponse.redirect(new URL('/app', request.url));

  // Set session cookie
  response.cookies.set('session_id', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}
