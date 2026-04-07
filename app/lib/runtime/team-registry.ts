/**
 * TeamRegistry + TaskRegistry — in-memory registries for multi-agent orchestration.
 *
 * Mirrors the task registry pattern from claw-code's team_cron_registry.rs.
 * Thread-safe for single-process Node.js use.
 *
 * Team status lifecycle: created → running → completed | deleted
 * Task status lifecycle: created → running → completed | failed | stopped
 */

import { ulid } from 'ulid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Team {
  team_id: string
  canvas_id: string
  name: string
  coordinator_session_id?: string
  task_ids: string[]
  status: 'created' | 'running' | 'completed' | 'deleted'
  created_at: number
  updated_at: number
}

export interface TaskMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface Task {
  task_id: string
  team_id: string
  agent_id: string
  parent_session_id?: string
  branch_name?: string
  status: 'created' | 'running' | 'completed' | 'failed' | 'stopped'
  output_artifact?: unknown
  messages: TaskMessage[]
  created_at: number
  updated_at: number
}

// ---------------------------------------------------------------------------
// TeamRegistry
// ---------------------------------------------------------------------------

export class TeamRegistry {
  private teams = new Map<string, Team>()

  create(canvasId: string, name: string, taskIds: string[] = []): Team {
    const teamId = ulid()
    const now = Date.now()
    const team: Team = {
      team_id: teamId,
      canvas_id: canvasId,
      name,
      task_ids: taskIds,
      status: 'created',
      created_at: now,
      updated_at: now,
    }
    this.teams.set(teamId, team)
    return team
  }

  get(teamId: string): Team | null {
    return this.teams.get(teamId) ?? null
  }

  list(): Team[] {
    return [...this.teams.values()].filter(t => t.status !== 'deleted')
  }

  updateStatus(teamId: string, status: Team['status']): void {
    const team = this.teams.get(teamId)
    if (!team) return
    team.status = status
    team.updated_at = Date.now()
  }

  delete(teamId: string): void {
    const team = this.teams.get(teamId)
    if (!team) return
    team.status = 'deleted'
    team.updated_at = Date.now()
  }

  setCoordinatorSession(teamId: string, sessionId: string): void {
    const team = this.teams.get(teamId)
    if (!team) return
    team.coordinator_session_id = sessionId
    team.updated_at = Date.now()
  }

  addTask(teamId: string, taskId: string): void {
    const team = this.teams.get(teamId)
    if (!team) return
    team.task_ids.push(taskId)
    team.updated_at = Date.now()
  }
}

// ---------------------------------------------------------------------------
// TaskRegistry
// ---------------------------------------------------------------------------

export class TaskRegistry {
  private tasks = new Map<string, Task>()

  create(task: Omit<Task, 'task_id' | 'created_at' | 'updated_at' | 'messages' | 'status'>): Task {
    const taskId = ulid()
    const now = Date.now()
    const fullTask: Task = {
      ...task,
      task_id: taskId,
      status: 'created',
      messages: [],
      created_at: now,
      updated_at: now,
    }
    this.tasks.set(taskId, fullTask)
    return fullTask
  }

  get(taskId: string): Task | null {
    return this.tasks.get(taskId) ?? null
  }

  list(teamId: string): Task[] {
    return [...this.tasks.values()].filter(t => t.team_id === teamId)
  }

  updateStatus(taskId: string, status: Task['status']): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.status = status
    task.updated_at = Date.now()
  }

  setOutput(taskId: string, artifact: unknown): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.output_artifact = artifact
    task.updated_at = Date.now()
  }

  addMessage(taskId: string, message: TaskMessage): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.messages.push(message)
    task.updated_at = Date.now()
  }

  stop(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    if (task.status === 'created' || task.status === 'running') {
      task.status = 'stopped'
      task.updated_at = Date.now()
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

export const teamRegistry = new TeamRegistry()
export const taskRegistry = new TaskRegistry()
