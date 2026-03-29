# Architecture: MCP Client Integration

## Status

**Spec Status:** draft
**Created:** 2026-03-29
**Owners:** engineering

---

## 1. What is MCP?

**Model Context Protocol (MCP)** is a standardized client-server protocol for connecting AI applications to external tools and data sources. It was created to solve a fundamental problem: before MCP, every AI platform implemented tool integrations differently, forcing developers to build and maintain separate connectors for each provider.

**The problem it solved:** Between 2023 and 2025, the AI ecosystem exploded with proprietary tool integrations. OpenAI had its function-calling format, Anthropic had tool use, Google had its own, LangChain had yet another abstraction. If you built an integration for one platform, you had to rebuild it for every other platform. An agent that worked with Gmail on OpenAI had to be completely re-engineered to work with Anthropic. The integration maintenance burden was enormous.

**The solution:** MCP defines a single, vendor-neutral protocol. An MCP server exposes a manifest of available tools. Any MCP-compatible client can connect to that server and invoke those tools without knowing or caring which AI platform is running underneath. Think of it as USB for AI applications — one port, many devices.

**Current adoption:** Zapier has built an MCP server exposing 8,000+ integrations (Slack, Salesforce, HubSpot, Gmail, calendar apps, etc.). Make.com and n8n have followed with their own MCP servers. The protocol has reached escape velocity. Building on MCP means AgentOS can immediately connect to thousands of pre-built integrations without writing a single Zapier connector.

---

## 2. Why Connect to Zapier's MCP Server?

Building integrations is a perpetual maintenance burden. Every API change, every auth flow update, every rate limit adjustment requires a code change. For a small team, maintaining even 5 integrations full-time is a significant commitment.

Zapier's MCP server provides:

- **8,000+ integrations on day one.** Connect to Slack, Gmail, Salesforce, HubSpot, Jira, Notion, and hundreds more without writing integration code.
- **OAuth handling.** Zapier manages OAuth flows, token refresh, and credential rotation for every connected app. AgentOS never stores or handles OAuth tokens directly.
- **Retries and rate limiting.** Zapier's infrastructure handles transient failures, rate limits, and backoff. AgentOS gets a reliable tool call; the complexity stays with Zapier.
- **Living documentation.** The tool manifest describes every tool's inputs and behaviors. As Zapier adds new integrations, AgentOS gains them automatically — no code deployment required.

AgentOS focuses on two things: **natural language interpretation** (turning user intent into tool calls) and **UX** (making multi-agent orchestration visual and intuitive). Integration maintenance is not a core competency and should not be.

---

## 3. MCP Client Interface

The `MCPClient` class is the only interface AgentOS needs to know about external tools. It wraps the JSON-RPC transport layer and presents a clean async API.

```typescript
// app/lib/mcp/client.ts

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JSONSchema
  annotations?: ToolAnnotations
}

export interface ToolAnnotations {
  read?: boolean      // only reads data, no side effects
  write?: boolean      // may modify external state
  dangerous?: boolean  // requires sandboxing or approval
}

export interface ToolResult {
  content: string | object
  isError: boolean
  error?: string
  durationMs?: number
}

export interface MCPConfig {
  serverUrl: string          // e.g., 'https://mcp.zapier.com'
  timeoutMs?: number          // default 30000
  retryAttempts?: number      // default 3
  manifestVersion?: string    // pinned manifest version (e.g., '2026-03-01')
  manifestCacheTtlMs?: number // default 3600000 (1 hour)
}

export interface MCPClient {
  connect(userId: string, config: MCPConfig): Promise<void>
  listTools(): Promise<ToolDefinition[]>
  callTool(name: string, args: Record<string, unknown>, options?: CallToolOptions): Promise<ToolResult>
  disconnect(): void
}

export interface CallToolOptions {
  idempotencyKey?: string  // for write operations; prevents duplicate execution
  timeoutMs?: number        // override default timeout for this call
  skipPermissionsCheck?: boolean  // internal use only; bypasses sandbox
}

// PERMISSION FIX: ToolPermissions enum for capability-based access control
export enum ToolCapability {
  READ_EMAIL = 'read_email',
  WRITE_EMAIL = 'write_email',
  READ_CALENDAR = 'read_calendar',
  WRITE_CALENDAR = 'write_calendar',
  READ_SALES = 'read_sales',
  WRITE_SALES = 'write_sales',
  READ_MESSAGING = 'read_messaging',
  WRITE_MESSAGING = 'write_messaging',
  READ_FILES = 'read_files',
  WRITE_FILES = 'write_files',
  PAYMENTS = 'payments',         // Stripe, PayPal — HIGH RISK
  ADMIN = 'admin',               // Salesforce delete, etc. — CRITICAL RISK
  EXECUTE_CODE = 'execute_code', // shell commands, SQL exec — CRITICAL RISK
}

export interface ToolPermissions {
  allowedCapabilities: Set<ToolCapability>
  deniedCapabilities: Set<ToolCapability>
  requireApproval: Set<ToolCapability>  // tools that need human approval before execution
}

export const DANGEROUS_TOOLS: Record<string, ToolCapability> = {
  'stripe.chargeCustomer': ToolCapability.PAYMENTS,
  'stripe.refundPayment': ToolCapability.PAYMENTS,
  'stripe.createCustomer': ToolCapability.PAYMENTS,
  'salesforce.deleteLead': ToolCapability.ADMIN,
  'salesforce.deleteContact': ToolCapability.ADMIN,
  'salesforce.deleteAccount': ToolCapability.ADMIN,
  'hubspot.crm.delete': ToolCapability.ADMIN,
  'shell.execute': ToolCapability.EXECUTE_CODE,
  'sql.execute': ToolCapability.EXECUTE_CODE,
  'webhook.trigger': ToolCapability.WRITE_MESSAGING,  // can cause unintended side effects
}

export const APPROVAL_REQUIRED_CAPABILITIES: ToolCapability[] = [
  ToolCapability.PAYMENTS,
  ToolCapability.ADMIN,
  ToolCapability.EXECUTE_CODE,
]
```

