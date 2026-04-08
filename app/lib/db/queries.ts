import { ulid } from 'ulid'
import { sql } from '@vercel/postgres'
import type { Agent, Run, Checkpoint, Approval, WorkingMemoryEntry, Session, GmailToken, AgentStatus, RunStatus, MagicLinkToken, EncryptedCredential } from './types';

// --- AGENTS ---
export async function createAgent(data: {
  user_id: string;
  name: string;
  role: Agent['role'];
  config?: Record<string, unknown>;
  schedule?: string | null;  // stored as schedule_cron in DB
  budget_ms?: number | null;
}): Promise<Agent> {
  const result = await sql`
    INSERT INTO agents (user_id, name, role, config, schedule_cron, budget_ms)
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

export async function pauseAgent(id: string, reason: 'budget_exhausted'): Promise<void> {
  // reason parameter reserved for future pause types
  if (reason === 'budget_exhausted') {
    await sql`
      UPDATE agents
      SET status = 'paused_budget', paused_budget_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
    `
  }
}

export async function updateAgentBudget(id: string, budgetMs: number | null): Promise<void> {
  await sql`UPDATE agents SET budget_ms = ${budgetMs}, updated_at = NOW() WHERE id = ${id}`
}

export async function deleteAgent(id: string): Promise<void> {
  await sql`DELETE FROM agents WHERE id = ${id}`;
}

export async function updateAgentSchedule(id: string, scheduleCron: string | null): Promise<void> {
  await sql`UPDATE agents SET schedule_cron = ${scheduleCron}, updated_at = NOW() WHERE id = ${id}`;
}

/**
 * List all agents that have a schedule_cron set.
 */
export async function listAgentsWithSchedules(): Promise<Agent[]> {
  const result = await sql`SELECT * FROM agents WHERE schedule_cron IS NOT NULL ORDER BY created_at DESC`;
  return result.rows as Agent[];
}

// --- RUNS ---
export async function createRun(data: {
  agent_id: string;
  user_id: string;
  triggered_by?: 'manual' | 'proactive' | 'webhook';
}): Promise<Run> {
  const result = await sql`
    INSERT INTO runs (agent_id, user_id, status, triggered_by)
    VALUES (${data.agent_id}, ${data.user_id}, 'running', ${data.triggered_by ?? 'manual'})
    RETURNING *
  `;
  return result.rows[0] as Run;
}

export async function getRun(id: string): Promise<Run | null> {
  const result = await sql`SELECT * FROM runs WHERE id = ${id}`;
  return result.rows[0] as Run ?? null;
}

export async function getRunsByAgent(agentId: string): Promise<Run[]> {
  const result = await sql`SELECT * FROM runs WHERE agent_id = ${agentId} ORDER BY created_at DESC LIMIT 10`;
  return result.rows as Run[];
}

export async function updateRunStatus(id: string, status: RunStatus, completedAt?: Date): Promise<void> {
  if (completedAt) {
    await sql`UPDATE runs SET status = ${status}, completed_at = ${completedAt.toISOString()} WHERE id = ${id}`;
  } else {
    await sql`UPDATE runs SET status = ${status} WHERE id = ${id}`;
  }
}

export async function getOvernightSummary(userId: string): Promise<{
  completedCount: number
  escalatedCount: number
  firstRunAt: string | null
  agentsActive: string[]
}> {
  // "Overnight" = since midnight user local time
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  const runsResult = await sql`
    SELECT r.*, a.name as agent_name
    FROM runs r
    JOIN agents a ON a.id = r.agent_id
    WHERE r.user_id = ${userId}
      AND r.status = 'completed'
      AND r.completed_at >= ${startOfDay}
    ORDER BY r.completed_at ASC
  `

  const escalationsResult = await sql`
    SELECT COUNT(*) as count
    FROM escalation_suggestions es
    JOIN agents a ON a.id = es.agent_id
    WHERE a.user_id = ${userId}
      AND es.status = 'pending'
      AND es.created_at >= ${startOfDay}
  `

  const completedCount = runsResult.rows.length
  const escalatedCount = Number(escalationsResult.rows[0]?.count ?? 0)
  const agentsActive = [...new Set((runsResult.rows as Array<{ agent_name: string }>).map((r) => r.agent_name))]
  const firstRunAt = runsResult.rows[0]?.completed_at
    ? formatTimeAgo(new Date(runsResult.rows[0].completed_at))
    : null

  return { completedCount, escalatedCount, firstRunAt, agentsActive }
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
  child_job_id?: string | null;
}): Promise<Checkpoint> {
  const result = await sql`
    INSERT INTO checkpoints (run_id, step, state_before, state_after, tool_name, tool_call_id, tool_result, tool_args, total_tokens, child_job_id)
    VALUES (
      ${data.run_id}, ${data.step},
      ${data.state_before ? JSON.stringify(data.state_before) : null},
      ${data.state_after ? JSON.stringify(data.state_after) : null},
      ${data.tool_name ?? null},
      ${data.tool_call_id ?? null},
      ${data.tool_result ? JSON.stringify(data.tool_result) : null},
      ${data.tool_args ? JSON.stringify(data.tool_args) : null},
      ${data.total_tokens ?? null},
      ${data.child_job_id ?? null}
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

// --- GMAIL TOKENS ---
export async function getUserByGmailAddress(gmailAddress: string) {
  const result = await sql`
    SELECT u.*
    FROM users u
    JOIN gmail_tokens gt ON gt.user_id = u.id
    WHERE gt.gmail_address = ${gmailAddress}
    LIMIT 1
  `
  return result.rows[0] ?? null
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

// --- CANVAS WIRES ---
export interface CanvasWire {
  id: string
  team_id: string
  source_id: string
  target_id: string
  label: string | null
  created_at: Date
}

export async function createCanvasWire(data: {
  teamId: string
  sourceId: string
  targetId: string
  label?: string | null
}): Promise<CanvasWire> {
  const { rows } = await sql`
    INSERT INTO canvas_wires (id, team_id, source_id, target_id, label)
    VALUES (
      ${ulid()},
      ${data.teamId},
      ${data.sourceId},
      ${data.targetId},
      ${data.label ?? null}
    )
    RETURNING *
  `
  return rows[0] as CanvasWire
}

export async function listCanvasWiresForTeam(teamId: string): Promise<CanvasWire[]> {
  const { rows } = await sql`
    SELECT * FROM canvas_wires WHERE team_id = ${teamId} ORDER BY created_at ASC
  `
  return rows as CanvasWire[]
}

export async function deleteCanvasWire(id: string, teamId: string): Promise<void> {
  await sql`DELETE FROM canvas_wires WHERE id = ${id} AND team_id = ${teamId}`
}

// --- TASK OUTPUT (for wire artifact passing) ---
export interface TaskOutput {
  id: string
  task_id: string
  artifact: unknown
  created_at: Date
}

export async function getTaskOutput(taskId: string): Promise<unknown | null> {
  const { rows } = await sql`
    SELECT artifact FROM task_outputs WHERE task_id = ${taskId} ORDER BY created_at DESC LIMIT 1
  `
  return rows[0]?.artifact ?? null
}

export async function upsertTaskOutput(taskId: string, artifact: unknown): Promise<void> {
  const id = ulid()
  await sql`
    INSERT INTO task_outputs (id, task_id, artifact)
    VALUES (${id}, ${taskId}, ${JSON.stringify(artifact)})
    ON CONFLICT (task_id) DO UPDATE SET artifact = EXCLUDED.artifact
  `
}

// --- MAGIC LINK TOKENS (legacy for magic-link.ts) ---
// These are called by lib/auth/magic-link.ts

// --- GMAIL TOKENS ---
export async function setGmailToken(data: {
  user_id: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: Date | null;
  gmail_address?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO gmail_tokens (user_id, access_token, refresh_token, expires_at, gmail_address)
    VALUES (${data.user_id}, ${data.access_token}, ${data.refresh_token ?? null}, ${data.expires_at?.toISOString() ?? null}, ${data.gmail_address ?? null})
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      gmail_address = EXCLUDED.gmail_address
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

// --- CANVASES ---
export interface Canvas {
  id: string
  user_id: string
  name: string
  domain: string | null
  agents_json: string
  connections_json: string
  is_default: boolean
  created_at: Date
  updated_at: Date
}

export async function createCanvas(data: {
  id: string
  user_id: string
  name: string
  domain?: string | null
  agents_json?: unknown[]
  connections_json?: unknown[]
  is_default?: boolean
}): Promise<Canvas> {
  const result = await sql`
    INSERT INTO canvases (id, user_id, name, domain, agents_json, connections_json, is_default)
    VALUES (
      ${data.id},
      ${data.user_id},
      ${data.name},
      ${data.domain ?? null},
      ${JSON.stringify(data.agents_json ?? [])},
      ${JSON.stringify(data.connections_json ?? [])},
      ${data.is_default ?? false}
    )
    RETURNING *
  `
  return result.rows[0] as Canvas
}

export async function getCanvas(id: string): Promise<Canvas | null> {
  const result = await sql`SELECT * FROM canvases WHERE id = ${id}`
  return result.rows[0] as Canvas ?? null
}

export async function listCanvasesForUser(userId: string): Promise<Canvas[]> {
  const result = await sql`
    SELECT * FROM canvases WHERE user_id = ${userId} ORDER BY created_at DESC
  `
  return result.rows as Canvas[]
}

export async function updateCanvas(
  id: string,
  data: {
    name?: string
    domain?: string | null
    agents_json?: unknown[]
    connections_json?: unknown[]
    is_default?: boolean
  }
): Promise<Canvas> {
  const existing = await getCanvas(id)
  if (!existing) throw new Error(`Canvas ${id} not found`)

  const result = await sql`
    UPDATE canvases SET
      name            = ${data.name ?? existing.name},
      domain          = ${data.domain !== undefined ? data.domain : existing.domain},
      agents_json     = ${data.agents_json ? JSON.stringify(data.agents_json) : existing.agents_json},
      connections_json = ${data.connections_json ? JSON.stringify(data.connections_json) : existing.connections_json},
      is_default      = ${data.is_default ?? existing.is_default},
      updated_at      = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return result.rows[0] as Canvas
}

export async function deleteCanvas(id: string): Promise<void> {
  await sql`DELETE FROM canvases WHERE id = ${id}`
}

// --- GOVERNANCE ACTIONS ---
export interface GovernanceAction {
  id: string
  user_id: string
  canvas_id: string | null
  action_type: 'new_agent' | 'new_tool' | 'schema_change'
  payload_json: string
  status: 'pending' | 'approved' | 'denied'
  resolved_at: Date | null
  resolved_by: string | null
  created_at: Date
}

export async function createGovernanceAction(data: {
  id: string
  user_id: string
  canvas_id?: string | null
  action_type: GovernanceAction['action_type']
  payload_json: string
}): Promise<GovernanceAction> {
  const result = await sql`
    INSERT INTO governance_actions (id, user_id, canvas_id, action_type, payload_json)
    VALUES (${data.id}, ${data.user_id}, ${data.canvas_id ?? null}, ${data.action_type}, ${data.payload_json})
    RETURNING *
  `
  return result.rows[0] as GovernanceAction
}

export async function listGovernanceActions(
  userId: string,
  status?: 'pending' | 'approved' | 'denied'
): Promise<GovernanceAction[]> {
  if (status) {
    const result = await sql`
      SELECT * FROM governance_actions
      WHERE user_id = ${userId} AND status = ${status}
      ORDER BY created_at DESC
    `
    return result.rows as GovernanceAction[]
  }
  const result = await sql`
    SELECT * FROM governance_actions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `
  return result.rows as GovernanceAction[]
}

export async function resolveGovernanceAction(
  id: string,
  resolvedBy: string,
  status: 'approved' | 'denied'
): Promise<void> {
  await sql`
    UPDATE governance_actions
    SET status = ${status}, resolved_at = NOW(), resolved_by = ${resolvedBy}
    WHERE id = ${id}
  `
}

// --- TEAMS ---
export interface TeamRow {
  id: string
  user_id?: string
  canvas_id: string
  name: string
  coordinator_session_id: string | null
  status: 'created' | 'running' | 'completed' | 'deleted'
  created_at: Date
  updated_at: Date
}

export async function createTeamRow(data: { canvas_id: string; name: string }): Promise<TeamRow> {
  const { rows } = await sql`
    INSERT INTO teams (canvas_id, name)
    VALUES (${data.canvas_id}, ${data.name})
    RETURNING *
  `
  return rows[0] as TeamRow
}

export async function getTeam(id: string): Promise<TeamRow | null> {
  const { rows } = await sql`SELECT * FROM teams WHERE id = ${id}`
  return rows[0] as TeamRow ?? null
}

export async function listTeams(canvasId: string): Promise<TeamRow[]> {
  const { rows } = await sql`SELECT * FROM teams WHERE canvas_id = ${canvasId} ORDER BY created_at DESC`
  return rows as TeamRow[]
}

export async function updateTeamStatus(id: string, status: TeamRow['status']): Promise<void> {
  await sql`UPDATE teams SET status = ${status}, updated_at = NOW() WHERE id = ${id}`
}

// --- TASKS ---
export interface TaskRow {
  id: string
  team_id: string
  agent_id: string
  parent_session_id: string | null
  branch_name: string | null
  status: 'created' | 'running' | 'completed' | 'failed' | 'stopped'
  output_artifact: unknown | null
  created_at: Date
  updated_at: Date
}

export async function createTask(data: {
  team_id: string
  agent_id: string
  parent_session_id?: string | null
  branch_name?: string | null
}): Promise<TaskRow> {
  const { rows } = await sql`
    INSERT INTO tasks (team_id, agent_id, parent_session_id, branch_name)
    VALUES (${data.team_id}, ${data.agent_id}, ${data.parent_session_id ?? null}, ${data.branch_name ?? null})
    RETURNING *
  `
  return rows[0] as TaskRow
}

export async function getTask(id: string): Promise<TaskRow | null> {
  const { rows } = await sql`SELECT * FROM tasks WHERE id = ${id}`
  return rows[0] as TaskRow ?? null
}

export async function listTasks(teamId: string): Promise<TaskRow[]> {
  const { rows } = await sql`SELECT * FROM tasks WHERE team_id = ${teamId} ORDER BY created_at ASC`
  return rows as TaskRow[]
}

export async function updateTaskStatus(id: string, status: TaskRow['status']): Promise<void> {
  await sql`UPDATE tasks SET status = ${status}, updated_at = NOW() WHERE id = ${id}`
}

export async function updateTaskOutput(id: string, artifact: unknown): Promise<void> {
  await sql`UPDATE tasks SET output_artifact = ${JSON.stringify(artifact)}, updated_at = NOW() WHERE id = ${id}`
}
