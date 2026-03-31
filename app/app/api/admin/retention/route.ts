/**
 * Admin retention API — allows admins to trigger a retention scan
 * and view retention statistics.
 *
 * GET  /api/admin/retention — returns retention stats
 * POST /api/admin/retention — triggers a retention scan (deletes expired traces)
 *
 * Auth: requires VERCEL_CRON_SECRET header (for cron-triggered calls)
 *       or admin session cookie (for manual admin triggers).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRetentionStats, runRetentionScan, flagTrace, unflagTrace } from '@/lib/tracing/retention-cron'

const CRON_SECRET = process.env.VERCEL_CRON_SECRET

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron calls include the secret header
  if (CRON_SECRET) {
    const cronSecret = req.headers.get('x-vercel-cron-secret')
    if (cronSecret === CRON_SECRET) return true
  }
  // TODO: add admin session check here when auth is wired up
  // For now, deny if no valid cron secret
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await getRetentionStats()
    return NextResponse.json({ stats })
  } catch (err) {
    console.error('[retention] failed to get stats:', err)
    return NextResponse.json({ error: 'Failed to retrieve retention stats' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { action, traceId } = body as { action?: string; traceId?: string }

    // Manual flag/unflag for a specific trace
    if (action === 'flag' && traceId) {
      await flagTrace(traceId)
      const stats = await getRetentionStats()
      return NextResponse.json({ ok: true, action: 'flagged', traceId, stats })
    }

    if (action === 'unflag' && traceId) {
      await unflagTrace(traceId)
      const stats = await getRetentionStats()
      return NextResponse.json({ ok: true, action: 'unflagged', traceId, stats })
    }

    // Default: run the full retention scan
    const result = await runRetentionScan()
    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      stats: result.stats,
    })
  } catch (err) {
    console.error('[retention] scan failed:', err)
    return NextResponse.json({ error: 'Retention scan failed' }, { status: 500 })
  }
}
