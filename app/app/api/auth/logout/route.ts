import { NextResponse } from 'next/server'
import { deleteSessionCookie } from '@/lib/auth/session'

export async function POST() {
  await deleteSessionCookie()
  return NextResponse.json({ success: true })
}
