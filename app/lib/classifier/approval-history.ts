/**
 * Approval History RAG — retrieves recent approval decisions for a user
 * to inject as context into the classifier prompt.
 */

import { sql } from '@vercel/postgres'

export interface ApprovalHistoryEntry {
  toolName: string
  decision: 'approved' | 'denied' | 'auto_approved' | 'executed_and_notified'
  reasoning: string
  confidence: number
  createdAt: string
}

const APPROVAL_HISTORY_LIMIT = 20

/**
 * Retrieves the last N approval decisions for a given user.
 * Used as RAG context for the classifier.
 */
export async function getRecentApprovalHistory(userId: string): Promise<ApprovalHistoryEntry[]> {
  try {
    const result = await sql`
      SELECT
        tool_name,
        CASE
          WHEN status = 'approved' THEN 'approved'::text
          WHEN status = 'denied' THEN 'denied'::text
          WHEN status = 'auto_approved' THEN 'auto_approved'::text
          WHEN status = 'executed_and_notified' THEN 'executed_and_notified'::text
          ELSE status::text
        END AS decision,
        COALESCE(reasoning, '') AS reasoning,
        COALESCE(confidence, 0) AS confidence,
        created_at
      FROM classifier_decisions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${APPROVAL_HISTORY_LIMIT}
    `
    return result.rows.map((row) => ({
      toolName: row.tool_name as string,
      decision: row.decision as ApprovalHistoryEntry['decision'],
      reasoning: row.reasoning as string,
      confidence: Number(row.confidence),
      createdAt: (row.created_at as Date).toISOString(),
    }))
  } catch (err) {
    // Table may not exist yet during migration — return empty
    return []
  }
}
