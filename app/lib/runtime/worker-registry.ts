/**
 * WorkerRegistry — manages worker subprocess lifecycle for multi-agent orchestration.
 *
 * State machine transitions:
 *   spawning → trust_required (trust prompt detected) → ready ("Ready for input" detected) → running → completed/failed
 *   spawning → ready (no trust required) → running
 *   any → stopped (if stop() called)
 *
 * Based on claw-code's worker_boot.rs patterns.
 */

import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkerStatus =
  | 'spawning'
  | 'trust_required'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'

export type WorkerFailureKind = 'compile' | 'test' | 'mcp_startup' | 'infra' | 'unknown'

export interface WorkerFailure {
  kind: WorkerFailureKind
  message: string
}

export interface WorkerEvent {
  at: number
  status: WorkerStatus
  detail?: string
}

export interface Worker {
  worker_id: string
  task_id: string
  agent_id: string
  cwd: string
  status: WorkerStatus
  child?: ChildProcess
  failure?: WorkerFailure
  events: WorkerEvent[]
  replay_prompt?: string
  created_at: number
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function generateUlid(): string {
  // Simple ULID-compatible ID generation (prefix + random)
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let str = '01'
  for (let i = 0; i < 25; i++) {
    str += chars[Math.floor(Math.random() * chars.length)]
  }
  return str
}

// ---------------------------------------------------------------------------
// WorkerRegistry
// ---------------------------------------------------------------------------

export class WorkerRegistry {
  private workers = new Map<string, Worker>()

  /**
   * Create a new worker in 'spawning' state and start the subprocess.
   *
   * @param taskId   The task this worker is executing
   * @param agentId  The agent this worker is running
   * @param cwd      Working directory for the subprocess
   */
  create(taskId: string, agentId: string, cwd: string): Worker {
    const workerId = generateUlid()
    const entryPoint = join(cwd, 'workers', 'agent-worker.js')

    const child = spawn('node', [entryPoint, taskId, agentId, generateUlid()], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAWD_SANDBOX_FILESYSTEM_MODE: process.env.SANDBOX_FILESYSTEM_MODE ?? 'workspace-only',
      },
    })

    const worker: Worker = {
      worker_id: workerId,
      task_id: taskId,
      agent_id: agentId,
      cwd,
      status: 'spawning',
      child,
      events: [{ at: Date.now(), status: 'spawning' }],
      created_at: Date.now(),
    }

    this.workers.set(workerId, worker)

    // Pipe stdout/stderr so we can observe terminal output for ready/trust cues
    child.stdout?.on('data', (data: Buffer) => {
      this._observeOutput(workerId, data.toString())
    })
    child.stderr?.on('data', (data: Buffer) => {
      this._observeOutput(workerId, data.toString())
    })

    child.on('exit', (code, signal) => {
      const w = this.workers.get(workerId)
      if (!w) return
      if (w.status === 'running' || w.status === 'ready') {
        // Unexpected exit before completed/failed — mark as failed
        this._transitionTo(workerId, 'failed')
        w.failure = {
          kind: 'infra',
          message: `Worker exited unexpectedly: code=${code} signal=${signal}`,
        }
      }
      // If already completed/stopped/failed, do nothing
    })

