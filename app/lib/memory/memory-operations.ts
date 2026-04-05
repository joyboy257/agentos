/**
 * Memory operations — coordinates between mem0 (extraction + Qdrant)
 * and the Postgres memory_facts table (audit + Maria's confirmation state).
 *
 * These are the high-level functions called by the runner and API.
 */

import { ulid } from 'ulid';
import { sql } from '@vercel/postgres';
import { storeMemory, searchMemory } from './memory-client';
import { getMemoryConfig } from './memory-config';

export interface MemoryFact {
  id: string;
  user_id: string;
  fact_text: string;
  source_run_id: string | null;
  mem0_id: string | null;
  embedding_id: string | null;
  confirmed_at: Date | null;
  denied_at: Date | null;
  created_at: Date;
}

export interface ExtractAndStoreFactsOptions {
  userId: string;
  agentId: string;
  runId: string;
  messages: string[];
}

/**
 * Extract facts from a run's messages via mem0 and store in both
 * Qdrant (via mem0) and Postgres (for audit + confirmation).
 *
 * This is called after each completed run.
 *
 * @param runId    - The completed run ID (used as source_run_id)
 * @param userId   - AgentOS user ID
 * @param agentId  - Agent that produced these messages
 * @param messages - All messages / tool results from the run
 */
export async function extractAndStoreFacts(
  runId: string,
  userId: string,
  agentId: string,
  messages: string[]
): Promise<void> {
  const config = getMemoryConfig();

  if (!config.isConfigured) {
    console.debug('[Memory] extractAndStoreFacts: not configured, skipping');
    return;
  }

  if (!messages || messages.length === 0) {
    console.debug('[Memory] extractAndStoreFacts: no messages to process');
    return;
  }

  try {
    // 1. Store in mem0 + Qdrant via the memory client
    await storeMemory(userId, messages, {
      runId,
      agentId,
      type: 'run_extraction',
    });

    // 2. Persist a pending fact record in Postgres for Maria's review.
    //    The actual fact text is stored here so Maria can confirm/deny it
    //    even if mem0's extraction changes over time.
    //
    //    Since mem0 extracts multiple facts internally and doesn't return
    //    them all in a structured way, we store one aggregate record per run.
    //    Future: iterate mem0's returned fact IDs and store each separately.
    const factText = summarizeMessagesForFact(messages);
    const id = ulid();

    await sql`
      INSERT INTO memory_facts (id, user_id, fact_text, source_run_id)
      VALUES (${id}, ${userId}, ${factText}, ${runId})
    `;

    console.debug(`[Memory] Stored fact for run ${runId}: ${factText.slice(0, 80)}...`);
  } catch (err) {
    // Non-fatal: memory ops should never crash a run
    console.error('[Memory] extractAndStoreFacts failed:', err);
  }
}

/**
 * Summarize a list of messages into a single fact string for storage.
 * This is a best-effort extraction — in production, mem0 extracts
 * structured facts server-side.
 */
function summarizeMessagesForFact(messages: string[]): string {
  // Take first few messages, strip tool prefixes, join with " | "
  const text = messages
    .slice(0, 10)
    .map((m) => {
      if (typeof m !== 'string') return JSON.stringify(m).slice(0, 200);
      return m.replace(/^user: /i, '').replace(/^assistant: /i, '').slice(0, 200);
    })
    .join(' | ');

  return text.length > 1000 ? text.slice(0, 1000) + '...' : text;
}

/**
 * Get all confirmed facts for a user (from Postgres, not Qdrant).
 * Confirmed facts are excluded from future extraction but included
 * in agent context.
 */
export async function getConfirmedFacts(userId: string): Promise<MemoryFact[]> {
  const result = await sql`
    SELECT *
    FROM memory_facts
    WHERE user_id = ${userId}
      AND confirmed_at IS NOT NULL
      AND denied_at IS NULL
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return result.rows as MemoryFact[];
}

/**
 * Get all pending facts (not yet confirmed or denied) for a user.
 * These are shown to Maria in the Activity Log for review.
 */
export async function getPendingFacts(userId: string): Promise<MemoryFact[]> {
  const result = await sql`
    SELECT *
    FROM memory_facts
    WHERE user_id = ${userId}
      AND confirmed_at IS NULL
      AND denied_at IS NULL
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return result.rows as MemoryFact[];
}

/**
 * Get all facts (confirmed + pending) for a user.
 */
export async function getAllFacts(userId: string): Promise<MemoryFact[]> {
  const result = await sql`
    SELECT *
    FROM memory_facts
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return result.rows as MemoryFact[];
}

/**
 * Confirm a fact by ID. Marks confirmed_at, making it eligible for
 * agent context injection.
 */
export async function confirmFact(factId: string, userId: string): Promise<void> {
  await sql`
    UPDATE memory_facts
    SET confirmed_at = NOW()
    WHERE id = ${factId} AND user_id = ${userId}
  `;
}

/**
 * Deny a fact by ID. Marks denied_at and triggers feedback to mem0
 * in a future background job (Unit 5).
 */
export async function denyFact(factId: string, userId: string): Promise<void> {
  await sql`
    UPDATE memory_facts
    SET denied_at = NOW()
    WHERE id = ${factId} AND user_id = ${userId}
  `;
}

/**
 * Get a single fact by ID. Returns null if not found or userId mismatch.
 */
export async function getFactById(factId: string, userId: string): Promise<MemoryFact | null> {
  const result = await sql`
    SELECT *
    FROM memory_facts
    WHERE id = ${factId} AND user_id = ${userId}
    LIMIT 1
  `;
  const rows = result.rows as MemoryFact[];
  return rows[0] ?? null;
}

/**
 * Manually add a fact for a user (via POST /api/memory/facts).
 * This is used when Maria wants to teach the agent something directly.
 */
export async function addManualFact(
  userId: string,
  factText: string,
  sourceRunId?: string
): Promise<MemoryFact> {
  const id = ulid();
  const result = await sql`
    INSERT INTO memory_facts (id, user_id, fact_text, source_run_id, confirmed_at)
    VALUES (${id}, ${userId}, ${factText}, ${sourceRunId ?? null}, NOW())
    RETURNING *
  `;
  return result.rows[0] as MemoryFact;
}
