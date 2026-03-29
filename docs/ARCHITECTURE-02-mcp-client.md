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
}

export interface ToolResult {
  content: string | object
  isError: boolean
  error?: string
}

export interface MCPConfig {
  serverUrl: string          // e.g., 'https://mcp.zapier.com'
  authToken?: string          // per-user OAuth token from Zapier
  timeoutMs?: number          // default 30000
  retryAttempts?: number      // default 3
}

export interface MCPClient {
  connect(config: MCPConfig): Promise<void>
  listTools(): Promise<ToolDefinition[]>
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>
  disconnect(): void
}
```

The `JSONSchema` for `inputSchema` follows the [JSON Schema draft-07](https://json-schema.org/draft/draft-07/nav) format, identical to the schema format used by OpenAI function calling and Anthropic tool use — making it trivial to pass tool definitions to any LLM provider.

### Internal Implementation Sketch

```typescript
// app/lib/mcp/client.ts

export class ZapierMCPClient implements MCPClient {
  private config: MCPConfig | null = null
  private httpClient: HttpClient

  async connect(config: MCPConfig): Promise<void> {
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
    })
    if (pingResult.error) {
      throw new MCPServerError(`Connection failed: ${pingResult.error.message}`)
    }
  }

  async listTools(): Promise<ToolDefinition[]> {
    const result = await this.httpClient.post('/rpc', {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2,
    })
    return result.tools as ToolDefinition[]
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.config) throw new MCPServerError('Not connected')

    const result = await this.httpClient.post('/rpc', {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        // Auth token injected per-request from stored per-user credential
        authorization: `Bearer ${await this.getUserToken()}`,
      },
      id: 3,
    })

    return {
      content: result.content,
      isError: result.isError ?? false,
      error: result.error,
    }
  }

  disconnect(): void {
    this.config = null
  }
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
          const result = await this.mcpClient.callTool(mcpToolName, args)
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

The helper `mapAgentToolsToMCP` converts AgentOS tool names to MCP tool names (which are often identical or close). The `buildToolArgs` function extracts arguments from the agent's configuration and from upstream fan-in data.

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
  encryptedAccessToken: string                    // AES-encrypted, never plaintext
  encryptedRefreshToken?: string                  // for servers that use refresh tokens
  tokenExpiresAt: number                          // Unix timestamp
  scope: string[]                                 // OAuth scopes granted
}
```

Encryption at rest uses AES-256-GCM with a per-deployment server-side key (stored in environment variables, never in code). The raw tokens are never logged and are decrypted only at the moment of injection into an MCP call.

### Token Injection into Tool Calls

When `MCPClient.callTool()` is invoked, the client fetches the decrypted token and injects it into the request:

```typescript
// Inside ZapierMCPClient.callTool()
private async getUserToken(): Promise<string> {
  const userId = getCurrentUserId()           // from request context
  const credential = await db.credentials.findOne({ userId, provider: 'zapier' })

  if (!credential) {
    throw new AuthError(`No OAuth credential found for user ${userId}`)
  }

  // Check if token is expired and needs refresh
  if (Date.now() >= credential.tokenExpiresAt - 60_000) {
    const refreshed = await refreshOAuthToken(credential)
    await db.credentials.updateOne({ userId }, { $set: refreshed })
    return refreshed.accessToken
  }

  return decryptToken(credential.encryptedAccessToken)
}
```

Zapier's MCP server receives the bearer token in the `Authorization` header of each JSON-RPC request and validates it against Zapier's OAuth infrastructure. AgentOS never touches the user's actual OAuth tokens — it just passes them through.

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
]

export function startMockServer(port = 3001) {
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      await new Promise(resolve => req.on('end', resolve))

      const rpc = JSON.parse(body)

      if (rpc.method === 'ping') {
        res.end(JSON.stringify({ jsonrpc: '2.0', result: { ok: true }, id: rpc.id }))
      } else if (rpc.method === 'tools/list') {
        res.end(JSON.stringify({ jsonrpc: '2.0', result: { tools: MOCK_TOOLS }, id: rpc.id }))
      } else if (rpc.method === 'tools/call') {
        const { name, arguments: args } = rpc.params
        // Return mock data based on tool name
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
```

When `httpClient.post()` throws a network error, `MCPClient.callTool()` catches it and throws `MCPServerUnreachableError`. The runner's catch block (line 156 in `runner.ts`) already handles thrown errors and sets `agentOutput.status = 'error'` — so the error propagates correctly up the callback chain and surfaces in the UI as a red node on the canvas.

The retry logic in `ZapierMCPClient` uses exponential backoff with jitter:

```typescript
async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const attempt = 0
  while (true) {
    try {
      return await this.attemptCall(name, args)
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
private async attemptCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
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
2. If a refresh token exists, attempt automatic refresh via `refreshOAuthToken()`.
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
├── errors.ts          # MCPServerUnreachableError, MCPToolNotFoundError, AuthError
├── auth.ts            # Per-user credential storage + token injection
├── dev/
│   └── mock-zapier-server.ts   # Local mock for development
└── runner.ts          # (existing) — updated to accept MCPClient, remove if/else dispatch
```

---

## 9. Open Questions

1. **Multi-server support.** When should AgentOS connect to Zapier vs. Make.com vs. n8n? A single `MCPClient` interface can hold multiple server connections keyed by provider name, but the UX for multi-provider auth is not yet designed.
2. **Tool name collision.** If two MCP servers expose a tool named `gmail.read`, how does AgentOS namespace them? Likely `provider/toolname` (e.g., `zapier/gmail.read`), but this needs UX validation.
3. **Manifest caching.** `listTools()` should be called once and cached, not on every agent run. Cache invalidation strategy (e.g., on 401, on explicit reconnect) needs a policy.
4. **Streaming responses.** Some Zapier tools return large payloads. Does `callTool` block until complete, or does it stream? Zapier's MCP server behavior here needs investigation.
