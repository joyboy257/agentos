export interface Agent {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  role: 'research_agent' | 'support_agent';
  config: Record<string, unknown>;
  status: AgentStatus;
  schedule_cron: string | null;
  budget_ms: number | null;
  created_at: Date;
  updated_at: Date;
}

export type AgentStatus = 'idle' | 'running' | 'waiting_for_approval' | 'paused' | 'paused_budget' | 'stopped' | 'completed' | 'failed';

export interface Run {
  id: string;
  agent_id: string;
  user_id: string;
  status: RunStatus;
  triggered_by?: 'manual' | 'proactive' | 'webhook' | null;
  session_id?: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export type RunStatus = 'scheduled' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'paused';

export interface Checkpoint {
  id: string;
  run_id: string;
  step: number;
  state_before: Record<string, unknown> | null;
  state_after: Record<string, unknown> | null;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_result: unknown | null;
  tool_args: Record<string, unknown> | null;
  messages: unknown[] | null;
  total_tokens: number | null;
  child_job_id: string | null;
  created_at: Date;
}

export interface Approval {
  id: string;
  run_id: string;
  step: number;
  tool_name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'timeout';
  created_at: Date;
  resolved_at: Date | null;
}

export interface WorkingMemoryEntry {
  session_id: string;
  key: string;
  value: unknown;
  updated_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
}

export interface GmailToken {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface MagicLinkToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface User {
  id: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

export interface EncryptedCredential {
  id: string;
  user_id: string;
  provider: string;
  encrypted_token: string;
  expires_at: Date | null;
  created_at: Date;
}