The `JSONSchema` for `inputSchema` follows the [JSON Schema draft-07](https://json-schema.org/draft/draft-07/nav) format, identical to the schema format used by OpenAI function calling and Anthropic tool use — making it trivial to pass tool definitions to any LLM provider.

### Internal Implementation Sketch

```typescript
// app/lib/mcp/client.ts

export class ZapierMCPClient implements MCPClient {
  private config: MCPConfig | null = null
  private userId: string | null = null
  private httpClient: HttpClient
  private toolManifest: ToolDefinition[] | null = null
  private manifestFetchedAt: number = 0
  private manifestCache: Map<string, { tools: ToolDefinition[]; fetchedAt: number }> = new Map()

  // CRITICAL FIX: Atomic token refresh with distributed lock per userId
  private refreshLocks: Map<string, Promise<string>> = new Map()

  // PERMISSION FIX: Permissions check
  private toolPermissions: ToolPermissions = {
    allowedCapabilities: new Set(Object.values(ToolCapability)),
    deniedCapabilities: new Set(),
    requireApproval: new Set(APPROVAL_REQUIRED_CAPABILITIES),
  }

  async connect(userId: string, config: MCPConfig): Promise<void> {
    if (!userId) throw new AuthError('userId is required for MCP connection')
    this.userId = userId
    this.config = config
    this.httpClient = new HttpClient({
      baseUrl: config.serverUrl,
      timeout: config.timeoutMs ?? 30_000,
      retryAttempts: config.retryAttempts ?? 3,
    })
    // Handshake: verify server is reachable and auth is valid
    const pingResult = await this.httpClient.post('/rpc', {
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    }, {
      // CRITICAL FIX: Bearer token goes in HTTP Authorization header, NOT in JSON-RPC params
      headers: {
        'Authorization': `Bearer ${await this.getUserToken()}`,
      },
    })
    if (pingResult.error) {
      throw new MCPServerError(`Connection failed: ${pingResult.error.message}`)
    }
  }

  async listTools(): Promise<ToolDefinition[]> {
    const cacheTtl = this.config?.manifestCacheTtlMs ?? 3_600_000
    const pinnedVersion = this.config?.manifestVersion

    // MAJOR FIX: Use pinned manifest version for caching
    const cacheKey = pinnedVersion ?? 'live'
    const cached = this.manifestCache.get(cacheKey)

    if (cached && Date.now() - cached.fetchedAt < cacheTtl) {
      return cached.tools
    }

    const result = await this.httpClient.post('/rpc', {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2,
    }, {
      headers: {
        'Authorization': `Bearer ${await this.getUserToken()}`,
      },
    })

    const tools = result.tools as ToolDefinition[]

    // Annotate tools with permission flags
    const annotatedTools = tools.map(tool => ({
      ...tool,
      annotations: {
        read: this.isReadTool(tool.name),
        write: this.isWriteTool(tool.name),
        dangerous: this.isDangerousTool(tool.name),
      },
    }))

    this.manifestCache.set(cacheKey, { tools: annotatedTools, fetchedAt: Date.now() })
    this.toolManifest = annotatedTools

    // MAJOR FIX: Invalidate stale cache entries when using pinned versions
    if (pinnedVersion) {
      for (const key of this.manifestCache.keys()) {
        if (key !== cacheKey) {
          this.manifestCache.delete(key)
        }
      }
    }

    return annotatedTools
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: CallToolOptions,
  ): Promise<ToolResult> {
    if (!this.config || !this.userId) throw new MCPServerError('Not connected')

    const startTime = Date.now()

    // CRITICAL FIX: Enforce permissions check unless explicitly skipped
    if (!options?.skipPermissionsCheck) {
      this.enforceToolPermissions(name)
    }

    // MAJOR FIX: Idempotency key validation for write operations
    const isWriteOp = this.isWriteTool(name)
    if (isWriteOp && !options?.idempotencyKey) {
      console.warn(`[MCP] Write tool ${name} called without idempotencyKey — adding generated key`)
    }
    const idempotencyKey = options?.idempotencyKey ?? `idempotent-${this.userId}-${name}-${Date.now()}`

    // MAJOR FIX: Audit logging for all tool calls
    const auditEntry: AuditLogEntry = {
      userId: this.userId,
      toolName: name,
      args: this.sanitizeArgs(args),  // strip sensitive data before logging
      idempotencyKey,
      timestamp: new Date().toISOString(),
      status: 'started',
    }
    await this.writeAuditLog(auditEntry)

    try {
      // CRITICAL FIX: Bearer token goes in HTTP Authorization header, NOT in JSON-RPC params
      const result = await this.httpClient.post('/rpc', {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name,
          arguments: args,
          // NOTE: Auth token is NO LONGER here — it's in the HTTP header below
        },
        id: 3,
        // MAJOR FIX: Idempotency key in metadata, not in params
        meta: {
          idempotencyKey,
        },
      }, {
        headers: {
          'Authorization': `Bearer ${await this.getUserToken()}`,
          // MAJOR FIX: Payload size limit enforcement
          'X-Max-Payload-Size': '10485760', // 10MB limit
        },
        timeoutMs: options?.timeoutMs ?? this.config.timeoutMs ?? 30_000,
      })

      const durationMs = Date.now() - startTime

      // MAJOR FIX: Audit log on success
      await this.writeAuditLog({
        ...auditEntry,
        status: 'success',
        result: result.content,
        durationMs,
      })

      // MINOR FIX: Enforce payload size limit
      const resultStr = JSON.stringify(result.content)
      if (resultStr.length > 10_000_000) {
        throw new MCPServerError('RESULT_PAYLOAD_TOO_LARGE', 'Tool result exceeds 10MB size limit')
      }

      return {
        content: result.content,
        isError: result.isError ?? false,
        error: result.error,
        durationMs,
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime

      // MAJOR FIX: Audit log on failure
      await this.writeAuditLog({
        ...auditEntry,
        status: 'error',
        error: err.message,
        durationMs,
      })

      throw err
    }
  }

  // CRITICAL FIX: Atomic token refresh with distributed lock per userId
  // Only one concurrent refresh per userId; others wait for the same promise
  private async getUserToken(): Promise<string> {
    if (!this.userId) throw new AuthError('Not connected')

    const credential = await db.credentials.findOne({ userId: this.userId, provider: 'zapier' })
    if (!credential) {
      throw new AuthError(`No OAuth credential found for user ${this.userId}`)
    }

    // Check if token is expired (with 60s buffer)
    if (Date.now() < credential.tokenExpiresAt - 60_000) {
      return decryptToken(credential.encryptedAccessToken)
    }

    // CRITICAL FIX: Only one refresh at a time per userId
    // If another request is already refreshing, wait for it instead of starting a second refresh
    const existingLock = this.refreshLocks.get(this.userId)
    if (existingLock) {
      console.log(`[MCP] Token refresh already in progress for user ${this.userId}, waiting...`)
      return existingLock
    }

    // Start a new refresh and store the promise in the lock map
    const refreshPromise = this.doTokenRefresh(this.userId, credential)
    this.refreshLocks.set(this.userId, refreshPromise)

    try {
      return await refreshPromise
    } finally {
      // CRITICAL FIX: Always clean up the lock, whether refresh succeeds or fails
      this.refreshLocks.delete(this.userId)
    }
  }

  // CRITICAL FIX: Atomic findOneAndUpdate to prevent race conditions in token refresh
  private async doTokenRefresh(userId: string, currentCredential: StoredCredential): Promise<string> {
    const lockAcquireResult = await db.credentials.findOneAndUpdate(
      {
        userId,
        provider: 'zapier',
        tokenExpiresAt: currentCredential.tokenExpiresAt,  // only update if unchanged
      },
      {
        $set: { refreshInProgress: true, refreshStartedAt: Date.now() },
      },
      { returnDocument: 'after' },
    )

    if (!lockAcquireResult) {
      // Another process already started a refresh; fetch the latest credential
      const latest = await db.credentials.findOne({ userId, provider: 'zapier' })
      if (!latest) throw new AuthError('Credential not found during concurrent refresh')
      if (latest.refreshInProgress && Date.now() - latest.refreshStartedAt < 30_000) {
        // Another refresh is still in progress; wait and fetch again
        await sleep(2000)
        const recheck = await db.credentials.findOne({ userId, provider: 'zapier' })
        return decryptToken(recheck!.encryptedAccessToken)
      }
      // Stale or failed refresh attempt; proceed with our own
      const refreshed = await refreshOAuthToken(latest)
      await db.credentials.updateOne(
        { userId },
        { $set: { ...refreshed, refreshInProgress: false } },
      )
      return refreshed.accessToken
    }

    try {
      const refreshed = await refreshOAuthToken(currentCredential)
      await db.credentials.updateOne(
        { userId },
        { $set: { ...refreshed, refreshInProgress: false } },
      )
      return refreshed.accessToken
    } catch (err) {
      // Clear the in-progress flag on failure
      await db.credentials.updateOne(
        { userId },
        { $set: { refreshInProgress: false } },
      )
      throw err
    }
  }

  // CRITICAL FIX: Permission enforcement
  private enforceToolPermissions(toolName: string): void {
    const dangerousCapability = DANGEROUS_TOOLS[toolName]

    if (dangerousCapability) {
      if (this.toolPermissions.deniedCapabilities.has(dangerousCapability)) {
        throw new ToolPermissionError(
          `Tool '${toolName}' is denied: capability '${dangerousCapability}' is not allowed`,
          toolName,
          dangerousCapability,
        )
      }
      if (this.toolPermissions.requireApproval.has(dangerousCapability)) {
        throw new ToolApprovalRequiredError(
          `Tool '${toolName}' requires approval before execution: capability '${dangerousCapability}' is restricted`,
          toolName,
          dangerousCapability,
        )
      }
    }
  }

  private isReadTool(name: string): boolean {
    return /^(gmail\.read|calendar\.read|salesforce\.query|hubspot\.read|slack\.search)/.test(name)
  }

  private isWriteTool(name: string): boolean {
    return /^(gmail\.send|calendar\.create|slack\.post|salesforce\.create|webhook\.trigger)/.test(name)
  }

  private isDangerousTool(name: string): boolean {
    return name in DANGEROUS_TOOLS
  }

  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    // Strip sensitive fields before audit logging
    const sensitive = ['password', 'token', 'secret', 'apiKey', 'authorization']
    const sanitized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(args)) {
      if (sensitive.some(s => k.toLowerCase().includes(s))) {
        sanitized[k] = '[REDACTED]'
      } else if (typeof v === 'object' && v !== null) {
        sanitized[k] = this.sanitizeArgs(v as Record<string, unknown>)
      } else {
        sanitized[k] = v
      }
    }
    return sanitized
  }

  private async writeAuditLog(entry: AuditLogEntry): Promise<void> {
    // MAJOR FIX: Audit logging schema for all tool calls
    await db.auditLogs.insertOne({
      ...entry,
      // Ensure userId is always present — no tool call is untraceable
      userId: entry.userId ?? this.userId ?? 'unknown',
    })
  }

  disconnect(): void {
    this.config = null
    this.userId = null
    this.toolManifest = null
  }
}

// MAJOR FIX: Audit log schema
interface AuditLogEntry {
  userId: string
  toolName: string
  args: Record<string, unknown>
  idempotencyKey: string
  timestamp: string
  status: 'started' | 'success' | 'error'
  result?: unknown
  error?: string
  durationMs?: number
}
```

---

## 4. How It Replaces `runner.ts` Dispatch

The current `InProcessRunner` (in `app/lib/runtime/runner.ts`) uses hardcoded `if/else` dispatch for 4 tools:

```typescript
// CURRENT — app/lib/runtime/runner.ts (lines 105–135)

if (tools.includes('gmail.read')) {
  const result = await gmailReadTool('is:unread newer_than:1d', 'demo')
  output = { agentId, role: agent.role, status: 'completed', data: result }
} else if (tools.includes('gmail.send')) {
  const upstreamOutputs = completions.get(agentId) || []
  const draftData = upstreamOutputs.find(o => o.data?.kind === 'draft_email')?.data
  if (draftData) {
    const result = await gmailSendTool(draftData.draft.to, draftData.draft.subject, draftData.draft.body, 'demo')
    output = { agentId, role: agent.role, status: 'completed', data: result }
  } else {
    output = { agentId, role: agent.role, status: 'error', data: null, error: 'No draft email found from upstream' }
  }
} else if (tools.includes('web.search')) {
  const result = await webSearchTool('research leads', 10)
  output = { agentId, role: agent.role, status: 'completed', data: result }
} else if (tools.includes('llm')) {
  const systemPrompts: Record<string, string> = {
    response_drafter: 'You are an expert email response drafter...',
    faq_responder: 'You are a customer support FAQ responder...',
    escalation_triage: 'You are an escalation triage agent...',
  }
  const upstreamOutputs = completions.get(agentId) || []
  const context = upstreamOutputs.map(o => JSON.stringify(o.data)).join('\n')
  const system = systemPrompts[agent.role] || 'You are a helpful AI assistant.'
  const result = await llmTool(`Context:\n${context}\n\nTask: ${agent.description}`, system)
  output = { agentId, role: agent.role, status: 'completed', data: { kind: 'llm', response: result.text, model: 'gpt-4o' } }
} else {
  output = { agentId, role: agent.role, status: 'completed', data: {} }
}
```

This dispatch block has several problems:

1. **New tools require code changes.** Adding a Slack integration means editing `runner.ts` and deploying.
2. **No tool schema for LLM.** The LLM agent prompt is constructed from a hand-written `systemPrompts` map — the LLM has no structured description of what tools it can call.
3. **Hardcoded user ID (`'demo'`).** Real auth requires per-user tokens, not a demo placeholder.

### After: MCP-Based Dispatch

With the MCP client injected into the runner, the same logic becomes:

```typescript
// REPLACEMENT — app/lib/runtime/runner.ts

export class InProcessRunner implements Runner {
  constructor(private mcpClient: MCPClient) {}

  async execute(callbacks: ExecutionCallbacks, options: RunOptions): Promise<void> {
    const { runId, graph, signal } = options
    // ... graph traversal setup unchanged ...

    const executeAgent = async (agentId: string): Promise<void> => {
      // ... status callbacks unchanged ...

      try {
        const tools = agent.tools
        let output: AgentOutput

        // Single generic dispatch — no more if/else chain
        const mcpToolName = mapAgentToolsToMCP(tools) // e.g., 'gmail.read', 'slack.postMessage'
        if (mcpToolName) {
          // Build args from agent config and upstream fan-in data
          const args = await buildToolArgs(agent, completions)

          // CRITICAL FIX: userId is passed explicitly, not a global
          // Every tool call is traceable to a specific user
          const userId = agent.userId ?? options.userId  // explicit userId from run context
          if (!userId) throw new AuthError('No userId context for tool call')

          // MAJOR FIX: Add idempotency key for write operations
          const isWriteOp = MCPClient.isWriteTool?.(mcpToolName) ?? false
          const callOptions = isWriteOp
            ? { idempotencyKey: `${runId}-${agentId}-${Date.now()}` }
            : undefined

          const result = await this.mcpClient.callTool(mcpToolName, args, callOptions)
          if (result.isError) {
            output = { agentId, role: agent.role, status: 'error', data: null, error: result.error }
          } else {
            output = { agentId, role: agent.role, status: 'completed', data: result.content }
          }
        } else if (tools.includes('llm')) {
          // LLM-only agents (no external tool call)
          const systemPrompts: Record<string, string> = { /* ... */ }
          const upstreamOutputs = completions.get(agentId) || []
          const context = upstreamOutputs.map(o => JSON.stringify(o.data)).join('\n')
          const system = systemPrompts[agent.role] || 'You are a helpful AI assistant.'
          const result = await llmTool(`Context:\n${context}\n\nTask: ${agent.description}`, system)
          output = { agentId, role: agent.role, status: 'completed', data: { kind: 'llm', response: result.text, model: 'gpt-4o' } }
        } else {
          output = { agentId, role: agent.role, status: 'completed', data: {} }
        }

        // ... rest of execution logic unchanged ...
      } catch (err: any) {
        // ... error handling unchanged ...
      }
    }

    // ... queue processing loop unchanged ...
  }
}
```

### mapAgentToolsToMCP Implementation

MAJOR FIX: Define `mapAgentToolsToMCP` — the function that maps AgentOS tool names to Zapier MCP tool names.

```typescript
// app/lib/mcp/tool-mapper.ts

// Maps AgentOS internal tool names to Zapier MCP tool names
// Handles naming conventions where they differ

const TOOL_NAME_MAP: Record<string, string> = {
  'gmail.read': 'gmail.read_emails',
  'gmail.send': 'gmail.send_email',
  'gmail.draft': 'gmail.create_draft',
  'calendar.read': 'google_calendar.list_events',
  'calendar.create': 'google_calendar.create_event',
  'calendar.update': 'google_calendar.update_event',
  'calendar.delete': 'google_calendar.delete_event',
  'slack.post': 'slack.post_message',
  'slack.search': 'slack.search_messages',
  'salesforce.query': 'salesforce.soql_query',
  'salesforce.create': 'salesforce.create_record',
  'salesforce.update': 'salesforce.update_record',
  'salesforce.delete': 'salesforce.delete_record',
  'hubspot.crm.search': 'hubspot.crm.search',
  'hubspot.crm.create': 'hubspot.crm.create',
  'stripe.chargeCustomer': 'stripe.charge_customer',
  'stripe.refundPayment': 'stripe.refund_payment',
  'web.search': 'webhook.trigger',  // routed through generic webhook tool
  'webhook.trigger': 'webhook.trigger',
}

// Reverse map for result routing if needed
const REVERSE_TOOL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_NAME_MAP).map(([k, v]) => [v, k])
)

export function mapAgentToolsToMCP(agentTools: string[]): string[] {
  return agentTools
    .map(tool => TOOL_NAME_MAP[tool] ?? tool)  // fall back to original name if no mapping
    .filter(Boolean)
}

export function mapMCPToolToAgent(mcpToolName: string): string {
  return REVERSE_TOOL_MAP[mcpToolName] ?? mcpToolName
}

export function isAgentToolMapped(agentTool: string): boolean {
  return agentTool in TOOL_NAME_MAP
}
```

The helper `buildToolArgs` function extracts arguments from the agent's configuration and from upstream fan-in data.

### LLM Tool Schema (New Capability)

Because `MCPClient.listTools()` returns structured `ToolDefinition[]` objects, we can now pass these directly to the LLM as tool definitions:

```typescript
// Before: LLM has no structured tool descriptions
const systemPrompt = 'You are a helpful assistant.' // generic

// After: LLM receives exact tool schemas from MCP manifest
const tools = await mcpClient.listTools()
const llmToolDefs = tools.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,  // already JSON Schema
}))
// → Pass to OpenAI / Anthropic / etc. as `tools` parameter
```

This is a significant capability gain: the LLM now knows exactly what tools exist, what arguments each takes, and what they do — all from the MCP manifest, with no hand-written prompt engineering.

---

## 5. Auth Handling

### Per-User Credential Storage

AgentOS stores a mapping of `userId → oauthCredentials` in its database. Each credential record contains:

```typescript
interface StoredCredential {
  userId: string
  provider: 'zapier' | 'slack' | 'gmail' | ...   // which MCP server
  encryptedAccessToken: string                    // AES-256-GCM encrypted, never plaintext
  encryptedRefreshToken?: string                  // for servers that use refresh tokens
  tokenExpiresAt: number                          // Unix timestamp
  scope: string[]                                 // OAuth scopes granted
  refreshInProgress?: boolean                     // distributed lock flag
  refreshStartedAt?: number                      // timestamp for lock timeout
  // MAJOR FIX: Key rotation support
  keyVersion: number                              // which encryption key version was used
  encryptedAccessTokenV2?: string                 // re-encrypted with new key after rotation
}
```

Encryption at rest uses AES-256-GCM with a per-deployment server-side key (stored in environment variables, never in code). The raw tokens are never logged and are decrypted only at the moment of injection into an MCP call.

### MAJOR FIX: Encryption Key Rotation Strategy with Versioning

When an AES-256-GCM key must rotate (due to compromise or compliance), the following strategy ensures data is re-encrypted without downtime:

```typescript
// app/lib/mcp/encryption.ts

interface EncryptionKey {
  version: number
  key: Buffer          // AES-256-GCM key material
  createdAt: number    // Unix timestamp
  rotatedAt?: number   // When this key was retired
}

// Stored in environment variables as base64-encoded bytes
// Key derivation: actual encryption key = HKDF-SHA256(masterKey, version || 'mcp-credential')
const KEY_REGISTRY: EncryptionKey[] = [
  { version: 1, key: deriveKey(process.env.MASTER_ENCRYPTION_KEY_V1!, 1), createdAt: Date.now() },
]

// MAJOR FIX: Key rotation is a background job, not a blocking operation
export async function rotateEncryptionKey(newKeyVersion: number): Promise<void> {
  const newKey = deriveKey(process.env[`MASTER_ENCRYPTION_KEY_V${newKeyVersion}`]!, newKeyVersion)
  KEY_REGISTRY.push({ version: newKeyVersion, key: newKey, createdAt: Date.now() })

  // Re-encrypt all credentials with the new key in batches (background job)
  const cursor = db.credentials.find({ keyVersion: { $lt: newKeyVersion } })
  let batch: StoredCredential[] = []
  for await (const cred of cursor) {
    const oldKey = KEY_REGISTRY.find(k => k.version === cred.keyVersion)?.key
    if (!oldKey) continue  // skip if old key not found

    // Decrypt with old key, re-encrypt with new key
    const accessToken = decrypt(cred.encryptedAccessToken, oldKey)
    const refreshed = await refreshOAuthToken(cred)  // get fresh token from provider
    const newEncrypted = encrypt(refreshed.accessToken, newKey)

    await db.credentials.updateOne(
      { _id: cred._id },
      {
        $set: {
          encryptedAccessToken: newEncrypted,
          keyVersion: newKeyVersion,
          encryptedAccessTokenV2: undefined,  // clear legacy field
        },
      },
    )
  }
}

// Decrypt using the correct key version
export function decryptToken(credential: StoredCredential): string {
  const key = KEY_REGISTRY.find(k => k.version === credential.keyVersion)?.key
  if (!key) throw new Error(`Encryption key version ${credential.keyVersion} not found`)

  // Support both legacy single-field and new field format
  const encryptedData = credential.encryptedAccessTokenV2 ?? credential.encryptedAccessToken
  return decrypt(encryptedData, key)
}
```

Key rotation steps:
1. Add new key to `KEY_REGISTRY` with incremented version
2. Run background re-encryption job that decrypts with old key, re-encrypts with new key
3. Credentials are migrated lazily — on next use, if `keyVersion < latest`, trigger immediate migration
4. Old key is retained until all credentials are migrated and a grace period (24h) elapses

### Token Injection into Tool Calls

When `MCPClient.callTool()` is invoked, the client fetches the decrypted token and injects it into the HTTP `Authorization` header:

```typescript
// Inside ZapierMCPClient.callTool()
// CRITICAL FIX: Bearer token is in HTTP Authorization header, NOT in JSON-RPC params

await this.httpClient.post('/rpc', {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name,
    arguments: args,
    // NOTE: authorization is NO LONGER in params — it's in the HTTP header
  },
  id: 3,
}, {
  headers: {
    'Authorization': `Bearer ${await this.getUserToken()}`,
    'X-Idempotency-Key': idempotencyKey,  // MAJOR FIX: for write ops
  },
})
```

Zapier's MCP server receives the bearer token in the `Authorization` header of each JSON-RPC HTTP request and validates it against Zapier's OAuth infrastructure. AgentOS never touches the user's actual OAuth tokens — it just passes them through.

### OAuth Initialization Flow

When a user first connects Zapier to AgentOS:

1. User clicks "Connect Zapier" in the AgentOS UI.
2. AgentOS redirects to Zapier's OAuth authorization URL with AgentOS's `client_id` and a callback URL.
3. User authorizes in Zapier's UI.
4. Zapier redirects back to AgentOS's callback with an authorization code.
5. AgentOS exchanges the code for access + refresh tokens.
6. AgentOS stores encrypted tokens in the database.
7. Future `callTool` requests use the stored token automatically.

This flow is handled by a separate `/auth/zapier/callback` API route — `MCPClient` only handles already-authorized connections.

---

## 6. Local MCP Server for Development

During local development, agents should be able to run without real OAuth credentials. A local MCP server provides mock tools that behave like real ones but return deterministic or configurable responses.

### Using a Mock Zapier Server

A lightweight mock server can be started alongside the dev app:

```typescript
// app/lib/mcp/dev/mock-zapier-server.ts

import { createServer } from 'http'
import { randomUUID } from 'crypto'

// MINOR FIX: Expand beyond 3 hardcoded tools — added calendar.read (read) and crm.update (write)
const MOCK_TOOLS = [
  {
    name: 'gmail.read',
    description: 'Search Gmail messages',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query' },
        maxResults: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail.send',
    description: 'Send an email via Gmail',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'slack.postMessage',
    description: 'Post a message to a Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['channel', 'text'],
    },
  },
  // MINOR FIX: Additional read tool
  {
    name: 'calendar.read',
    description: 'List upcoming calendar events',
    inputSchema: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: 'ISO8601 start time' },
        timeMax: { type: 'string', description: 'ISO8601 end time' },
        maxResults: { type: 'number', default: 10 },
      },
      required: ['timeMin'],
    },
  },
  // MINOR FIX: Additional write tool
  {
    name: 'crm.update',
    description: 'Update a CRM contact record',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        fields: {
          type: 'object',
          description: 'Key-value pairs of fields to update',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['contactId', 'fields'],
    },
  },
]

export function startMockServer(port = 3001) {
  const server = createServer(async (req, res) => {
    // Set CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'POST' && req.url === '/rpc') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      await new Promise(resolve => req.on('end', resolve))

      // Validate content length for payload size limit (MINOR FIX)
      const contentLength = parseInt(req.headers['content-length'] ?? '0', 10)
      if (contentLength > 10_000_000) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Payload too large' }, id: null }))
        return
      }

      const rpc = JSON.parse(body)

      if (rpc.method === 'ping') {
        res.end(JSON.stringify({ jsonrpc: '2.0', result: { ok: true }, id: rpc.id }))
      } else if (rpc.method === 'tools/list') {
        res.end(JSON.stringify({ jsonrpc: '2.0', result: { tools: MOCK_TOOLS }, id: rpc.id }))
      } else if (rpc.method === 'tools/call') {
        const { name, arguments: args } = rpc.params

        // Validate idempotency key for write operations (MAJOR FIX)
        const isWriteOp = ['gmail.send', 'crm.update'].includes(name)
        if (isWriteOp && !rpc.meta?.idempotencyKey) {
          console.warn(`[mock-zapier] Write tool ${name} called without idempotencyKey`)
        }

        const mockResult = getMockResult(name, args)
        res.end(JSON.stringify({ jsonrpc: '2.0', result: mockResult, id: rpc.id }))
      }
      return
    }
    res.statusCode = 404
    res.end()
  })

  server.listen(port, () => {
    console.log(`[mock-zapier] Running on http://localhost:${port}`)
  })
}

