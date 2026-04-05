import { sql } from '@vercel/postgres';
import type { Agent, Run, Checkpoint, Approval, WorkingMemoryEntry, Session, GmailToken, AgentStatus, RunStatus, MagicLinkToken, EncryptedCredential } from './types';

// --- AGENTS ---
export async function createAgent(data: {
  user_id: string;
  name: string;
  role: Agent['role'];
  config?: Record<string, unknown>;
  schedule?: string | null;
  budget_ms?: number | null;
}): Promise<Agent> {
  const result = await sql`
    INSERT INTO agents (user_id, name, role, config, schedule, budget_ms)
    VALUES (${data.user_id}, ${data.name}, ${data.role}, ${JSON.stringify(data.config ?? {})}, ${data.schedule ?? null}, ${data.budget_ms ?? null})
    RETURNING *
  `;
  return result.rows[0] as Agent;
}

export async function getAgent(id: string): Promise<Agent | null> {
  const result = await sql`SELECT * FROM agents WHERE id = ${id}`;
  return result.rows[0] as Agent ?? null;
}

export async function listAgents(userId: string): Promise<Agent[]> {
  const result = await sql`SELECT * FROM agents WHERE user_id = ${userId} ORDER BY created_at DESC`;
  return result.rows as Agent[];
}

export async function updateAgentStatus(id: string, status: AgentStatus): Promise<void> {
  await sql`UPDATE agents SET status = ${status}, updated_at = NOW() WHERE id = ${id}`;
}

export async function deleteAgent(id: string): Promise<void> {
  await sql`DELETE FROM agents WHERE id = ${id}`;
}

// --- RUNS ---
export async function createRun(data: { agent_id: string; user_id: string }): Promise<Run> {
  const result = await sql`
    INSERT INTO runs (agent_id, user_id, status)
    VALUES (${data.agent_id}, ${data.user_id}, 'running')
    RETURNING *
  `;
  return result.rows[0] as Run;
}

export async function getRun(id: string): Promise<Run | null> {
  const result = await sql`SELECT * FROM runs WHERE id = ${id}`;
  return result.rows[0] as Run ?? null;
}

export async function updateRunStatus(id: string, status: RunStatus, completedAt?: Date): Promise<void> {
  if (completedAt) {
    await sql`UPDATE runs SET status = ${status}, completed_at = ${completedAt.toISOString()} WHERE id = ${id}`;
  } else {
    await sql`UPDATE runs SET status = ${status} WHERE id = ${id}`;
  }
}

// --- CHECKPOINTS ---
export async function createCheckpoint(data: {
  run_id: string;
  step: number;
  state_before?: Record<string, unknown> | null;
  state_after?: Record<string, unknown> | null;
  tool_name?: string | null;
  tool_call_id?: string | null;
  tool_result?: unknown | null;
  tool_args?: Record<string, unknown> | null;
  total_tokens?: number | null;
}): Promise<Checkpoint> {
  const result = await sql`
    INSERT INTO checkpoints (run_id, step, state_before, state_after, tool_name, tool_call_id, tool_result, tool_args, total_tokens)
    VALUES (
      ${data.run_id}, ${data.step},
      ${data.state_before ? JSON.stringify(data.state_before) : null},
      ${data.state_after ? JSON.stringify(data.state_after) : null},
      ${data.tool_name ?? null},
      ${data.tool_call_id ?? null},
      ${data.tool_result ? JSON.stringify(data.tool_result) : null},
      ${data.tool_args ? JSON.stringify(data.tool_args) : null},
      ${data.total_tokens ?? null}
    )
    RETURNING *
  `;
  return result.rows[0] as Checkpoint;
}

export async function getCheckpointsForRun(runId: string): Promise<Checkpoint[]> {
  const result = await sql`
    SELECT * FROM checkpoints WHERE run_id = ${runId} ORDER BY step ASC
  `;
  return result.rows as Checkpoint[];
}

export async function getCheckpointByToolCallId(toolCallId: string): Promise<Checkpoint | null> {
  const result = await sql`
    SELECT * FROM checkpoints WHERE tool_call_id = ${toolCallId} AND tool_result IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `;
  return result.rows[0] as Checkpoint ?? null;
}

