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

export interface Runner {
  execute(options: ExecuteOptions): Promise<RunResult>;
  resume(runId: string): Promise<RunResult>;
}
