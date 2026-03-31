import {
  setWorkingMemory,
  getWorkingMemory,
  getAllWorkingMemory,
  clearWorkingMemory,
} from '../db/queries';

export class WorkingMemory {
  constructor(private sessionId: string) {}

  /**
   * Get a value from working memory
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await getWorkingMemory(this.sessionId, key);
    return value as T | null;
  }

  /**
   * Set a value in working memory
   */
  async set<T = unknown>(key: string, value: T): Promise<void> {
    await setWorkingMemory(this.sessionId, key, value);
  }

  /**
   * Get all key-value pairs for this session
   */
  async getAll(): Promise<Record<string, unknown>> {
    return getAllWorkingMemory(this.sessionId);
  }

  /**
   * Atomically update multiple keys
   */
  async merge(patch: Record<string, unknown>): Promise<void> {
    const entries = Object.entries(patch);
    await Promise.all(
      entries.map(([key, value]) => setWorkingMemory(this.sessionId, key, value))
    );
  }

  /**
   * Clear all working memory for this session
   */
  async clear(): Promise<void> {
    await clearWorkingMemory(this.sessionId);
  }

  /**
   * Get escalation history for learning loop
   */
  async getEscalationHistory(): Promise<
    Array<{ decision: string; agent: string; timestamp: string }>
  > {
    const history = await this.get<
      Array<{ decision: string; agent: string; timestamp: string }>
    >('escalation_history');
    return history ?? [];
  }

  /**
   * Record an escalation decision for learning
   */
  async recordEscalation(decision: 'approved' | 'denied' | 'skipped', agent: string): Promise<void> {
    const history = await this.getEscalationHistory();
    history.push({
      decision,
      agent,
      timestamp: new Date().toISOString(),
    });
    // Keep last 50 decisions
    const trimmed = history.slice(-50);
    await this.set('escalation_history', trimmed);
  }

  /**
   * Get last run summary
   */
  async getLastRunSummary(): Promise<{ timestamp: string; summary: string } | null> {
    return this.get<{ timestamp: string; summary: string }>('last_run_summary');
  }

  /**
   * Set last run summary
   */
  async setLastRunSummary(summary: string): Promise<void> {
    await this.set('last_run_summary', {
      timestamp: new Date().toISOString(),
      summary,
    });
  }
}
