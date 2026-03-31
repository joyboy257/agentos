/**
 * MCP Client — Connect to Zapier MCP server for 8,000+ integrations
 * ARCHITECTURE-02-mcp-client.md
 *
 * Bearer token auth, manifest caching, tool name mapping, audit logging.
 * Tool calls go through executeTool middleware automatically.
 */

import { atomicTokenRefresh, TokenRefreshResult } from './token-refresh'
import { ManifestCache, MCPTool } from './manifest-cache'
import {
  mcpToolToCapability,
  getRequiredCapability,
  canInvokeTool,
} from './tool-mapper'
import { registry } from '@/lib/registry/capability-registry'
import type { Capability } from '@/lib/registry/types'

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class MCPClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable = false
  ) {
    super(message)
    this.name = 'MCPClientError'
  }
}

export class MCPServerError extends MCPClientError {
  constructor(message: string, code: string) {
    super(message, code, false)
    this.name = 'MCPServerError'
  }
}

export class MCPAuthError extends MCPClientError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', true)
    this.name = 'MCPAuthError'
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPToolCallResult {
  data: unknown
  errorCode?: string
}

export interface AuditLogEntry {
  userId: string
  toolName: string
  args: Record<string, unknown>
  idempotencyKey?: string
  timestamp: number
  status: 'success' | 'error' | 'blocked'
  errorCode?: string
}

// ---------------------------------------------------------------------------
// Audit log store (in-memory for MVP; replace with DB-backed store for production)
// ---------------------------------------------------------------------------

const auditLog: AuditLogEntry[] = []

function logToolCall(entry: AuditLogEntry): void {
  auditLog.push(entry)
}

export function getAuditLog(userId: string): AuditLogEntry[] {
  return auditLog.filter(e => e.userId === userId)
}

// ---------------------------------------------------------------------------
// MCPClient
// ---------------------------------------------------------------------------

export class MCPClient {
  private userId: string | null = null
  private bearerToken: string | null = null
  private endpoint: string
  private cache: ManifestCache
  private connected = false

  // Granted capabilities per user (e.g. from ToolPermissions)
  // In production this would come from a DB-backed permissions store
  private grantedCapabilities = new Map<string, Set<string>>()

  constructor(endpoint = 'https://mcp.zapier.com') {
    this.endpoint = endpoint
    this.cache = new ManifestCache()
  }

  /**
   * Connect to the Zapier MCP server with a bearer token.
   * Stores the token for subsequent tool calls.
   */
  async connect(userId: string, bearerToken: string): Promise<void> {
    this.userId = userId
    this.bearerToken = bearerToken
    this.connected = true
  }

  /**
   * Disconnect and clear cached state.
   */
  disconnect(): void {
    this.userId = null
    this.bearerToken = null
    this.connected = false
    this.cache.clear()
  }

  /**
   * List all available tools from the MCP manifest.
   * Returns tools from cache if manifestVersion is unchanged.
   */
  async listTools(): Promise<MCPTool[]> {
    this.assertConnected()

    const manifestVersion = await this.fetchManifestVersion()
    const cached = this.cache.get(manifestVersion)
    if (cached) return cached

    const tools = await this.fetchManifest()
    this.cache.set(manifestVersion, tools)
    return tools
  }

