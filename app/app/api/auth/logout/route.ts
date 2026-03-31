import { NextRequest, NextResponse } from 'next/server';
import { deleteSessionToken } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const cookieStore = await import('next/headers').then(m => m.cookies());
  const sessionId = cookieStore.get('session_id')?.value;

  if (sessionId) {
    await deleteSessionToken(sessionId);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('session_id');

  return response;
}