    return worker
  }

  get(workerId: string): Worker | null {
    return this.workers.get(workerId) ?? null
  }

  list(taskId?: string): Worker[] {
    if (taskId) {
      return [...this.workers.values()].filter(w => w.task_id === taskId)
    }
    return [...this.workers.values()]
  }

  updateStatus(workerId: string, status: WorkerStatus): void {
    const w = this.workers.get(workerId)
    if (!w) return
    this._transitionTo(workerId, status)
  }

  recordFailure(workerId: string, kind: WorkerFailureKind, message: string): void {
    const w = this.workers.get(workerId)
    if (!w) return
    w.failure = { kind, message }
    this._transitionTo(workerId, 'failed')
  }

  /**
   * Observe terminal output from a worker and update its status based on
   * detected cues. Returns the detected status.
   */
  observe(workerId: string, text: string): WorkerStatus {
    const w = this.workers.get(workerId)
    if (!w) return 'spawning'

    // Trust prompt detection
    if (w.status === 'spawning' || w.status === 'trust_required') {
      if (/do you trust|allow.*path|approve.*directory|trust.*prompt/i.test(text)) {
        this._transitionTo(workerId, 'trust_required')
        // Attempt auto-approval for known paths
        this._autoResolveTrust(workerId, text)
        return 'trust_required'
      }
    }

    // Ready signal detection
    if (w.status === 'spawning' || w.status === 'trust_required' || w.status === 'ready') {
      if (/ready for input|waiting for prompt|agent ready/i.test(text)) {
        this._transitionTo(workerId, 'ready')
        return 'ready'
      }
    }

    return w.status
  }

  /**
   * Send a JSON-serializable prompt/context to the worker over stdin.
   */
  sendPrompt(workerId: string, context: Record<string, unknown>): void {
    const w = this.workers.get(workerId)
    if (!w?.child?.stdin) return
    w.replay_prompt = JSON.stringify(context)
    w.child.stdin.write(JSON.stringify(context) + '\n')
    // Mark as running once prompt is sent
    if (w.status === 'ready') {
      this._transitionTo(workerId, 'running')
    }
  }

  isReady(workerId: string): boolean {
    return this.get(workerId)?.status === 'ready'
  }

  isTrustRequired(workerId: string): boolean {
    return this.get(workerId)?.status === 'trust_required'
  }

  /**
   * Resolve the current trust prompt by approving all requested paths.
   * Auto-approves paths under HOME or /Users/deon/agentos/app.
   */
  resolveTrust(workerId: string): void {
    const w = this.workers.get(workerId)
    if (!w || w.status !== 'trust_required') return

    // Collect paths from the replay_prompt if available
    const paths: string[] = []
    if (w.replay_prompt) {
      try {
        const ctx = JSON.parse(w.replay_prompt)
        if (Array.isArray(ctx.trustPaths)) {
          paths.push(...ctx.trustPaths)
        }
      } catch {
        // ignore parse errors
      }
    }

    // Approve auto-approved paths and write approval back
    const approved = paths.filter(p => this._isAutoApproved(p))
    if (approved.length > 0 && w.child?.stdin) {
      w.child.stdin.write(JSON.stringify({ trust_approved: approved }) + '\n')
    }

    // After resolving trust, wait for ready signal in next observe call
  }

  /**
   * Stop a worker and its subprocess.
   */
  stop(workerId: string): void {
    const w = this.workers.get(workerId)
    if (!w) return

    // Kill process group on Unix (kill whole group)
    if (w.child?.pid) {
      try {
        process.kill(-w.child.pid, 'SIGTERM')
      } catch {
        // Fall back to direct kill
        w.child.kill('SIGTERM')
      }
    } else {
      w.child?.kill('SIGTERM')
    }

    this._transitionTo(workerId, 'stopped')
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _transitionTo(workerId: string, status: WorkerStatus): void {
    const w = this.workers.get(workerId)
    if (!w) return
    if (w.status === status) return
    if (w.status === 'stopped' || w.status === 'completed' || w.status === 'failed') return

    w.status = status
    w.events.push({ at: Date.now(), status })
  }

  /**
   * Auto-approve paths under HOME or /Users/deon/agentos/app.
   */
  private _isAutoApproved(path: string): boolean {
    const home = process.env.HOME ?? ''
    const workspace = '/Users/deon/agentos/app'
    return (
      path.startsWith(home) ||
      path.startsWith(workspace) ||
      path.startsWith('/tmp')
    )
  }

  private _autoResolveTrust(workerId: string, _text: string): void {
    // Attempt immediate trust resolution if all requested paths are auto-approved
    const w = this.workers.get(workerId)
    if (!w || w.status !== 'trust_required') return

    // Send trust resolution
    if (w.child?.stdin) {
      w.child.stdin.write(JSON.stringify({ trust_approved: [] }) + '\n')
    }
  }

  private _observeOutput(workerId: string, text: string): void {
    // Update status based on terminal output cues
    const w = this.workers.get(workerId)
    if (!w) return

    this.observe(workerId, text)

    // Detect failures
    if (/error|panic|failed/i.test(text)) {
      if (w.status !== 'failed' && w.status !== 'stopped') {
        if (/compilation|compile/i.test(text)) {
          this.recordFailure(workerId, 'compile', text)
        } else if (/test/i.test(text)) {
          this.recordFailure(workerId, 'test', text)
        } else if (/mcp|mcp_startup/i.test(text)) {
          this.recordFailure(workerId, 'mcp_startup', text)
        } else {
          this.recordFailure(workerId, 'unknown', text)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const workerRegistry = new WorkerRegistry()
