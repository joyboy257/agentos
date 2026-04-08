/**
 * Startup Auto-Recovery
 *
 * When the server restarts:
 * 1. Any runs that were 'running' at death are detected and recovered
 * 2. All agents with schedule_cron are re-registered with BullMQ Repeater
 *
 * Recovery protocol:
 * 1. Find all runs with status = 'running'
 * 2. For each: call DurableRunner.resume(runId)
 *    - resume() will either complete the run or surface pending approvals
 * 3. Log recovery attempts
 * 4. Re-register all scheduled agents with BullMQ
 */

import { sql } from '@vercel/postgres';
import { DurableRunner } from './durable-runner';
import { registerAllScheduledAgents } from './proactive-scheduler';

const RECOVERY_LOG = '[Recovery]';

export async function recoverInterruptedRuns(): Promise<void> {
  // Find all runs that were interrupted (status = 'running' at shutdown)
  const interruptedRuns = await sql`
    SELECT id, agent_id, user_id FROM runs WHERE status = 'running'
  `;

  if (interruptedRuns.rows.length === 0) {
    console.log(`${RECOVERY_LOG} No interrupted runs found`);
    return;
  }

  console.log(
    `${RECOVERY_LOG} Found ${interruptedRuns.rows.length} interrupted run(s) to recover`
  );

  const runner = new DurableRunner();
  let recovered = 0;
  let failed = 0;

  for (const run of interruptedRuns.rows) {
    console.log(`${RECOVERY_LOG} Resuming run ${run.id} (agent: ${run.agent_id})`);

    try {
      const result = await runner.resume(run.id);
      console.log(
        `${RECOVERY_LOG} Run ${run.id} recovered: ${result.status}`
      );
      recovered++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${RECOVERY_LOG} Failed to resume run ${run.id}: ${message}`);

      // Mark as failed so it doesn't keep getting picked up
      await sql`UPDATE runs SET status = 'failed' WHERE id = ${run.id}`;
      failed++;
    }
  }

  console.log(
    `${RECOVERY_LOG} Recovery complete: ${recovered} recovered, ${failed} failed`
  );
}

/**
 * Re-register all agents with schedule_cron with BullMQ on startup.
 */
export async function recoverScheduledAgents(): Promise<void> {
  try {
    await registerAllScheduledAgents()
  } catch (err) {
    console.error(`${RECOVERY_LOG} Failed to register scheduled agents:`, err)
  }
}
