/**
 * GDPR Retention Cron — enforces 30-day standard / 90-day flagged retention.
 *
 * Nightly job that deletes reasoning traces past their retention window.
 * Batch deletion (1000 rows per iteration) with cursor pagination by expires_at
 * to avoid long-running transactions.
 *
 * Required by: R8 (GDPR retention enforcement)
 */

import { sql } from '@vercel/postgres'
import {
  deleteTrace,
  FLAGGED_RETENTION_DAYS,
  STANDARD_RETENTION_DAYS,
} from './trace-store'

const BATCH_SIZE = 1000

export interface RetentionStats {
  total: number
  expired: number
  expiringWithin7Days: number
  standardTier: number
  flaggedTier: number
}

/**
 * Delete all traces that have passed their expires_at timestamp.
 * Runs in batches of BATCH_SIZE to avoid holding long-running transactions.
 *
 * Returns the total number of traces deleted.
 */
export async function deleteExpiredTraces(): Promise<number> {
  let totalDeleted = 0

  while (true) {
    // Query a batch of expired traces ordered by expires_at
    const query = await sql`
      SELECT id
      FROM reasoning_traces
      WHERE expires_at < CURRENT_TIMESTAMP
      ORDER BY expires_at ASC
      LIMIT ${BATCH_SIZE}
    `

    const rows = query.rows
    if (rows.length === 0) break

    // Delete each trace individually so deleteTrace hook/logic fires
    for (const row of rows) {
      await deleteTrace(row.id)
      totalDeleted++
    }

    // If fewer rows than batch size, we're done
    if (rows.length < BATCH_SIZE) break
  }

  return totalDeleted
}

/**
 * Flag a trace, extending its retention to 90 days from now.
 * If already flagged, this is a no-op.
 */
export async function flagTrace(id: string): Promise<void> {
  await sql`
    UPDATE reasoning_traces
    SET flagged = true,
        retention_days = ${FLAGGED_RETENTION_DAYS},
        expires_at = CURRENT_TIMESTAMP + INTERVAL '1 day' * ${FLAGGED_RETENTION_DAYS}
    WHERE id = ${id}
  `
}

/**
 * Unflag a trace, shortening its retention to 30 days from now.
 * If not flagged, this is a no-op.
 * Note: Removing a flag means the trace reverts to standard 30-day retention
 * calculated from *now*, not from the original created_at.
 */
export async function unflagTrace(id: string): Promise<void> {
  await sql`
    UPDATE reasoning_traces
    SET flagged = false,
        retention_days = ${STANDARD_RETENTION_DAYS},
        expires_at = CURRENT_TIMESTAMP + INTERVAL '1 day' * ${STANDARD_RETENTION_DAYS}
    WHERE id = ${id}
  `
}

/**
 * Get retention statistics for the admin dashboard.
 * Returns counts across all retention tiers.
 */
export async function getRetentionStats(): Promise<RetentionStats> {
  const [
    totalResult,
    expiredResult,
    expiringResult,
    standardResult,
    flaggedResult,
  ] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM reasoning_traces`,
    sql`SELECT COUNT(*) as count FROM reasoning_traces WHERE expires_at < CURRENT_TIMESTAMP`,
    sql`SELECT COUNT(*) as count FROM reasoning_traces WHERE expires_at >= CURRENT_TIMESTAMP AND expires_at <= CURRENT_TIMESTAMP + INTERVAL '7 days'`,
    sql`SELECT COUNT(*) as count FROM reasoning_traces WHERE flagged = false`,
    sql`SELECT COUNT(*) as count FROM reasoning_traces WHERE flagged = true`,
  ])

  return {
    total: Number(totalResult.rows[0].count),
    expired: Number(expiredResult.rows[0].count),
    expiringWithin7Days: Number(expiringResult.rows[0].count),
    standardTier: Number(standardResult.rows[0].count),
    flaggedTier: Number(flaggedResult.rows[0].count),
  }
}

/**
 * Run the nightly retention scan.
 * Called by the Vercel Cron route or manually via admin API.
 */
export async function runRetentionScan(): Promise<{
  deleted: number
  stats: RetentionStats
}> {
  const deleted = await deleteExpiredTraces()
  const stats = await getRetentionStats()
  return { deleted, stats }
}