// --- APPROVALS ---
export async function createApproval(data: {
  run_id: string;
  step: number;
  tool_name: string;
  args: Record<string, unknown>;
}): Promise<Approval> {
  const result = await sql`
    INSERT INTO approvals (run_id, step, tool_name, args, status)
    VALUES (${data.run_id}, ${data.step}, ${data.tool_name}, ${JSON.stringify(data.args)}, 'pending')
    RETURNING *
  `;
  return result.rows[0] as Approval;
}

export async function getApproval(id: string): Promise<Approval | null> {
  const result = await sql`SELECT * FROM approvals WHERE id = ${id}`;
  return result.rows[0] as Approval ?? null;
}

export async function getPendingApprovalsForRun(runId: string): Promise<Approval[]> {
  const result = await sql`
    SELECT * FROM approvals WHERE run_id = ${runId} AND status = 'pending'
    ORDER BY step ASC
  `;
  return result.rows as Approval[];
}

export async function resolveApproval(id: string, status: 'approved' | 'denied'): Promise<void> {
  await sql`
    UPDATE approvals SET status = ${status}, resolved_at = NOW() WHERE id = ${id}
  `;
}

// --- WORKING MEMORY ---
export async function setWorkingMemory(sessionId: string, key: string, value: unknown): Promise<void> {
  await sql`
    INSERT INTO working_memory (session_id, key, value, updated_at)
    VALUES (${sessionId}, ${key}, ${JSON.stringify(value)}, NOW())
    ON CONFLICT (session_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function getWorkingMemory(sessionId: string, key: string): Promise<unknown | null> {
  const result = await sql`
    SELECT value FROM working_memory WHERE session_id = ${sessionId} AND key = ${key}
  `;
  return result.rows[0]?.value ?? null;
}

export async function getAllWorkingMemory(sessionId: string): Promise<Record<string, unknown>> {
  const result = await sql`
    SELECT key, value FROM working_memory WHERE session_id = ${sessionId}
  `;
  const map: Record<string, unknown> = {};
  for (const row of result.rows) {
    map[row.key] = row.value;
  }
  return map;
}

export async function clearWorkingMemory(sessionId: string): Promise<void> {
  await sql`DELETE FROM working_memory WHERE session_id = ${sessionId}`;
}

// --- SESSIONS ---
export async function createSession(data: { id: string; user_id: string; expiresAt: Date }): Promise<Session> {
  const result = await sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${data.id}, ${data.user_id}, ${data.expiresAt.toISOString()})
    RETURNING *
  `;
  return result.rows[0] as Session;
}

export async function getSession(id: string): Promise<Session | null> {
  const result = await sql`SELECT * FROM sessions WHERE id = ${id} AND expires_at > NOW()`;
  return result.rows[0] as Session ?? null;
}

