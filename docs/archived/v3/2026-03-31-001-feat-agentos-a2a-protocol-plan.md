---
title: "feat: A2A Protocol Integration for AgentOS"
type: feat
status: active
date: 2026-03-31
---

# A2A Protocol Integration for AgentOS

## Overview

Implement the Agent-to-Agent (A2A) protocol to enable AgentOS agents to discover and communicate with external A2A-compliant agents. This transforms AgentOS from a standalone orchestrator into a participant in a multi-agent ecosystem.

## Problem Frame

AgentOS currently has no interoperability standard. Agents built on AgentOS can only communicate within AgentOS. A2A enables:
- AgentOS agents to call external A2A agents (e.g., from AgentScope deployments)
- External agents to call AgentOS agents
- Canvas to visualize A2A connections between agents
- Non-technical users to compose multi-agent workflows spanning multiple platforms

## Requirements Trace

- R1 (from MVP): NL-to-canvas pipeline builder — A2A extends canvas with external agent nodes
- R6 (from MVP): Reasoning trace per run — A2A message events should be traced in SSE stream
- R9 (from MVP): MCP integration — A2A complements MCP by enabling agent-to-agent calls beyond tool execution

## Key Technical Decisions

**Decision: Use the official A2A spec rather than building a custom protocol.**
- Rationale: A2A is an emerging standard (v0.2). Using the official spec ensures future compatibility with AgentScope, LangChain agents, and other A2A-compliant frameworks.
- Alternative: Build a custom JSON-RPC protocol — rejected because it creates vendor lock-in and adds maintenance burden.

**Decision: A2A is client-only in v1 (no A2A server).**
- Rationale: AgentOS agents are spawned by the runner, not long-running servers. A2A server capability requires a different deployment model.
- Future: A2A server can be added post-MVP when AgentOS supports persistent agent deployments.

## Scope Boundaries

- A2A server (AgentOS as a callable agent) — out of scope
- A2A push notifications — out of scope
- A2A streaming (SSE from remote agents) — out of scope for v1
- Multi-turn A2A conversations — out of scope for v1 (single request-response only)

## High-Level Technical Design

```
┌──────────────────────────────────────────────────────────────────┐
│                        AgentOS Canvas                              │
│  ┌─────────────┐  ┌─────────────────┐  ┌──────────────────────┐  │
│  │ Local Agent │  │ A2A External    │  │ A2A External         │  │
│  │ (DAG node)  │  │ Agent (HTTP)     │  │ Agent (HTTP)         │  │
│  └──────┬──────┘  └────────┬────────┘  └──────────┬─────────┘  │
│         │                    │                       │             │
│         │         A2AClientDiscovery         A2AClientDiscovery    │
│         │                    │                       │             │
│         └────────────────────┼───────────────────────┘             │
│                              │                                      │
│                    ┌─────────▼─────────┐                          │
│                    │   A2AClientPool     │                          │
│                    │  (per-run, cached)  │                          │
│                    └─────────┬───────────┘                          │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   A2A Gateway API   │
                    │  (agent dispatch)  │
                    └───────────────────┘
```

### A2A Protocol Flow

1. Canvas user drops an "External Agent" node on the canvas
2. User enters the external agent's `AgentCard` URL (e.g., `https://agent.example.com/.well-known/agent.json`)
3. `AgentCardResolver` fetches and caches the AgentCard
4. Canvas displays the external agent's name, description, and capabilities
5. User connects the local agent to the external agent via an edge
6. At runtime, the DAG executor uses `A2AClient` to send task to the external agent
7. A2A messages are traced via the SSE event stream

### AgentCard Schema (per A2A spec)

```json
{
  "name": "lead-researcher",
  "description": "Researches B2B leads using web search",
  "version": "1.0.0",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false
  },
  "skills": [
    { "id": "web-search", "name": "Web Search", "description": "Search the web for information" }
  ],
  "endpoints": {
    "openapi": "https://agent.example.com/openapi.json",
    "agent": "https://agent.example.com/a2a"
  }
}
```

## Implementation Units

- [ ] **Unit 1: A2A Client Core**

**Goal:** TypeScript A2A client that can send task requests to A2A agents and receive responses.

**Requirements:** R1, R9

**Files:**
- Create: `lib/a2a/a2a-client.ts`
- Create: `lib/a2a/types.ts` (AgentCard, A2AMessage, A2ATask, A2ATaskStatus)
- Create: `lib/a2a/agent-card-resolver.ts`
- Create: `lib/a2a/a2a-client-pool.ts`
- Test: `lib/a2a/__tests__/a2a-client.test.ts`

**Approach:**
- Implement A2AClient class that wraps fetch calls to A2A agent endpoints
- Use `EventEmitter`-style hook system for A2A lifecycle events
- Pool caches clients per endpoint URL to avoid reconnecting
- Follow the A2A spec message formats: `tasks/send`, `tasks/get`

