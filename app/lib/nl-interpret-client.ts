/**
 * NL Interpretation Client
 *
 * Routes NL interpretation requests to Cloudflare Workers (primary)
 * with Next.js API route as fallback.
 *
 * Architecture:
 *   Maria types goal
 *       ↓
 *   POST to this client
 *       ↓
 *   Try: Cloudflare Worker (AI Gateway) — ~0ms cold start
 *       ↓ (fallback on error/timeout)
 *   Try: Next.js /api/canvas/nl-to-canvas (existing implementation)
 *       ↓
 *   Return result to canvas UI
 */

import type { NLToCanvasRequest, NLToCanvasResponse } from '@/app/api/canvas/nl-to-canvas/route'

const WORKER_URL = process.env.NL_INTERPRET_WORKER_URL ?? 'https://nl-interpret.agentos.workers.dev'
const WORKER_TIMEOUT_MS = 8000
const FALLBACK_TIMEOUT_MS = 12000

interface InterpretOptions {
  timeoutMs?: number
}

export class NLInterpretationError extends Error {
  constructor(
    message: string,
    public readonly stage: 'worker' | 'fallback' | 'parse',
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'NLInterpretationError'
  }
}

/**
 * Interprets a natural language goal into a canvas graph.
 *
 * Tries Cloudflare Worker first, falls back to Next.js route.
 * Returns the same NLToCanvasResponse shape regardless of which backend handled it.
 */
export async function interpretGoal(
  request: NLToCanvasRequest,
  options: InterpretOptions = {}
): Promise<NLToCanvasResponse> {
  const { timeoutMs = WORKER_TIMEOUT_MS } = options

  // Try Worker first
  const workerResult = await tryWorker(request, timeoutMs)
  if (workerResult !== null) return workerResult

  // Fallback to Next.js
  const fallbackResult = await tryFallback(request, FALLBACK_TIMEOUT_MS)
  if (fallbackResult !== null) return fallbackResult

  throw new NLInterpretationError(
    'All interpretation backends failed. Please try again.',
    'fallback'
  )
}

/**
 * Try Cloudflare Worker (AI Gateway)
 */
async function tryWorker(
  request: NLToCanvasRequest,
  timeoutMs: number
): Promise<NLToCanvasResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${WORKER_URL}/interpret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'agentos-app/1.0',
      },
      body: JSON.stringify({
        teamId: request.teamId,
        goal: request.goal,
        existingNodes: request.existingNodes,
        existingEdges: request.existingEdges,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      // 4xx/5xx — don't fall back, worker is the authoritative endpoint
      const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new NLInterpretationError(
        errorBody.error ?? 'Worker error',
        'worker',
        response.status
      )
    }

    const data = await response.json()
    return normalizeWorkerResponse(data)
  } catch (err: any) {
    clearTimeout(timer)

    // AbortError = timeout — fall back
    if (err.name === 'AbortError' || err.message?.includes('timeout')) {
      console.warn('[nl-interpret] Worker timeout, falling back to Next.js:', request.goal.slice(0, 50))
      return null
    }

    // Network error — fall back
    if (err instanceof TypeError && err.message?.includes('fetch')) {
      console.warn('[nl-interpret] Worker network error, falling back to Next.js:', err.message)
      return null
    }

    // Re-throw NLInterpretationErrors (these are user-facing)
    if (err instanceof NLInterpretationError) throw err

    // Other errors — don't fall back, surface as worker error
    console.error('[nl-interpret] Worker unexpected error:', err)
    throw new NLInterpretationError(
      err.message ?? 'Worker error',
      'worker'
    )
  }
}

/**
 * Try Next.js API route (existing implementation)
 */
async function tryFallback(
  request: NLToCanvasRequest,
  timeoutMs: number
): Promise<NLToCanvasResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('/api/canvas/nl-to-canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new NLInterpretationError(
        errorBody.error ?? 'Fallback error',
        'fallback',
        response.status
      )
    }

    return await response.json()
  } catch (err: any) {
    clearTimeout(timer)

    if (err.name === 'AbortError' || err.message?.includes('timeout')) {
      console.error('[nl-interpret] Fallback also timed out for:', request.goal.slice(0, 50))
      return null
    }

    if (err instanceof NLInterpretationError) throw err

    console.error('[nl-interpret] Fallback error:', err)
    return null
  }
}

/**
 * Normalize Worker response to match Next.js route response shape.
 * The Worker uses slightly different field names internally.
 */
function normalizeWorkerResponse(data: any): NLToCanvasResponse {
  // Worker returns { graph, explanation, confidence } directly
  // Next.js route returns { graph, explanation, confidence } with optional fields
  // Field shapes should already match — this is for future schema drift
  return {
    graph: data.graph,
    explanation: data.explanation,
    confidence: data.confidence,
    needsClarification: data.needsClarification,
    question: data.question,
    options: data.options,
    ambiguousFields: data.ambiguousFields,
    error: data.error,
    governance_required: data.governance_required,
    governanceActionId: data.governanceActionId,
    new_tools: data.new_tools,
  }
}
