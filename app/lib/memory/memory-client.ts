/**
 * Mem0 client wrapper for AgentOS long-term memory.
 *
 * Uses mem0ai managed API for extraction and storage.
 * Qdrant Cloud URL/key are noted for future direct integration but
 * are currently configured at the mem0 project level in the mem0 dashboard.
 *
 * Graceful degradation: if memory is not configured, all operations are no-ops.
 */

import { getMemoryConfig } from './memory-config';

const MEMORY_USER_ID_PREFIX = 'agentos_user_';

/**
 * Mem0 client is lazily initialized once per process.
 * Falls back to no-op mode when env vars are absent.
 */
let _mem0Client: any = null;
let _isEnabled = false;

async function getClient(): Promise<{ client: any; isEnabled: boolean } | { client: null; isEnabled: false }> {
  const config = getMemoryConfig();

  if (!config.isConfigured) {
    return { client: null, isEnabled: false };
  }

  if (_mem0Client) {
    return { client: _mem0Client, isEnabled: _isEnabled };
  }

  try {
    const Mem0 = await import('mem0ai') as any;
    const Mem0Client = Mem0.MemoryClient;

    _mem0Client = new Mem0Client({
      apiKey: config.mem0ApiKey,
      // Qdrant is configured at the mem0 project level in the mem0 dashboard.
      // For direct Qdrant integration, set QDRANT_CLOUD_URL + QDRANT_API_KEY
      // in env and configure via mem0's vector store settings.
    });

    _isEnabled = true;
    return { client: _mem0Client, isEnabled: true };
  } catch (err) {
    console.error('[Memory] Failed to initialize mem0 client:', err);
    return { client: null, isEnabled: false };
  }
}

export interface MemorySearchResult {
  id: string;
  fact: string;
  score?: number;
  mem0_id?: string;
}

export interface AgentContextResult {
  facts: string[];
  count: number;
}

/**
 * Normalize a userId for use as a mem0 user identifier.
 * mem0 uses strings as user IDs; we prefix to avoid collisions.
 */
function normalizeUserId(userId: string): string {
  return userId.startsWith(MEMORY_USER_ID_PREFIX)
    ? userId
    : `${MEMORY_USER_ID_PREFIX}${userId}`;
}

/**
 * Store a set of messages as memories for a user.
 * mem0 extracts facts and stores them (vector store configured in mem0 dashboard).
 *
 * @param userId   - AgentOS user ID
 * @param messages - Array of message strings from the run
 * @param metadata - Optional metadata (runId, agentId, etc.)
 */
export async function storeMemory(
  userId: string,
  messages: string[],
  metadata?: Record<string, unknown>
): Promise<void> {
  const { client, isEnabled } = await getClient();
  if (!isEnabled || !client) {
    console.debug('[Memory] storeMemory: not configured, skipping');
    return;
  }

  try {
    // mem0 add() expects Array<{ role: string; content: string }>
    const msgArray = messages.map((content) => ({ role: 'user', content }));
    const result = await client.add(msgArray, {
      user_id: normalizeUserId(userId),
      metadata: metadata ?? {},
    });
    console.debug('[Memory] Stored memories:', result);
  } catch (err) {
    // Non-fatal: log and continue
    console.error('[Memory] storeMemory failed:', err);
  }
}

/**
 * Search memory for facts relevant to a query.
 *
 * @param userId - AgentOS user ID
 * @param query  - Plain-English search query
 * @param limit  - Maximum number of results (default 5)
 */
export async function searchMemory(
  userId: string,
  query: string,
  limit = 5
): Promise<MemorySearchResult[]> {
  const { client, isEnabled } = await getClient();
  if (!isEnabled || !client) {
    return [];
  }

  try {
    const results = await client.search(query, {
      user_id: normalizeUserId(userId),
      limit,
    });

    return (results as any[]).map((r: any) => ({
      id: r.id ?? r.memory_id ?? String(Math.random()),
      fact: r.memory ?? r.fact ?? r.text ?? String(r),
      score: r.score,
      mem0_id: r.id ?? r.memory_id,
    }));
  } catch (err) {
    console.error('[Memory] searchMemory failed:', err);
    return [];
  }
}

/**
 * Get agent context for a specific goal — returns top-K facts as plain English.
 * This is called at the start of each run to inject memory into the system prompt.
 *
 * @param userId - AgentOS user ID
 * @param goal   - Current agent goal / task description
 * @param limit  - Maximum facts to return (default 5)
 */
export async function getAgentContext(
  userId: string,
  goal: string,
  limit = 5
): Promise<AgentContextResult> {
  const { client, isEnabled } = await getClient();
  if (!isEnabled || !client) {
    return { facts: [], count: 0 };
  }

  try {
    // Search with the goal as the query — mem0 retrieves the most relevant memories
    const results = await client.search(goal, {
      user_id: normalizeUserId(userId),
      limit,
    });

    const facts = (results as any[]).map((r: any) =>
      r.memory ?? r.fact ?? r.text ?? String(r)
    );

    return { facts, count: facts.length };
  } catch (err) {
    console.error('[Memory] getAgentContext failed:', err);
    return { facts: [], count: 0 };
  }
}

/**
 * Delete all memories for a user. Used when a user deletes their account.
 */
export async function deleteAllMemory(userId: string): Promise<void> {
  const { client, isEnabled } = await getClient();
  if (!isEnabled || !client) return;

  try {
    // deleteAll is the correct method name per the TypeScript definitions
    await (client as any).deleteAll({ user_id: normalizeUserId(userId) });
  } catch (err) {
    console.error('[Memory] deleteAllMemory failed:', err);
  }
}

/**
 * Send feedback to mem0 when Maria denies a fact.
 * This adjusts mem0's extraction parameters to reduce hallucinated facts.
 *
 * @param factId - The memory_facts.id that was denied
 * @param userId - AgentOS user ID
 */
export async function sendFeedbackToMem0(
  factId: string,
  userId?: string
): Promise<void> {
  const config = getMemoryConfig();
  if (!config.isConfigured) {
    console.debug('[Memory] sendFeedbackToMem0: not configured, skipping');
    return;
  }

  try {
    // mem0's feedback endpoint: POST /v1/feedback with { user_id, memory_id, verdict }
    const response = await fetch('https://api.mem0.ai/v1/feedback', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.mem0ApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId ? normalizeUserId(userId) : undefined,
        memory_id: factId,
        verdict: 'deny',
      }),
    });

    if (!response.ok) {
      console.error(`[Memory] mem0 feedback API error: ${response.status}`);
    } else {
      console.debug(`[Memory] Feedback sent to mem0 for fact ${factId}`);
    }
  } catch (err) {
    console.error('[Memory] sendFeedbackToMem0 failed:', err);
  }
}