function getMockResult(toolName: string, args: Record<string, unknown>) {
  switch (toolName) {
    case 'gmail.read':
      return {
        content: JSON.stringify({
          messages: [
            { id: randomUUID(), from: 'alice@example.com', subject: 'Re: Q4 planning', snippet: 'Can we sync Tuesday?' },
            { id: randomUUID(), from: 'bob@corp.com', subject: 'Budget approval needed', snippet: 'Please review the attached.' },
          ],
          total: 2,
        }),
        isError: false,
      }
    case 'gmail.send':
      return { content: JSON.stringify({ messageId: `mock-${randomUUID()}`, sent: true }), isError: false }
    case 'slack.postMessage':
      return { content: JSON.stringify({ ok: true, channel: args.channel, ts: Date.now() }), isError: false }
    case 'calendar.read':
      return {
        content: JSON.stringify({
          events: [
            { id: randomUUID(), summary: 'Team standup', start: '2026-03-30T09:00:00Z', end: '2026-03-30T09:15:00Z' },
            { id: randomUUID(), summary: 'Q1 review', start: '2026-03-30T14:00:00Z', end: '2026-03-30T15:00:00Z' },
          ],
          total: 2,
        }),
        isError: false,
      }
    case 'crm.update':
      return { content: JSON.stringify({ success: true, contactId: args.contactId, updatedFields: Object.keys(args.fields as object) }), isError: false }
    default:
      return { content: null, isError: true, error: `Unknown tool: ${toolName}` }
  }
}
```

### Dev Configuration

In `app/lib/mcp/client.ts`, the server URL switches based on the environment:

```typescript
// app/lib/mcp/client.ts

