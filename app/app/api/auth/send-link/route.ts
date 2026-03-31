import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Generate magic link token (simplified — in production, store token in DB)
  const token = crypto.randomUUID();
  const magicLinkUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;

  // Send email via Resend
  await resend.emails.send({
    from: 'AgentOS <noreply@agentos.dev>',
    to: email,
    subject: 'Your AgentOS Magic Link',
    html: `
      <p>Click the link below to sign in to AgentOS:</p>
      <a href="${magicLinkUrl}">${magicLinkUrl}</a>
      <p>This link expires in 15 minutes.</p>
    `,
  });

  // In production: store token in DB with expiry (skipped for prototype)

  return NextResponse.json({ success: true });
}
