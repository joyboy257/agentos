import { NextRequest, NextResponse } from 'next/server'
import { getGmailClientForUser } from '@/lib/gmail/client'
import { getUserId } from '@/lib/auth/middleware-helpers'

export async function GET(request: NextRequest) {
  const userId = await getUserId(request)

  const gmailClient = await getGmailClientForUser(userId)

  return NextResponse.json({
    connected: gmailClient !== null,
    expiresAt: gmailClient?.expiresAt ?? null,
  })
}