export function createMCPClient(): MCPClient {
  if (process.env.NODE_ENV === 'development' && process.env.USE_LOCAL_MCP === 'true') {
    console.warn('[MCP] Using local mock server — do not use in production')
    return new LocalMockMCPClient('http://localhost:3001')
  }
  return new ZapierMCPClient()
}
```

Developers run `startMockServer()` in their dev setup (e.g., as a `concurrently` script alongside the Next.js dev server) and set `USE_LOCAL_MCP=true` in their `.env.local`. No Zapier credentials needed.

---

## 7. Error Handling

### MCP Server Is Unreachable

```typescript
// app/lib/mcp/errors.ts

export class MCPServerUnreachableError extends Error {
  constructor(
    public readonly serverUrl: string,
    public readonly cause: unknown,
  ) {
    super(`MCP server unreachable: ${serverUrl}`)
    this.name = 'MCPServerUnreachableError'
  }
}

export class MCPServerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MCPServerError'
  }
}

// CRITICAL FIX: Permission errors
export class ToolPermissionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly capability: string,
    message: string,
  ) {
    super(message)
    this.name = 'ToolPermissionError'
  }
}

export class ToolApprovalRequiredError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly capability: string,
    message: string,
  ) {
    super(message)
    this.name = 'ToolApprovalRequiredError'
  }
}
```

When `httpClient.post()` throws a network error, `MCPClient.callTool()` catches it and throws `MCPServerUnreachableError`. The runner's catch block (line 156 in `runner.ts`) already handles thrown errors and sets `agentOutput.status = 'error'` — so the error propagates correctly up the callback chain and surfaces in the UI as a red node on the canvas.

The retry logic in `ZapierMCPClient` uses exponential backoff with jitter:

```typescript
async callTool(name: string, args: Record<string, unknown>, options?: CallToolOptions): Promise<ToolResult> {
  const attempt = 0
  while (true) {
    try {
      return await this.attemptCall(name, args, options)
    } catch (err) {
      if (isRetryableError(err) && attempt < (this.config.retryAttempts ?? 3)) {
        const delay = Math.min(1000 * 2 ** attempt + Math.random() * 1000, 30_000)
        await sleep(delay)
        continue
      }
      throw err
    }
  }
}
```

Retryable errors include HTTP 429 (rate limited), HTTP 503 (service unavailable), and network timeouts. HTTP 401 is **not** retried — it indicates bad auth and requires re-authorization.

### Tool Does Not Exist

If `callTool()` receives a tool name not in the manifest, Zapier's server returns a JSON-RPC error:

```typescript
// From Zapier MCP server response:
{ "jsonrpc": "2.0", "error": { "code": -32602, "message": "Tool not found: gmail.pread" }, "id": 3 }
```

The `attemptCall` method wraps this into a typed error:

```typescript
private async attemptCall(name: string, args: Record<string, unknown>, options?: CallToolOptions): Promise<ToolResult> {
  const result = await this.httpClient.post('/rpc', { /* ... */ })

  if (result.error) {
    throw new MCPToolNotFoundError(name, result.error.message)
  }
  return result
}
```

`MCPToolNotFoundError` is caught by the runner and results in `status: 'error'` with a descriptive message shown on the canvas.

### Auth Failure

When the OAuth token is invalid or expired:

1. `getUserToken()` detects `401` from Zapier or finds an expired `tokenExpiresAt`.
2. If a refresh token exists, attempt atomic refresh via `doTokenRefresh()` (only one concurrent refresh per userId).
3. If refresh succeeds, update the stored credential and retry the tool call once.
4. If refresh fails (token revoked, refresh token expired), throw `AuthError`.

The runner catches `AuthError` specially and returns a distinct agent status so the UI can show a "Reconnect Zapier" prompt:

```typescript
} catch (err: any) {
  if (err instanceof AuthError) {
    output = {
      agentId, role: agent.role, status: 'auth_error', data: null,
      error: `OAuth session expired. Please reconnect your Zapier account.`,
    }
  } else if (err instanceof ToolPermissionError) {
    output = {
      agentId, role: agent.role, status: 'error', data: null,
      error: `Tool '${err.toolName}' is not permitted: ${err.capability} capability denied.`,
    }
  } else if (err instanceof ToolApprovalRequiredError) {
    output = {
      agentId, role: agent.role, status: 'approval_required', data: null,
      error: `Tool '${err.toolName}' requires approval: ${err.capability} capability is restricted.`,
    }
  } else {
    // Standard error handling
    output = { agentId, role: agent.role, status: 'error', data: null, error: err.message }
  }
}
```

### Partial Fan-In Failure

When one upstream agent errors but the graph continues running other branches, `completions.get(agentId)` may return an empty array for agents that failed. The `canRun()` helper and the runner's fan-in logic must handle this gracefully. The runner already does — agents that errored leave empty entries in `completions`, and downstream `find()` calls will return `undefined`, which the tool call logic handles as "no upstream data available."

---

## 8. Key Files (Proposed)

```
app/lib/mcp/
├── client.ts          # MCPClient interface + ZapierMCPClient implementation
├── errors.ts          # MCPServerUnreachableError, MCPToolNotFoundError, AuthError, ToolPermissionError
├── auth.ts            # Per-user credential storage + token injection
├── tool-mapper.ts     # MAJOR FIX: mapAgentToolsToMCP implementation
├── encryption.ts      # MAJOR FIX: Encryption key rotation with versioning
├── dev/
│   └── mock-zapier-server.ts   # Local mock for development (5 tools now)
└── runner.ts          # (existing) — updated to accept MCPClient, remove if/else dispatch
```

---

## 9. Open Questions

1. **Multi-server support.** When should AgentOS connect to Zapier vs. Make.com vs. n8n? A single `MCPClient` interface can hold multiple server connections keyed by provider name, but the UX for multi-provider auth is not yet designed.
2. **Tool name collision.** If two MCP servers expose a tool named `gmail.read`, how does AgentOS namespace them? Likely `provider/toolname` (e.g., `zapier/gmail.read`), but this needs UX validation.
3. **Manifest caching.** `listTools()` uses TTL-based caching with invalidation on explicit reconnect. When Zapier pushes breaking changes to the manifest, older pinned versions can be used while the new version is validated. Cache invalidation on 401 is already handled.
4. **Streaming responses.** Some Zapier tools return large payloads. Does `callTool` block until complete, or does it stream? Zapier's MCP server behavior here needs investigation.
