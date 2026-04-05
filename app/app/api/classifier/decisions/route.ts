/**
 * POST /api/classifier/decisions — log a classifier decision for audit.
 */

import { sql } from '@vercel/postgres'
import { createHash } from 'crypto'
import type { ClassifierDecision } from '@/lib/classifier/transcript-classifier'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { runId, agentId, userId, toolName, args, decision, reasoning, confidence } = body

    if (!runId || !agentId || !userId || !toolName || !args || !decision) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validDecisions = ['auto_approve', 'execute_and_notify', 'escalate']
    if (!validDecisions.includes(decision)) {
      return Response.json({ error: 'Invalid decision value' }, { status: 400 })
    }

    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      return Response.json({ error: 'Confidence must be 0-1' }, { status: 400 })
    }

    // Hash args for deduplication in RAG queries
    const argsHash = createHash('sha256').update(JSON.stringify(args)).digest('hex')

    const result = await sql`
      INSERT INTO classifier_decisions (run_id, agent_id, user_id, tool_name, args_hash, decision, reasoning, confidence)
      VALUES (
        ${runId},
        ${agentId},
        ${userId},
        ${toolName},
        ${argsHash},
        ${decision},
        ${reasoning ?? ''},
        ${confidence}
      )
      RETURNING id, created_at
    `

    return Response.json({ id: result.rows[0].id, createdAt: result.rows[0].created_at })
  } catch (err) {
    console.error('Failed to log classifier decision:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
