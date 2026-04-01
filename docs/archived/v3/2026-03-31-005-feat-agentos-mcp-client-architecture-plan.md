---
title: "feat: MCP Client Architecture Upgrade"
type: feat
status: active
date: 2026-03-31
---

# MCP Client Architecture Upgrade

## Overview

Refactor AgentOS's MCP client to follow AgentScope's mature MCP architecture pattern — adding explicit session lifecycle management, content block type conversion, and a cleaner interface. AgentOS's Zapier differentiation (bearer auth, manifest caching) is preserved.

## Problem Frame

AgentOS's current MCP client (`lib/mcp/mcp-client.ts`) works but has gaps vs. AgentScope's MCP implementation:

| Aspect | Current AgentOS | AgentScope |
|--------|---------------|-----------|
| Session lifecycle | Implicit connect/close | Explicit `connect()`/`close()` |
| Content conversion | Raw MCP blocks | Text, Image, Audio, Resource → typed |
| Tool wrapper pattern | ad-hoc | `MCPToolFunction` callable wrapper |
| Transport | HTTP only | HTTP + SSE + stdio |
| Error handling | Basic | Typed MCP errors |

These gaps make it harder to extend the MCP client (e.g., adding streaming tools, multi-step sessions) and create rough edges when integrating with the rest of the system.

## Requirements Trace

- R9 (from MVP): MCP integration — upgrade preserves existing Zapier functionality while adding architecture improvements

## Key Technical Decisions

**Decision: Keep Zapier as the primary MCP server.**
- Rationale: Zapier is AgentOS's differentiation — 8,000+ integrations without building them ourselves. Don't replace it.
- What we're improving: The *interface* and *session management*, not the server.

**Decision: Adopt `MCPClientBase` interface pattern, not the Python implementation.**
- Rationale: We're not porting Python code. We're adopting the architectural pattern (explicit lifecycle, content conversion, tool wrapper).
- TypeScript equivalent: `MCPClient` abstract base with `connect()`, `close()`, `callTool()` methods.

**Decision: Keep the existing manifest cache (no changes needed).**
- Rationale: Manifest caching is already well-implemented and working. Don't touch it.

## Scope Boundaries

- **New transport types (SSE, stdio)** — out of scope for v1 (HTTP only)
- **Streaming tool responses** — out of scope (tool responses are always JSON)
- **Multi-server MCP** — out of scope (single Zapier server)
- **WS transport** — out of scope

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         Runner                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   MCPClientPool                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │              ZapierMCPClient                         │  │  │
│  │  │                                                      │  │  │
│  │  │  connect() → authenticate, cache manifest           │  │  │
│  │  │  callTool(name, args) → MCPRequest → MCPResponse   │  │  │
│  │  │  close() → cleanup sessions                         │  │  │
│  │  │                                                      │  │  │
│  │  │  ┌────────────┐  ┌─────────────┐  ┌─────────────┐   │  │  │
│  │  │  │ ManifestCache│  │TokenRefresher│  │ ToolWrapper│   │  │  │
│  │  │  └────────────┘  └─────────────┘  └─────────────┘   │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### MCPClientBase Interface

```typescript
interface MCPClientBase {
  connect(): Promise<void>
  close(): Promise<void>
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>
  getTool(name: string): MCPTool | undefined
  getTools(): MCPTool[]
}

interface MCPTool {
  name: string
  description: string
  inputSchema: JSONSchema
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
  }
}

interface ToolResult {
  content: ContentBlock[]  // Converted from MCP blocks
  isError?: boolean
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: ResourceBlock }
```

## Implementation Units

- [ ] **Unit 1: MCP Client Interface Refactor**

**Goal:** Extract `MCPClientBase` interface and refactor `ZapierMCPClient` to follow explicit lifecycle pattern.

**Requirements:** R9

**Files:**
- Create: `lib/mcp/interfaces.ts` (MCPClientBase, MCPTool, ToolResult, ContentBlock types)
- Create: `lib/mcp/content-converter.ts` (MCP block → ContentBlock conversion)
- Modify: `lib/mcp/mcp-client.ts` — refactor to implement MCPClientBase
- Modify: `lib/mcp/tool-mapper.ts` — update to use new MCPTool type
- Test: `lib/mcp/__tests__/mcp-client.test.ts` (update for new interface)

**Approach:**
1. Extract types to `interfaces.ts`
2. Add `connect()` that handles authentication + manifest fetch
3. Add `close()` that cleans up sessions
4. Add `content-converter.ts` to convert MCP `TextContent`, `ImageContent`, `Resource` blocks to our `ContentBlock` union type
5. Update `tool-mapper.ts` to use `MCPTool` type from interfaces
6. Existing functionality preserved — just restructured

