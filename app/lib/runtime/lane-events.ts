/**
 * LaneEvent types and emitter for inter-agent communication.
 * Based on claw-code's lane_events.rs patterns.
 *
 * These events power the SSE stream that the Team Lead and canvas UI subscribe to
 * in order to observe worker progress in real-time.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LaneEventName =
  | 'lane.started'
  | 'lane.progress'
  | 'lane.blocked'
  | 'lane.commit_created'
  | 'lane.merged'
  | 'lane.completed'
  | 'lane.failed'
  | 'lane.waiting'

export type LaneEventStatus = 'running' | 'blocked' | 'green' | 'failed' | 'completed'

export interface LaneEventPayload {
  step?: number
  tool_name?: string
  tool_input?: Record<string, unknown>
  artifact?: unknown
  error?: string
  commit_sha?: string
  steps_completed?: number
  tokens_used?: number
}

export interface LaneEvent {
  type: LaneEventName
  team_id: string
  task_id: string
  agent_id: string
  status: LaneEventStatus
  timestamp: number
  payload?: LaneEventPayload
}

type LaneEventHandler = (event: LaneEvent) => void

// ---------------------------------------------------------------------------
// Redis pub/sub for cross-process lane events (BullMQ child jobs)
// ---------------------------------------------------------------------------

let redisPub: import('ioredis').Redis | null = null
let redisSub: import('ioredis').Redis | null = null

function getRedisPub(): import('ioredis').Redis {
  if (!redisPub) {
    const { getRedisConnection } = require('../scheduler/client')
    redisPub = getRedisConnection().duplicate() as import('ioredis').Redis
  }
  return redisPub!
}

function getRedisSub(): import('ioredis').Redis {
  if (!redisSub) {
    const { getRedisConnection } = require('../scheduler/client')
    redisSub = getRedisConnection().duplicate() as import('ioredis').Redis
  }
  return redisSub!
}

/** Channel prefix for a team's lane events on Redis. */
function teamChannel(teamId: string): string {
  return `lane-events:${teamId}`
}

// ---------------------------------------------------------------------------
// In-memory event bus (singleton per team)
// ---------------------------------------------------------------------------

// Map<teamId, Set<LaneEventHandler>>
export const laneEventBus = new Map<string, Set<LaneEventHandler>>()

// Map<teamId, Set<LaneEventHandler>> — Redis subscribers per team
const redisBus = new Map<string, Set<LaneEventHandler>>()

function subscribeToRedisChannel(tid: string): void {
  const ch = teamChannel(tid)
  const sub = getRedisSub()
  void sub.subscribe(ch).then((result: unknown) => {
    if (result !== 'subscribe') {
      console.warn(`[LaneEvents] Failed to subscribe to Redis channel ${ch}: ${result}`)
    }
  })
  sub.on('message', (channel: string, message: string) => {
    if (channel !== ch) return
    try {
      const event: LaneEvent = JSON.parse(message)
      const handlers = laneEventBus.get(tid)
      if (handlers) {
        for (const handler of handlers) {
          try { handler(event) } catch { /* ignore */ }
        }
      }
    } catch { /* ignore malformed messages */ }
  })
}

// ---------------------------------------------------------------------------
// LaneEventEmitter
// ---------------------------------------------------------------------------

export class LaneEventEmitter {
  constructor(private readonly teamId: string) {}

  /**
   * Emit a lane event — fires and forgets to all SSE subscribers for this team.
   */
  emit(event: LaneEvent): void {
    const handlers = laneEventBus.get(this.teamId)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event)
        } catch (err) {
          console.error(`[LaneEvents] Handler error for team ${this.teamId}:`, err)
        }
      }
    }
    // Also publish to Redis so BullMQ child job workers can receive events
    try {
      const pub = getRedisPub()
      void pub.publish(teamChannel(this.teamId), JSON.stringify(event))
    } catch (err) {
      console.warn(`[LaneEvents] Failed to publish event to Redis:`, err)
    }
  }

  /**
   * Subscribe to lane events for this team.
   * Returns an unsubscribe function.
   */
  subscribe(handler: LaneEventHandler): () => void {
    if (!laneEventBus.has(this.teamId)) {
      laneEventBus.set(this.teamId, new Set())
    }
    // Also ensure Redis subscriber is active for this team
    if (!redisBus.has(this.teamId)) {
      redisBus.set(this.teamId, new Set())
      subscribeToRedisChannel(this.teamId)
    }
    const handlers = laneEventBus.get(this.teamId)!
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        laneEventBus.delete(this.teamId)
        redisBus.delete(this.teamId)
      }
    }
  }

  /**
   * Emit a lane.started event.
   */
  started(taskId: string, agentId: string): void {
    this.emit({
      type: 'lane.started',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'running',
      timestamp: Date.now(),
    })
  }

  /**
   * Emit a lane.progress event.
   */
  progress(taskId: string, agentId: string, step: number, toolName: string): void {
    this.emit({
      type: 'lane.progress',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'running',
      timestamp: Date.now(),
      payload: { step, tool_name: toolName },
    })
  }

  /**
   * Emit a lane.blocked event.
   */
  blocked(taskId: string, agentId: string, reason: string): void {
    this.emit({
      type: 'lane.blocked',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'blocked',
      timestamp: Date.now(),
      payload: { error: reason },
    })
  }

  /**
   * Emit a lane.commit_created event.
   */
  commitCreated(
    taskId: string,
    agentId: string,
    artifact: unknown,
    commitSha: string,
    stepsCompleted: number,
    tokensUsed: number
  ): void {
    this.emit({
      type: 'lane.commit_created',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'green',
      timestamp: Date.now(),
      payload: { artifact, commit_sha: commitSha, steps_completed: stepsCompleted, tokens_used: tokensUsed },
    })
  }

  /**
   * Emit a lane.merged event.
   */
  merged(taskId: string, agentId: string): void {
    this.emit({
      type: 'lane.merged',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'green',
      timestamp: Date.now(),
    })
  }

  /**
   * Emit a lane.completed event.
   */
  completed(
    taskId: string,
    agentId: string,
    artifact: unknown,
    stepsCompleted: number,
    tokensUsed: number
  ): void {
    this.emit({
      type: 'lane.completed',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'completed',
      timestamp: Date.now(),
      payload: { artifact, steps_completed: stepsCompleted, tokens_used: tokensUsed },
    })
  }

  /**
   * Emit a lane.failed event.
   */
  failed(taskId: string, agentId: string, error: string): void {
    this.emit({
      type: 'lane.failed',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'failed',
      timestamp: Date.now(),
      payload: { error },
    })
  }

  /**
   * Emit a lane.waiting event — agent is queued, waiting for upstream dependencies.
   */
  waiting(taskId: string, agentId: string): void {
    this.emit({
      type: 'lane.waiting',
      team_id: this.teamId,
      task_id: taskId,
      agent_id: agentId,
      status: 'blocked',
      timestamp: Date.now(),
    })
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Get (or create) a LaneEventEmitter for a team.
 */
export function getLaneEmitter(teamId: string): LaneEventEmitter {
  return new LaneEventEmitter(teamId)
}
