/**
 * Webhook endpoint for Gmail push notifications.
 *
 * Flow: Cloudflare Worker → POST /api/webhooks/gmail
 *
 * Responsibilities:
 * - Receive Gmail pub/sub push payload
 * - Validate (optional JWT for now)
 * - Enqueue BullMQ job for immediate processing
 * - Return 200 in < 100ms (do NOT process email here)
 *
 * Gmail push body shape (from Cloudflare Worker):
 * {
 *   message: {
 *     data: string,       // base64-encoded JSON of { threadId, from, subject, snippet }
 *     messageId: string,
 *     publishTime: string,
 *   },
 *   subscription: string,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { enqueueGmailPush } from '@/lib/runtime/proactive-queue';

export const runtime = 'nodejs';

interface GmailPushMessage {
  data: string;       // base64-encoded JSON
  messageId: string;
  publishTime: string;
}

interface GmailPushBody {
  message: GmailPushMessage;
  subscription: string;
}

/**
 * Decode the base64-encoded pub/sub message data.
 */
function decodeMessageData(encoded: string): {
  threadId: string;
  from: string;
  subject: string;
  snippet?: string;
} {
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

/**
 * POST /api/webhooks/gmail
 *
 * Cloudflare Worker calls this endpoint after validating the Gmail push.
 * This handler enqueues a BullMQ job and returns immediately.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  let body: GmailPushBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { message } = body;
  if (!message?.data) {
    return NextResponse.json({ error: 'missing_message_data' }, { status: 400 });
  }

  let msgData: { threadId: string; from: string; subject: string; snippet?: string };
  try {
    msgData = decodeMessageData(message.data);
  } catch {
    return NextResponse.json({ error: 'invalid_message_data' }, { status: 400 });
  }

  const { threadId, from, subject, snippet } = msgData;
  const messageId = message.messageId ?? '';

  /**
   * agentId is resolved from the user's active agent.
   * For MVP: use the first active agent for the user.
   * TODO (Phase 2+): multi-agent — route to the correct agent per label/topic.
   *
   * For now, extract agentId from the session or default to system.
   * The worker will resolve the correct agent from the run context.
   */
  const agentId = 'default-agent'; // TODO: resolve from auth/session context
  const userId = 'system';         // TODO: resolve from auth/session context

  try {
    await enqueueGmailPush({
      agentId,
      userId,
      threadId,
      messageId,
      from,
      subject,
      snippet,
    });
  } catch (err) {
    console.error('[Webhook/Gmail] Failed to enqueue gmail_push job:', err);
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  const elapsed = Date.now() - start;
  console.log(`[Webhook/Gmail] Enqueued gmail_push job in ${elapsed}ms — threadId=${threadId}`);

  return NextResponse.json({ ok: true, elapsedMs: elapsed });
}
