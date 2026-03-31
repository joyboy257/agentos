import { NextRequest, NextResponse } from 'next/server'
import { getGmailClientForUser } from '@/lib/gmail/client'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const gmailClient = await getGmailClientForUser(userId)

  return NextResponse.json({
    connected: gmailClient !== null,
    expiresAt: gmailClient?.expiresAt ?? null,
  })
}
