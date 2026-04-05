/**
 * GET /api/memory/facts?userId=<userId>
 *   Returns all confirmed + pending facts for the user.
 *
 * POST /api/memory/facts
 *   Body: { userId, factText, sourceRunId? }
 *   Manually adds a fact for Maria to teach the agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth/session';
import {
  getAllFacts,
  getConfirmedFacts,
  getPendingFacts,
  addManualFact,
} from '@/lib/memory/memory-operations';

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') ?? session.userId;
  // Accept both 'type' and 'status' params — 'status=pending' is used by the activity tab
  const type = searchParams.get('type') ?? searchParams.get('status');
  const status = searchParams.get('status');

  // Users can only see their own facts
  if (userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    let facts;
    if (type === 'confirmed') {
      facts = await getConfirmedFacts(userId);
    } else if (type === 'pending') {
      facts = await getPendingFacts(userId);
    } else {
      facts = await getAllFacts(userId);
    }

    return NextResponse.json({ facts });
  } catch (err) {
    console.error('[Memory API] GET /api/memory/facts failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { userId?: string; factText?: string; sourceRunId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const userId = body.userId ?? session.userId;
  const factText = body.factText?.trim();

  if (!factText) {
    return NextResponse.json({ error: 'factText is required' }, { status: 400 });
  }

  if (userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const fact = await addManualFact(userId, factText, body.sourceRunId);
    return NextResponse.json({ fact }, { status: 201 });
  } catch (err) {
    console.error('[Memory API] POST /api/memory/facts failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
