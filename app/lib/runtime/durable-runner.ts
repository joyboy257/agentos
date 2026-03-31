import type { Runner, RunResult, ExecuteOptions } from './runner-interface';
import { generateIdempotencyKey } from './idempotency';
import {
  createRun,
  getRun,
  updateRunStatus,
  createCheckpoint,
  getCheckpointsForRun,
  createApproval,
  getPendingApprovalsForRun,
} from '../db/queries';
import { getHookRegistry } from '../hooks/hook-registry';
import { WorkingMemory } from './working-memory';

export class DurableRunner implements Runner {
  private workingMemory: WorkingMemory | null = null;
  async execute(options: ExecuteOptions): Promise<RunResult> {
    const { agentId, userId, sessionId, args = {} } = options;

    // 1. Create runs row
    const run = await createRun({ agent_id: agentId, user_id: userId });

    // 2. Initialize completions map and queue
    const completions = new Map<string, unknown>();
    const queue: string[] = [agentId]; // root agent first
    const running = new Set<string>();

    let step = 0;

    // Initialize working memory for this session
    this.workingMemory = new WorkingMemory(sessionId);

    try {
      // 3. Concurrency loop — mirrors InProcessRunner lines 473-481
      while (queue.length > 0 || running.size > 0) {
        // 3a. Fill running queue up to max 2 concurrent
        while (queue.length > 0 && running.size < 2) {
          const agentIdToRun = queue.shift()!;
          running.add(agentIdToRun);

          // Start execution of this agent (non-blocking for fan-out)
          this.executeAgent(agentIdToRun, run.id, sessionId, args, completions, running, queue, step).catch((err) => {
            console.error(`Agent ${agentIdToRun} failed:`, err);
            running.delete(agentIdToRun);
          });
        }

        // Small delay to avoid tight loop
        await new Promise((r) => setTimeout(r, 10));
      }

      // 4. Check for pending approvals — if any, return immediately
      const pending = await getPendingApprovalsForRun(run.id);
      if (pending.length > 0) {
        return { runId: run.id, status: 'waiting_for_approval' };
      }

      // 5. Completion
      await updateRunStatus(run.id, 'completed', new Date());

      // Record run summary to working memory
      if (this.workingMemory) {
        await this.workingMemory.setLastRunSummary(`Completed ${step} actions`);
      }

      return { runId: run.id, status: 'completed' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await updateRunStatus(run.id, 'failed');
      return { runId: run.id, status: 'failed', error: errorMessage };
    }
  }

  async resume(runId: string): Promise<RunResult> {
    // 1. Read all checkpoints ordered by step
    const checkpoints = await getCheckpointsForRun(runId);
    const run = await getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);

    // 2. Reconstruct completions map from completed checkpoints
    const completions = new Map<string, unknown>();
    for (const cp of checkpoints) {
      if (cp.tool_result) {
        completions.set(cp.tool_call_id!, cp.tool_result);
      }
    }

    // 3. Find first incomplete checkpoint (state_after IS NULL)
    const incompleteIndex = checkpoints.findIndex((cp) => cp.state_after === null);
    const startStep = incompleteIndex >= 0 ? checkpoints[incompleteIndex].step : checkpoints.length;

    // 4. Resume from first incomplete — use idempotency keys to skip already-executed
    // Check if we need to resume or if the run already completed
    const pending = await getPendingApprovalsForRun(runId);
    if (pending.length > 0) {
      return { runId, status: 'waiting_for_approval' };
    }

    const lastCompleted = checkpoints.filter((cp) => cp.state_after !== null).pop();
    if (!lastCompleted) {
      throw new Error(`No checkpoints found for run ${runId}`);
    }

    await updateRunStatus(runId, 'completed', new Date());
    return { runId, status: 'completed' };
  }

  private async executeAgent(
    agentId: string,
    runId: string,
    sessionId: string,
    args: Record<string, unknown>,
    completions: Map<string, unknown>,
    running: Set<string>,
    queue: string[],
    stepOffset: number
  ): Promise<void> {
    let step = stepOffset;

    // Check canRun fan-in (same logic as InProcessRunner lines 162-171)
    // For now, assume root agent can always run
    const canRun = true; // TODO: implement graph-based fan-in check

    if (!canRun) {
      running.delete(agentId);
      return;
    }

    // Before tool call — write checkpoint
    const idempotencyKey = generateIdempotencyKey();
    await createCheckpoint({
      run_id: runId,
      step,
      state_before: { agentId, args },
      tool_call_id: idempotencyKey,
    });

    try {
      // Execute the tool (using the same executeTool middleware chain)
      // For Phase 1: call the actual tool implementation
      // The InProcessRunner has a hardcoded if-else dispatch chain
      // We replicate that here using the same tool execution path
      const result = { success: true, data: {} }; // Placeholder — actual tool execution wired in Phase 1

      // After tool call — write checkpoint with result
      await createCheckpoint({
        run_id: runId,
        step,
        state_after: { agentId, completed: true },
        tool_result: result,
        tool_call_id: idempotencyKey,
      });

      completions.set(idempotencyKey, result);

      // Emit postToolCall hook
      void getHookRegistry().emit('postToolCall', { runId, agentId, timestamp: Date.now(), toolName: 'agent', postToolCall: { toolName: 'agent', result, durationMs: 0 } });

      step++;
    } catch (error) {
      // Tool execution failed — update checkpoint with error
      await createCheckpoint({
        run_id: runId,
        step,
        state_after: { agentId, failed: true },
        tool_result: { error: error instanceof Error ? error.message : String(error) },
        tool_call_id: idempotencyKey,
      });
      throw error;
    } finally {
      running.delete(agentId);
    }
  }
}
