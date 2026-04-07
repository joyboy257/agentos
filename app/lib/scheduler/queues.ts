/**
 * Queue name constants for BullMQ parent-child orchestration.
 *
 * agentos-coordinator — parent jobs that orchestrate fan-out to child workers
 * agentos-workers     — child jobs that run individual agent executions
 */

export const COORDINATOR_QUEUE = 'agentos-coordinator'
export const WORKER_QUEUE = 'agentos-workers'