export async function deleteSession(id: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE id = ${id}`;
}

// --- TEAMS (from orgs migration) ---
export interface Team {
  id: string;
  owner_id: string;
  name: string;
  created_at: Date;
}

export async function getTeamsByUser(userId: string): Promise<Team[]> {
  const result = await sql`
    SELECT * FROM orgs WHERE owner_id = ${userId} ORDER BY created_at DESC
  `;
  return result.rows as Team[];
}

export async function createTeam(
  id: string,
  ownerId: string,
  name: string,
  agents?: string,
  connections?: string
) {
  const result = await sql`
    INSERT INTO orgs (id, owner_id, name)
    VALUES (${id}, ${ownerId}, ${name})
    RETURNING *
  `;
  return result.rows[0];
}

// --- USERS ---
export async function getUserByEmail(email: string) {
  const result = await sql`SELECT * FROM users WHERE email = ${email}`;
  return result.rows[0] ?? null;
}

export async function createUser(id: string, email: string) {
  const result = await sql`
    INSERT INTO users (id, email)
    VALUES (${id}, ${email})
    RETURNING *
  `;
  return result.rows[0];
}

// --- MAGIC LINK TOKENS ---
export async function createMagicLinkToken(tokenHash: string, userId: string, expiresAt: Date) {
  const id = crypto.randomUUID()
  const result = await sql`
    INSERT INTO magic_link_tokens (id, user_id, token_hash, expires_at)
    VALUES (${id}, ${userId}, ${tokenHash}, ${expiresAt.toISOString()})
    RETURNING *
  `;
  return result.rows[0];
}

export async function getMagicLinkToken(tokenHash: string) {
  const result = await sql`
    SELECT * FROM magic_link_tokens
    WHERE token_hash = ${tokenHash} AND expires_at > NOW() AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `;
  return result.rows[0] ?? null;
}

export async function markMagicLinkUsed(tokenHash: string) {
  await sql`UPDATE magic_link_tokens SET used_at = NOW() WHERE token_hash = ${tokenHash}`;
}

// --- CREDENTIALS (generic encrypted token storage) ---
export interface Credential {
  id: string;
  user_id: string;
  provider: string;
  encrypted_token: string;
  expires_at: Date | null;
  created_at: Date;
}

export async function saveCredential(
  id: string,
  userId: string,
  provider: string,
  encryptedToken: string,
  expiresAt: Date | null
) {
  await sql`
    INSERT INTO credentials (id, user_id, provider, encrypted_token, expires_at)
    VALUES (${id}, ${userId}, ${provider}, ${encryptedToken}, ${expiresAt?.toISOString() ?? null})
    ON CONFLICT (user_id, provider) DO UPDATE SET
      encrypted_token = EXCLUDED.encrypted_token,
      expires_at = EXCLUDED.expires_at
  `;
}

export async function getCredential(userId: string, provider: string): Promise<Credential | null> {
  const result = await sql`
    SELECT * FROM credentials WHERE user_id = ${userId} AND provider = ${provider}
  `;
  return result.rows[0] as Credential ?? null;
}

// --- MAGIC LINK TOKENS (legacy for magic-link.ts) ---
// These are called by lib/auth/magic-link.ts

// --- GMAIL TOKENS ---
export async function setGmailToken(data: {
  user_id: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: Date | null;
}): Promise<void> {
  await sql`
    INSERT INTO gmail_tokens (user_id, access_token, refresh_token, expires_at)
    VALUES (${data.user_id}, ${data.access_token}, ${data.refresh_token ?? null}, ${data.expires_at?.toISOString() ?? null})
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at
  `;
}

export async function getGmailToken(userId: string): Promise<GmailToken | null> {
  const result = await sql`SELECT * FROM gmail_tokens WHERE user_id = ${userId}`;
  return result.rows[0] as GmailToken ?? null;
}

// --- ESCALATION SUGGESTIONS ---
import type { EscalationSuggestion } from '../runtime/escalation-types'

export async function getEscalationSuggestionsForAgent(
  agentId: string,
  status?: 'pending' | 'accepted' | 'dismissed' | 'expired'
): Promise<EscalationSuggestion[]> {
  if (status) {
    const result = await sql`
      SELECT * FROM escalation_suggestions
      WHERE agent_id = ${agentId} AND status = ${status}
      ORDER BY created_at DESC
    `
    return result.rows as EscalationSuggestion[]
  }
  const result = await sql`
    SELECT * FROM escalation_suggestions
    WHERE agent_id = ${agentId}
    ORDER BY created_at DESC
  `
  return result.rows as EscalationSuggestion[]
}

export async function resolveEscalationSuggestion(
  id: string,
  resolvedBy: 'accepted' | 'dismissed'
): Promise<void> {
  await sql`
    UPDATE escalation_suggestions
    SET status = ${resolvedBy}, resolved_at = NOW(), resolved_by = ${resolvedBy}
    WHERE id = ${id}
  `
}

export async function getEscalationSuggestionsForRun(runId: string): Promise<EscalationSuggestion[]> {
  const result = await sql`
    SELECT * FROM escalation_suggestions
    WHERE run_id = ${runId} AND status = 'pending'
    ORDER BY created_at DESC
  `
  return result.rows as EscalationSuggestion[]
}