  /**
   * Call an MCP tool by name with arguments.
   * Enforces dangerous-tool capability checks and audit logging.
   *
   * @param name            - MCP tool name (e.g. "stripe.chargeCustomer")
   * @param args            - Tool arguments
   * @param idempotencyKey  - Optional idempotency key for write operations
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<MCPToolCallResult> {
    this.assertConnected()

    const userId = this.userId!
    const now = Date.now()

    // Check dangerous-tool capability requirement
    const requiredCapability = getRequiredCapability(name)
    if (requiredCapability !== null) {
      const granted = this.grantedCapabilities.get(userId) ?? new Set()
      if (!canInvokeTool(name, granted)) {
        logToolCall({
          userId,
          toolName: name,
          args: this.sanitizeArgs(args),
          idempotencyKey,
          timestamp: now,
          status: 'blocked',
          errorCode: 'CAPABILITY_REQUIRED',
        })
        throw new MCPClientError(
          `Tool '${name}' requires '${requiredCapability}' capability. Please request access.`,
          'CAPABILITY_REQUIRED',
          false
        )
      }
    }

    // Build JSON-RPC request
    const requestId = `req-${now}-${Math.random().toString(36).slice(2)}`
    const rpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        ...(idempotencyKey ? { meta: { idempotencyKey } } : {}),
      },
    }

    let response: Response
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`,
      }
      if (idempotencyKey) {
        headers['X-Idempotency-Key'] = idempotencyKey
      }

      response = await fetch(`${this.endpoint}/v1/tools/call`, {
        method: 'POST',
        headers,
        body: JSON.stringify(rpcRequest),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err: any) {
      logToolCall({
        userId,
        toolName: name,
        args: this.sanitizeArgs(args),
        idempotencyKey,
        timestamp: now,
        status: 'error',
        errorCode: 'NETWORK_ERROR',
      })
      throw new MCPClientError(
        `Network error calling tool '${name}': ${err.message}`,
        'NETWORK_ERROR',
        true
      )
    }

    // Handle 401 with token refresh attempt
    if (response.status === 401) {
      logToolCall({
        userId,
        toolName: name,
        args: this.sanitizeArgs(args),
        idempotencyKey,
        timestamp: now,
        status: 'error',
        errorCode: 'AUTH_ERROR',
      })
      throw new MCPAuthError('Bearer token expired or invalid. Please reconnect your account.')
    }

    // Respect X-Max-Payload-Size header
    const maxPayloadSize = response.headers.get('X-Max-Payload-Size')
    const bodySize = parseInt(response.headers.get('content-length') ?? '0', 10)
    if (maxPayloadSize && bodySize > parseInt(maxPayloadSize, 10)) {
      logToolCall({
        userId,
        toolName: name,
        args: this.sanitizeArgs(args),
        idempotencyKey,
        timestamp: now,
        status: 'error',
        errorCode: 'RESULT_PAYLOAD_TOO_LARGE',
      })
      throw new MCPServerError(
        `Tool '${name}' result exceeds maximum payload size (${maxPayloadSize} bytes).`,
        'RESULT_PAYLOAD_TOO_LARGE'
      )
    }

    let rpcResponse: any
    try {
      rpcResponse = await response.json()
    } catch {
      logToolCall({
        userId,
        toolName: name,
        args: this.sanitizeArgs(args),
        idempotencyKey,
        timestamp: now,
        status: 'error',
        errorCode: 'INVALID_RESPONSE',
      })
      throw new MCPClientError(
        `Invalid JSON-RPC response from tool '${name}'`,
        'INVALID_RESPONSE',
        false
      )
    }

    if (rpcResponse.error) {
      const errCode = rpcResponse.error.code ?? 'TOOL_ERROR'
      logToolCall({
        userId,
        toolName: name,
        args: this.sanitizeArgs(args),
        idempotencyKey,
        timestamp: now,
        status: 'error',
        errorCode: errCode,
      })
      // 5xx errors are retryable
      const retryable = response.status >= 500
      throw new MCPClientError(
        rpcResponse.error.message ?? `Tool '${name}' failed`,
        errCode,
        retryable
      )
    }

    logToolCall({
      userId,
      toolName: name,
      args: this.sanitizeArgs(args),
      idempotencyKey,
      timestamp: now,
      status: 'success',
    })

    return { data: rpcResponse.result }
  }

  /**
   * Register MCP tools as capabilities in the AgentOS capability registry.
   * Called after listTools() to populate the registry with MCP-sourced capabilities.
   */
  registerMCPToolsAsCapabilities(tools: MCPTool[]): void {
    for (const tool of tools) {
      const capId = mcpToolToCapability(tool.name) ?? `mcp:${tool.name}`
      const capability: Capability = {
        id: capId,
        description: tool.description ?? `MCP tool: ${tool.name}`,
        triggers: [`use ${tool.name.replace(/\./g, ' ')}`, tool.name],
        tools: [tool.name],
        inputSchema: (tool.inputSchema as any) ?? { type: 'object', properties: {} },
        outputSchema: (tool.outputSchema as any) ?? { type: 'object', properties: {} },
        approvalConfig: { approverType: 'none' },
        agentRole: capId.replace(/[^a-z_]/g, '_'),
      }
      registry.register(capability)
    }
  }

  /**
   * Grant a capability to a user (for dangerous tool access).
   */
  grantCapability(userId: string, capability: string): void {
    const existing = this.grantedCapabilities.get(userId) ?? new Set()
    existing.add(capability)
    this.grantedCapabilities.set(userId, existing)
  }

  /**
   * Revoke a capability from a user.
   */
  revokeCapability(userId: string, capability: string): void {
    const existing = this.grantedCapabilities.get(userId)
    if (existing) {
      existing.delete(capability)
    }
  }

  /**
   * Refresh the bearer token using atomic refresh lock.
   * Used when a 401 is received and the token may be expired.
   */
  async refreshToken(
    refreshToken: string,
    refreshFn: (token: string) => Promise<TokenRefreshResult>
  ): Promise<TokenRefreshResult> {
    if (!this.userId) throw new Error('Not connected')
    return atomicTokenRefresh(this.userId, refreshToken, refreshFn)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private assertConnected(): void {
    if (!this.connected || !this.bearerToken) {
      throw new MCPClientError('MCP client not connected. Call connect() first.', 'NOT_CONNECTED', false)
    }
  }

  private async fetchManifestVersion(): Promise<string> {
    const response = await fetch(`${this.endpoint}/v1/manifest`, {
      headers: {
        'Authorization': `Bearer ${this.bearerToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new MCPClientError(
        `Failed to fetch MCP manifest: ${response.status} ${response.statusText}`,
        'MANIFEST_FETCH_ERROR',
        true
      )
    }
    const manifest = await response.json()
    return manifest.manifestVersion ?? 'unknown'
  }

  private async fetchManifest(): Promise<MCPTool[]> {
    const response = await fetch(`${this.endpoint}/v1/manifest`, {
      headers: {
        'Authorization': `Bearer ${this.bearerToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new MCPClientError(
        `Failed to fetch MCP manifest: ${response.status} ${response.statusText}`,
        'MANIFEST_FETCH_ERROR',
        true
      )
    }
    const manifest = await response.json()
    return manifest.tools ?? []
  }

  /** Remove sensitive values from args before logging */
  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'authorization', 'creditCard', 'ssn']
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(args)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'string' && value.length > 200) {
        sanitized[key] = value.slice(0, 200) + '...'
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (per-user in production; here as convenience)
// ---------------------------------------------------------------------------

export const mcpClient = new MCPClient()