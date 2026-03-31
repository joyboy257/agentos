/**
 * Trace persistence layer — stores reasoning traces in the database.
 *
 * Implements: saveTrace(), getTrace(), listTraces(), deleteTrace()
 *
 * Schema: reasoning_traces
 *   id          — ULID primary key
 *   run_id      — references runs(id)
 *   agent_id    — agent that produced the trace
 *   events      — JSON array of ReasoningEvent
 *   retention_days — 30 standard, 90 if flagged
 *   flagged     — true if trace contains warnings/errors (gets extended retention)
 *   created_at  — when trace was created
 *   expires_at  — created_at + retention_days (for efficient GDPR queries)
 *
 * Required by:
 * - Cursor-based SSE reconnection (read persisted events on reconnect)
 * - Unit 7 GDPR cron (query traces where expires_at < NOW())
 */

import { sql } from '@vercel/postgres'
import { ReasoningEvent } from './event-schema'

export interface TraceRecord {
  id: string
  runId: string
  agentId: string
  events: ReasoningEvent[]
  retentionDays: number
  flagged: boolean
  createdAt: Date
  expiresAt: Date
}

export interface SaveTraceOptions {
  id: string
  runId: string
  agentId: string
  events: ReasoningEvent[]
  flagged?: boolean
}

/**
 * Standard retention period in days.
 */
export const STANDARD_RETENTION_DAYS = 30

/**
 * Extended retention period for flagged traces.
 */
export const FLAGGED_RETENTION_DAYS = 90

/**
 * Save a reasoning trace to the database.
 */
export async function saveTrace(options: SaveTraceOptions): Promise<TraceRecord> {
  const { id, runId, agentId, events, flagged = false } = options

  const retentionDays = flagged ? FLAGGED_RETENTION_DAYS : STANDARD_RETENTION_DAYS
  const eventsJson = JSON.stringify(events)

  await sql`
    INSERT INTO reasoning_traces (id, run_id, agent_id, events, retention_days, flagged, created_at, expires_at)
    VALUES (
      ${id},
      ${runId},
      ${agentId},
      ${eventsJson}::jsonb,
      ${retentionDays},
      ${flagged},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP + INTERVAL '1 day' * ${retentionDays}
    )
    ON CONFLICT (id) DO UPDATE SET
      events = EXCLUDED.events,
      flagged = EXCLUDED.flagged,
      retention_days = EXCLUDED.retention_days,
      expires_at = EXCLUDED.created_at + INTERVAL '1 day' * EXCLUDED.retention_days
  `

  return {
    id,
    runId,
    agentId,
    events,
    retentionDays,
    flagged,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
  }
}

/**
 * Get a single trace by ID.
 */
export async function getTrace(id: string): Promise<TraceRecord | null> {
  const result = await sql`
    SELECT id, run_id, agent_id, events, retention_days, flagged, created_at, expires_at
    FROM reasoning_traces
    WHERE id = ${id}
  `

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    events: row.events as ReasoningEvent[],
    retentionDays: row.retention_days,
    flagged: row.flagged,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

/**
 * Get all traces for a run.
 */
export async function getTracesByRun(runId: string): Promise<TraceRecord[]> {
  const result = await sql`
    SELECT id, run_id, agent_id, events, retention_days, flagged, created_at, expires_at
    FROM reasoning_traces
    WHERE run_id = ${runId}
    ORDER BY created_at ASC
  `

  return result.rows.map(row => ({
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    events: row.events as ReasoningEvent[],
    retentionDays: row.retention_days,
    flagged: row.flagged,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }))
}

/**
 * List traces with pagination.
 * Useful for admin/debugging UI.
 */
export async function listTraces(options: {
  limit?: number
  offset?: number
  flagged?: boolean
}): Promise<{ traces: TraceRecord[]; total: number }> {
  const { limit = 50, offset = 0, flagged } = options

  let countResult
  let result

  if (flagged !== undefined) {
    countResult = await sql`
      SELECT COUNT(*) as total
      FROM reasoning_traces
      WHERE flagged = ${flagged}
    `

    result = await sql`
      SELECT id, run_id, agent_id, events, retention_days, flagged, created_at, expires_at
      FROM reasoning_traces
      WHERE flagged = ${flagged}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
  } else {
    countResult = await sql`
      SELECT COUNT(*) as total
      FROM reasoning_traces
    `

    result = await sql`
      SELECT id, run_id, agent_id, events, retention_days, flagged, created_at, expires_at
      FROM reasoning_traces
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
  }

  return {
    traces: result.rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      agentId: row.agent_id,
      events: row.events as ReasoningEvent[],
      retentionDays: row.retention_days,
      flagged: row.flagged,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    })),
    total: Number(countResult.rows[0].total),
  }
}

/**
 * Delete a trace by ID.
 */
export async function deleteTrace(id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM reasoning_traces
    WHERE id = ${id}
    RETURNING id
  `

  return result.rows.length > 0
}

/**
 * Delete all traces for a run.
 */
export async function deleteTracesByRun(runId: string): Promise<number> {
  const result = await sql`
    DELETE FROM reasoning_traces
    WHERE run_id = ${runId}
    RETURNING id
  `

  return result.rows.length
}

/**
 * Mark a trace as flagged (extends retention to 90 days).
 */
export async function flagTrace(id: string): Promise<void> {
  await sql`
    UPDATE reasoning_traces
    SET flagged = true,
        retention_days = ${FLAGGED_RETENTION_DAYS},
        expires_at = created_at + INTERVAL '1 day' * ${FLAGGED_RETENTION_DAYS}
    WHERE id = ${id}
  `
}
