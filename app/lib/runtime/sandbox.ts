/**
 * Sandbox isolation for worker subprocesses.
 *
 * Based on claw-code's sandbox.rs patterns:
 * - Linux: uses `unshare` for namespace isolation
 * - macOS (Darwin): spawns normally — workspace-only enforcement happens in worker
 *
 * Filesystem modes:
 * - off: No restriction
 * - workspace_only: Only $CANVAS_DIR and /tmp are accessible
 * - allow_list: Only configured mount points are accessible
 */

import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SandboxFilesystemMode = 'off' | 'workspace_only' | 'allow_list'

export interface SandboxOptions {
  /** Working directory for the subprocess */
  cwd: string
  /** Filesystem isolation mode (default: workspace_only) */
  filesystemMode?: SandboxFilesystemMode
  /** Explicit list of allowed mount points (for allow_list mode) */
  allowedMounts?: string[]
}

export interface SandboxStatus {
  isolated: boolean
  filesystemMode: SandboxFilesystemMode
  platform: NodeJS.Platform
  containerized: boolean
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawn a sandboxed child process with optional namespace isolation.
 *
 * On Linux: uses `unshare` for user/mount/ipc/pid/uts namespaces.
 *   - Passes filesystem mode via CLAWD_SANDBOX_FILESYSTEM_MODE env var.
 *
 * On Darwin/macOS: spawns normally (no namespace isolation available).
 *   - Filesystem mode is still passed so the worker can enforce it.
 *
 * @param entryPoint  Path to the worker entry point (e.g. workers/agent-worker.js)
 * @param args        Command-line args for the entry point
 * @param options     Sandbox configuration
 * @returns Child process handle
 */
export async function spawnSandboxed(
  entryPoint: string,
  args: string[],
  options: SandboxOptions
): Promise<ChildProcess> {
  const { cwd, filesystemMode = 'workspace_only', allowedMounts = [] } = options

  const mode = filesystemMode
  const platform = process.platform

  if (platform === 'linux') {
    return _spawnLinuxUnshare(entryPoint, args, { cwd, mode, allowedMounts })
  }

  // Darwin / Win32 — no namespace isolation available; spawn normally
  return spawn('node', [entryPoint, ...args], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLAWD_SANDBOX_FILESYSTEM_MODE: mode,
      CLAWD_SANDBOX_ALLOWED_MOUNTS: allowedMounts.join(','),
    },
  })
}

/**
 * Returns the current sandbox status for this process.
 */
export function getSandboxStatus(): SandboxStatus {
  const platform = process.platform
  const containerized_ = isContainerized()

  // Sandbox is truly isolated only on Linux with unshare
  const mode = (process.env.CLAWD_SANDBOX_FILESYSTEM_MODE ?? 'workspace_only') as SandboxFilesystemMode
  const isolated = platform === 'linux' && containerized_

  return {
    isolated,
    filesystemMode: mode,
    platform,
    containerized: containerized_,
  }
}

/**
 * Check whether the current process is running inside a container
 * (Docker, Podman, Kubernetes, etc.)
 */
export function isContainerized(): boolean {
  // Docker
  if (existsSync('/.dockerenv')) return true

  // Containerd / container runtimes
  if (existsSync('/run/.containerenv')) return true

  // Environment variables set by popular container runtimes
  if (
    process.env.CONTAINER_ID ||
    process.env.DOCKER_CONTAINER ||
    process.env.KUBERNETES_SERVICE_HOST
  ) {
    return true
  }

  // /proc/1/cgroup — check for container markers
  try {
    const cgroup = require('fs').readFileSync('/proc/1/cgroup', 'utf8')
    if (
      /docker|containerd|kubepods|podman|libpod/i.test(cgroup)
    ) {
      return true
    }
  } catch {
    // Not Linux or not readable — ignore
  }

  return false
}

// ---------------------------------------------------------------------------
// Linux: unshare-based namespace isolation
// ---------------------------------------------------------------------------

interface LinuxSpawnOptions {
  cwd: string
  mode: SandboxFilesystemMode
  allowedMounts: string[]
}

async function _spawnLinuxUnshare(
  entryPoint: string,
  args: string[],
  options: LinuxSpawnOptions
): Promise<ChildProcess> {
  const { cwd, mode, allowedMounts } = options

  // Check if unshare is available
  const unshareExists = await _commandExists('unshare')
  if (!unshareExists) {
    console.warn('[Sandbox] unshare not available on Linux — falling back to plain spawn')
    return spawn('node', [entryPoint, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAWD_SANDBOX_FILESYSTEM_MODE: mode,
        CLAWD_SANDBOX_ALLOWED_MOUNTS: allowedMounts.join(','),
      },
    })
  }

  // Build unshare command for namespace isolation:
  // --user        : new user namespace
  // --mount       : new mount namespace
  // --ipc         : new IPC namespace
  // --pid         : new PID namespace
  // --uts         : new UTS namespace (hostname)
  // --map-root-user: map current user as root in the new namespace
  // --mount-proc  : mount /proc inside the PID namespace
  // --fork        : fork before unshare (required for some namespaces)
  const unshareArgs = [
    '--user',
    '--mount',
    '--ipc',
    '--pid',
    '--uts',
    '--map-root-user',
    '--mount-proc',
    '--fork',
    '--',
    'node',
    entryPoint,
    ...args,
  ]

  return spawn('unshare', unshareArgs, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLAWD_SANDBOX_FILESYSTEM_MODE: mode,
      CLAWD_SANDBOX_ALLOWED_MOUNTS: allowedMounts.join(','),
    },
  })
}

async function _commandExists(cmd: string): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('which', [cmd], { stdio: ['ignore', 'ignore', 'ignore'] })
    proc.on('close', code => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}
