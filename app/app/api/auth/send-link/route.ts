import { NextRequest, NextResponse } from 'next/server'
import { sendMagicLink } from '@/lib/auth/magic-link'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await sendMagicLink(email, appUrl)

    return NextResponse.json({ success: true, message: 'Check your email for a login link' })
  } catch (err) {
    console.error('send-link error:', err)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}
