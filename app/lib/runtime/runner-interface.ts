export interface RunResult {
  runId: string;
  status: 'completed' | 'failed' | 'waiting_for_approval';
  finalState?: Record<string, unknown>;
  error?: string;
}

export interface ExecuteOptions {
  agentId: string;
  userId: string;
  sessionId: string;
  args?: Record<string, unknown>;
  elapsedMs?: number;
}

export interface SingleAgentOptions {
  agentId: string;
  userId?: string;
  sessionId?: string;
  prompt?: string;
  upstreamArtifact?: unknown;
}

export interface Runner {
  execute(options: ExecuteOptions): Promise<RunResult>;
  resume(runId: string): Promise<RunResult>;
  /** Run a single agent in isolation and return its output artifact (for team fan-out). */
  executeSingleAgent(options: SingleAgentOptions): Promise<unknown>;
  /** Fan-out execute all agents in a team via canvas wires. */
  executeTeam(teamId: string): Promise<void>;
}
