/**
 * agent-worker.js — Entry point for sandboxed worker agents.
 *
 * Run as: node workers/agent-worker.js <task_id> <agent_id> <session_id>
 *
 * This is a standalone Node.js script (not a Next.js route).
 * It is spawned by WorkerRegistry as a subprocess with sandbox constraints.
 *
 * Responsibilities:
 * 1. Read AGENT_SESSION_ID, AGENT_TOOLS from env
 * 2. Wait for context on stdin (agent prompt + tools config)
 * 3. Execute agent (call LLM with tools, stream reasoning)
 * 4. On completion: emit lane.completed event via fetch to SSE endpoint
 * 5. Exit cleanly
 */

'use strict'

const { spawn } = require('child_process')
const env = process.env

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const taskId = env.AGENT_TASK_ID || ''
const agentId = env.AGENT_AGENT_ID || ''
const sessionId = env.AGENT_SESSION_ID || ''
const teamId = env.AGENT_TEAM_ID || ''

// Validate required env vars
if (!taskId || !agentId || !sessionId) {
  console.error('agent-worker: missing required env vars: AGENT_TASK_ID, AGENT_AGENT_ID, AGENT_SESSION_ID')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Sandbox status helpers (inline, no TS)
// ---------------------------------------------------------------------------

function getSandboxStatus() {
  const platform = process.platform
  const containerized = isContainerized()
  const mode = env.CLAWD_SANDBOX_FILESYSTEM_MODE || 'workspace_only'
  const isolated = platform === 'linux' && containerized
  return { isolated, filesystemMode: mode, platform, containerized }
}

function isContainerized() {
  try {
    require('fs').readFileSync('/.dockerenv')
    return true
  } catch (_) {}

  try {
    require('fs').readFileSync('/run/.containerenv')
    return true
  } catch (_) {}

  if (
    env.CONTAINER_ID ||
    env.DOCKER_CONTAINER ||
    env.KUBERNETES_SERVICE_HOST
  ) {
    return true
  }

  try {
    const cgroup = require('fs').readFileSync('/proc/1/cgroup', 'utf8')
    if (/docker|containerd|kubepods|podman|libpod/i.test(cgroup)) return true
  } catch (_) {}

  return false
}

// ---------------------------------------------------------------------------
// Lane event emission via fetch to SSE endpoint
// ---------------------------------------------------------------------------

async function emitLaneEvent(event) {
  const endpoint = env.LANE_EVENTS_ENDPOINT || 'http://localhost:3000/api/teams/lane-events'
  const url = teamId ? `${endpoint}?teamId=${teamId}` : endpoint

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
  } catch (err) {
    console.warn(`[agent-worker] failed to emit lane event ${event.type}:`, err)
  }
}

// ---------------------------------------------------------------------------
// Agent execution (placeholder — plug in actual streaming tool executor)
// ---------------------------------------------------------------------------

async function executeAgent(context) {
  // TODO: Integrate with streamingToolExecutor for actual LLM+tools execution
  // For now this is a stub that simulates agent work.
  console.log(`[agent-worker] executing prompt: ${String(context.prompt).substring(0, 80)}...`)

  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 100))

  return {
    type: 'agent_output',
    summary: `Agent ${agentId} completed`,
    prompt: context.prompt,
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  // Emit lane.started
  await emitLaneEvent({
    type: 'lane.started',
    task_id: taskId,
    agent_id: agentId,
    team_id: teamId,
    status: 'running',
    timestamp: Date.now(),
  })

  // Log sandbox status on startup
  const sandbox = getSandboxStatus()
  console.log(
    `[agent-worker] sandbox: isolated=${sandbox.isolated} mode=${sandbox.filesystemMode} containerized=${sandbox.containerized}`
  )

  // Wait for context on stdin
  let rawContext = ''
  for await (const chunk of process.stdin) {
    rawContext += chunk
  }

  let context
  try {
    context = JSON.parse(rawContext.trim())
  } catch (err) {
    console.error('agent-worker: failed to parse context from stdin:', err)
    await emitLaneEvent({
      type: 'lane.failed',
      task_id: taskId,
      agent_id: agentId,
      team_id: teamId,
      status: 'failed',
      timestamp: Date.now(),
      payload: { error: 'Failed to parse context' },
    })
    process.exit(1)
  }

  console.log(`[agent-worker] task=${taskId} agent=${agentId} tools=${context.tools ? context.tools.length : 0}`)

  try {
    const result = await executeAgent(context)

    // Emit lane.completed with output artifact
    await emitLaneEvent({
      type: 'lane.completed',
      task_id: taskId,
      agent_id: agentId,
      team_id: teamId,
      status: 'completed',
      timestamp: Date.now(),
      payload: {
        artifact: result,
        steps_completed: 0,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`agent-worker: execution failed: ${message}`)
    await emitLaneEvent({
      type: 'lane.failed',
      task_id: taskId,
      agent_id: agentId,
      team_id: teamId,
      status: 'failed',
      timestamp: Date.now(),
      payload: { error: message },
    })
    process.exit(1)
  }

  process.exit(0)
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

main().catch(err => {
  console.error('agent-worker: unhandled error:', err)
  process.exit(1)
})