**Patterns to follow:**
- `agentscope/src/agentscope/mcp/` for interface patterns
- `lib/middleware/execute-tool.ts` for tool call pattern

**Test scenarios:**
- `connect()` authenticates and fetches manifest
- `close()` cleans up without errors
- Content blocks (text, image, resource) are correctly converted
- Existing tool calls work with refactored client

**Verification:**
- `npx vitest --run lib/mcp/__tests__/mcp-client.test.ts` passes

---

- [ ] **Unit 2: Tool Wrapper Pattern**

**Goal:** `MCPToolFunction` wrapper class that makes individual tools callable with proper session management.

**Requirements:** R9

**Files:**
- Create: `lib/mcp/tool-wrapper.ts` (MCPToolFunction class)
- Modify: `lib/mcp/mcp-client.ts` — add `getTool(name)` method returning MCPToolFunction

**Approach:**
```typescript
class MCPToolFunction {
  constructor(
    private client: MCPClientBase,
    private toolName: string
  )

  async call(args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>
}
```

- `MCPToolFunction` holds reference to client and tool name
- `call()` invokes `client.callTool()` with proper error handling
- Allows tools to be passed around as first-class callables

**Patterns to follow:**
- `agentscope/src/agentscope/mcp/` for MCPToolFunction pattern
- `lib/runtime/tools/` for existing tool patterns

**Test scenarios:**
- `MCPToolFunction.call()` forwards to client correctly
- `MCPToolFunction.call()` passes AbortSignal
- Error handling wraps MCP errors properly

**Verification:**
- Unit tests pass

---

- [ ] **Unit 3: Error Typing**

**Goal:** Typed MCP error hierarchy matching MCP spec error codes.

**Requirements:** R9

**Files:**
- Create: `lib/mcp/errors.ts` (MCPError, InvalidParams, MethodNotFound, etc.)
- Modify: `lib/mcp/mcp-client.ts` — use typed errors
- Modify: `lib/middleware/error-translation.ts` — add MCP error translation

**Approach:**
```typescript
class MCPError extends Error {
  constructor(
    public code: MCPCode,
    message: string,
    public data?: unknown
  ) { super(message) }
}

enum MCPCode {
  InvalidParams = -32602,
  MethodNotFound = -32601,
  InternalError = -32603,
  // ... from MCP spec
}

function translateMCPError(error: MCPError): RetryableAgentError | FatalAgentError
```

**Patterns to follow:**
- `lib/middleware/error-translation.ts` for existing error translation pattern
- `agentscope/src/agentscope/exception/` for agent error hierarchy

**Test scenarios:**
- MCP `InvalidParams` maps to `RetryableAgentError`
- MCP `InternalError` maps to `FatalAgentError`
- MCP error with JSON data preserves data in translated error

**Verification:**
- Error translation tests pass

---

- [ ] **Unit 4: Session Pool (Production)**

**Goal:** `MCPClientPool` that manages multiple concurrent MCP sessions efficiently.

**Requirements:** R9 (production readiness)

**Files:**
- Create: `lib/mcp/client-pool.ts` (MCPClientPool class)
- Modify: `lib/runtime/runner.ts` — use pool for concurrent tool calls

**Approach:**
- Pool maintains N concurrent MCP sessions (configurable, default 5)
- Sessions are reused across tool calls (Zapier connection pooling)
- LIFO session return on close (AgentScope pattern — avoids connection errors on nested closes)
- Session health check: if session errors, mark unhealthy and recreate

**Patterns to follow:**
- `lib/middleware/retry-budget.ts` for budget/pool pattern
- `agentscope/src/agentscope/mcp/` for session management

**Test scenarios:**
- Pool respects max concurrent sessions
- Session reuse: same session used for sequential calls
- Unhealthy session is recreated on next call

**Verification:**
- Load test: 100 concurrent tool calls

---

## System-Wide Impact

- **Runner:** Uses MCPClientPool for concurrent tool calls
- **Tool mapper:** Uses new MCPTool type
- **Error handling:** MCP errors are typed and translated correctly
- **Middleware:** execute-tool uses typed errors for retry decisions

## Risks & Dependencies

- **Breaking change:** The refactor changes the MCP client interface. Mitigation: maintain backward compatibility via adapter pattern.
- **Zapier API changes:** If Zapier changes their MCP API, types may drift. Mitigation: type-based validation with `as unknown as` casting for unknown fields.

## Documentation / Operational Notes

- Document the `connect()`/`close()` lifecycle requirement
- Document content block types and when to use each
- Document pool configuration (max sessions, health check interval)

## Sources & References

- `agentscope/src/agentscope/mcp/` — AgentScope MCP implementation (interface reference, not code to copy)
- [MCP Spec](https://modelcontextprotocol.io/) — Protocol specification