**Patterns to follow:**
- `lib/mcp/mcp-client.ts` for client lifecycle management
- `lib/middleware/` for retry/error handling middleware

**Test scenarios:**
- `tasks/send` to a mock A2A agent returns task with status "completed"
- `tasks/send` with streaming=false returns complete response in one chunk
- AgentCardResolver fetches and caches AgentCard correctly
- Pool returns same client for same endpoint URL

**Verification:**
- Unit tests pass for all message serialization/deserialization
- Integration test: send a task to a mock A2A server endpoint

---

- [ ] **Unit 2: Canvas A2A Node Component**

**Goal:** Canvas node component for external A2A agents, with AgentCard URL input and capability display.

**Requirements:** R1

**Files:**
- Create: `components/a2a-external-node.tsx` (React Flow custom node)
- Modify: `components/canvas-panel.tsx` (register A2A node type)
- Test: `components/__tests__/a2a-external-node.test.tsx`

**Approach:**
- Custom React Flow node that fetches AgentCard on mount
- Shows agent name, description, and skill badges
- Inline editing of AgentCard URL
- Error state if agent is unreachable

**Patterns to follow:**
- `components/agent-card.tsx` for visual style
- `components/agent-node-spec.md` for node spec format

**Test scenarios:**
- Node renders AgentCard data correctly
- Node shows error state when agent URL is unreachable
- Node updates when AgentCard URL changes

**Verification:**
- Canvas renders A2A node with correct styling
- Node fetches and displays real AgentCard data

---

- [ ] **Unit 3: Runner A2A Integration**

**Goal:** DAG executor uses A2AClient to dispatch tasks to external agents connected via A2A edges.

**Requirements:** R1, R6

**Files:**
- Modify: `lib/runtime/runner.ts` (add A2A dispatch logic)
- Create: `lib/a2a/a2a-task-mapper.ts` (maps A2A task results to AgentOutput)
- Modify: `lib/tracing/trace-emitter.ts` (emit A2A events in SSE stream)

**Approach:**
- Add `isA2AAgent` flag to Agent type in `lib/nl/types.ts`
- When runner encounters an agent with `isA2AAgent: true`, use A2AClient instead of local execution
- A2A task results mapped to AgentOutput and traced
- Add `a2a_request` and `a2a_response` event types to `event-schema.ts`

**Patterns to follow:**
- Existing tool execution pattern in `runner.ts` (executeTool pattern)
- SSE event pattern from `sse-stream.ts`

**Test scenarios:**
- Runner dispatches task to A2A agent and receives completed response
- Runner maps A2A error response to AgentOutput with error status
- A2A events appear in SSE trace stream

**Verification:**
- End-to-end: canvas with A2A node, runner executes, SSE shows A2A events

---

- [ ] **Unit 4: A2A Discovery UI**

**Goal:** UI for discovering and connecting to external A2A agents from the canvas.

**Requirements:** R1

**Files:**
- Create: `components/a2a-agent-browser.tsx` (modal for browsing/discovering agents)
- Create: `components/a2a-agent-card-preview.tsx`
- Modify: `components/canvas-panel.tsx` (add "Add External Agent" button)
- Modify: `app/api/a2a/discover/route.ts` (well-known AgentCard endpoint)

**Approach:**
- Canvas toolbar has "Add External Agent" button
- Opens a modal where user can enter an AgentCard URL or browse a registry
- Registry is just a simple URL list for now (Nacos/discovery deferred)
- On selection, drops an A2A External Node on the canvas

**Patterns to follow:**
- `components/approval-modal.tsx` for modal pattern
- `app/api/assemble/route.ts` for API route structure

**Test scenarios:**
- User can enter AgentCard URL and see preview
- AgentCard preview shows name, description, skills
- "Add to Canvas" drops node at center of viewport

**Verification:**
- User flow: click Add External Agent → enter URL → see preview → add to canvas

---

## System-Wide Impact

- **Runner:** New execution path for A2A agents (different from local tool execution)
- **Tracing:** A2A events (request/response) added to SSE event stream
- **Canvas:** New node type registered in React Flow
- **API:** New `/api/a2a/discover` endpoint for well-known AgentCard

## Risks & Dependencies

- **A2A spec instability:** The A2A spec is still maturing. Spec changes may require client updates. Mitigation: pin to a specific spec version, add abstraction layer.
- **External agent availability:** AgentOS depends on external agents being reachable. Mitigation: timeout handling, graceful degradation, error UI.
- **AgentCard trust:** There's no authentication on AgentCard fetch. Mitigation: HTTPS required, certificate validation.

## Documentation / Operational Notes

- Add `A2A_PROTOCOL.md` to docs/
- Document how to deploy an A2A-compatible agent and connect it to AgentOS
- Document current A2A limitations (no streaming, no push, single-turn only)

## Sources & References

- [A2A Protocol Spec](https://github.com/A2A-Spec/a2a-protocol) (official specification)
- `agentscope/src/agentscope/agent/_a2a_agent.py` — AgentScope A2A implementation reference
