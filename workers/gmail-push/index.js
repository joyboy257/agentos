/**
 * Gmail Push Cloudflare Worker
 *
 * Receives Gmail push notifications via Google Cloud Pub/Sub,
 * validates the subscription, and forwards the message to the
 * AgentOS Next.js webhook endpoint for BullMQ enqueueing.
 *
 * Deployment: `wrangler deploy`
 * Environment variables:
 *   GOOGLE_PUBSUB_VERIFICATION_TOKEN — token configured in Gmail push subscription
 *   AGENTOS_WEBHOOK_URL            — full URL to https://<your-app>.vercel.app/api/webhooks/gmail
 */

const VERIFICATION_TOKEN = GOOGLE_PUBSUB_VERIFICATION_TOKEN;
const AGENTOS_WEBHOOK_URL = AGENTOS_WEBHOOK_URL;

/**
 * Handle incoming Gmail push notification.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    // Handle Google Pub/Sub verification challenge
    if (request.method === 'GET' && request.url.includes('token=')) {
      const token = new URL(request.url).searchParams.get('token');
      if (token === VERIFICATION_TOKEN) {
        return new Response(token, { status: 200 });
      }
      return new Response('invalid_verification_token', { status: 403 });
    }

    if (request.method !== 'POST') {
      return new Response('method_not_allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('invalid_json', { status: 400 });
    }

    const message = body?.message;
    if (!message) {
      return new Response('missing_message', { status: 400 });
    }

    // Decode base64 message data
    let msgData;
    try {
      msgData = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));
    } catch {
      return new Response('invalid_message_data', { status: 400 });
    }

    // Forward to AgentOS webhook endpoint — fire and forget
    // Do NOT await processing; just confirm receipt
    const agentosPayload = {
      message: {
        data: message.data,
        messageId: message.messageId,
        publishTime: message.publishTime,
      },
      subscription: body.subscription,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(AGENTOS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentosPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[GmailPush] AgentOS webhook returned ${response.status}`);
        // Still return 200 to acknowledge receipt — pub/sub will retry on 5xx
        return new Response(JSON.stringify({ ok: false, status: response.status }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error(`[GmailPush] Failed to forward to AgentOS:`, err);
      // Return 200 to prevent pub/sub from spamming retries
      // The worker is unreachable — Gmail will backoff and retry
      return new Response(JSON.stringify({ ok: false, error: 'forward_failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
