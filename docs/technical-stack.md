# Technical Stack Requirements

**Date:** 2026-04-02
**Status:** Draft
**PRD Ref:** `docs/PRD.md` v5.1
**Supersedes:** Any informal stack discussions

---

## Decision: TypeScript / Node.js for the Entire Stack

**Chosen stack: TypeScript + Node.js across frontend and backend.**

This document explains why, rules out alternatives, and specifies the exact technology choices for each layer.

---

## Why Not Python?

Python is the dominant language for LLM applications — LangChain, LlamaIndex, instructor, DSPy are all Python-first. If AgentOS were a research platform or primarily did local model inference, Python would be the default choice.

But AgentOS is a **business workflow orchestration platform**. The workload is:

- Long-running agent sessions (minutes to hours)
- I/O-bound on LLM API calls (not CPU-bound on ML compute)
- High concurrency requirements (many agents running simultaneously)
- Complex state management (checkpoints, traces, escalations)

**LLM latency dominates.** When an LLM reasoning step takes 2 seconds — 1.9s is the API call, 100ms is everything else in that step. Switching from Python to Rust saves you 50ms on a 2000ms operation. It doesn't move the needle.

Python would be right if we were:
- Training custom models
- Running local inference (llama.cpp, vLLM)
- Building RAG pipelines with vector stores
- Heavy document processing (PDF parsing, OCR)

We're not doing any of that. We're orchestrating agents that call external APIs.

---

## Why Not Rust?

Rust offers memory safety without garbage collection and excellent concurrency primitives. For a high-throughput network service handling 100k+ concurrent WebSocket connections, Rust (or Go) is the right call.

But our workload is wrong for Rust:

- **No relevant ecosystem.** The LLM client libraries (`reqwest` wrappers), BullMQ alternatives, Postgres drivers — all of it would need to be built from scratch. In Node.js, `undici`, `bullmq`, `postgres` are already mature.
- **3–5x slower to develop.** Rust's learning curve and verbosity slow down iteration. For a startup racing to prove product-market fit, this is fatal.
- **The latency argument doesn't apply.** Our agents are I/O-bound on LLM API calls. Rust doesn't make HTTP calls to Anthropic's API faster.

Rust would be right for:
- Writing a new database engine
- Building an OS-level networking service
- Performance-critical WASM modules
- Anything where 50ms matters on every single operation

We're not doing any of that either.

---

## Why TypeScript / Node.js

### 1. Claude Code Is the Engineering Reference

Claude Code is Node.js/TypeScript. Every pattern we're stealing — `StreamingToolExecutor`, `partitionToolCalls`, `Tool<T>` interface, `withRetry`, SSE event types — is directly transferable. We don't adapt. We copy.

```typescript
// Claude Code's pattern ports directly to our codebase:
export async function* streamingExecute(
  llmStream: AsyncGenerator<LLMChunk>,
  tools: Tool[]
): AsyncGenerator<Chunk | ToolResult> {
  for await (const chunk of llmStream) {
    yield chunk;
    if (isToolCallsChunk(chunk)) {
      const { safe, unsafe } = partitionToolCalls(chunk.tool_calls, tools);
      yield* runConcurrently(safe);   // read — parallel
      yield* runSerially(unsafe);     // write — serial, approval-gated
    }
  }
}
```

Python would require reimplementation. Rust would require building from scratch. TypeScript is a direct port.

### 2. Shared Types End-to-End

```
Frontend (React) ←→ API Layer ←→ Backend (Agent Runtime)
     ↓                   ↓               ↓
  Zod schemas       Zod schemas     Zod schemas
  (shared npm       (shared npm      (shared npm
   package)          package)         package)
```

The same `Capability`, `CanvasNode`, `ReasoningStep`, `ToolDefinition` types are used everywhere. A schema change breaks the build — not a runtime error in production.

### 3. BullMQ Is Native to Node.js

Our job scheduling, heartbeat management, and durable execution are built on BullMQ. BullMQ is Node.js-only. Building our backend in Python or Rust means reimplementing the job queue.

BullMQ gives us:
- Reliable job processing with retries
- Delayed/repeatable jobs (cron scheduling)
- Priority queues
- Rate limiting
- Dead letter queues
- Job events for SSE subscription

### 4. Next.js Already Exists

The `app/` directory is already Next.js. The API layer and the frontend share the same process, same deployment, same environment variables. No extra infrastructure.

### 5. React Flow Is React/TypeScript

The infinite canvas is built on React Flow. React Flow is React (JSX) + TypeScript. The node components are React components. This is not optional — this is the technology.

---

## Full Stack Specification

### Frontend

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Framework | Next.js (App Router) | Latest | Already in repo. API routes + pages share deployment. |
| Language | TypeScript | 5.x (strict mode) | Compile-time safety, shared types |
| Canvas | React Flow | Latest | Node/wire graph, pan/zoom, handles built-in |
| Styling | CSS custom properties + Tailwind | v4 | Tokens from design-system-v2.md; Tailwind for utility |
| Icons | Lucide React | Latest | MIT, tree-shakeable, comprehensive |
| Forms | React Hook Form + Zod | Latest | Validation with shared schemas |
| State | Zustand | Latest | Lightweight, TypeScript-native, good for canvas state |
| SSE Client | Native EventSource | Built-in | Subscribe to reasoning trace streams |

### Backend Runtime

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | Node.js | Shared with frontend; Claude Code reference |
| Language | TypeScript | Shared types, compile-time safety |
| API | Next.js Route Handlers + tRPC | End-to-end type safety, Zod validation |
| Job Queue | BullMQ + Redis | Native Node.js, reliable scheduling |
| Database | Postgres (Neon or Vercel Postgres) | Checkpoints, runs, agents, traces |
| Postgres Client | `postgres` (postgres.js) | Fast, TypeScript-native, prepared statements |
| ORM | None (raw SQL via postgres.js) | Maximum control, no abstraction overhead |
| LLM Client | `@anthropic-ai/sdk` | Official Anthropic SDK, streaming |
| HTTP Client | `undici` | Fast async HTTP, SSE, WebSocket |
| Validation | Zod | Shared schemas with frontend |
| MCP | STDIO transport | Claude Code MCP client pattern |

### Infrastructure

| Layer | Technology | Rationale |
|---|---|---|
| Hosting | Vercel | Next.js native, easy Postgres + Redis add-ons |
| Database | Neon Postgres | Serverless Postgres, branching, good free tier |
| Cache/Queue | Upstash Redis | Serverless Redis, works with BullMQ |
| Object Storage | Vercel Blob or S3 | Trace artifacts, large tool outputs |
| Auth | Magic link (custom) | PRD MVP Feature 10; no OAuth complexity |
| Push | Web Push API | Native browser push, no third-party dependency |
| Monitoring | Vercel Analytics + custom | Page views + agent run metrics |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MARIA (Browser)                                  │
│   React Flow Canvas │ NL Prompt Bar │ Reasoning Trace Panel │ Escalation Modal│
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTPS + SSE
┌──────────────────────────────────▼──────────────────────────────────────────┐
│                         NEXT.JS APP (Vercel)                                 │
│                                                                              │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────────┐ │
│  │  Route Handlers  │   │  tRPC Router     │   │  SSE Stream Endpoint    │ │
│  │  (REST API)      │   │  (type-safe RPC)│   │  /api/runs/[id]/stream │ │
│  └────────┬─────────┘   └────────┬─────────┘   └────────────┬─────────────┘ │
│           │                      │                          │               │
│  ┌────────▼──────────────────────▼──────────────────────────▼─────────────┐ │
│  │                        AGENT RUNTIME (Node.js)                          │ │
│  │                                                                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │ │
│  │  │ DurableRunner│  │ ToolExecutor │  │ NLInterpreter│  │TeamLead    │  │ │
│  │  │ (async gen)  │  │ (streaming)  │  │              │  │Coordinator │  │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │ │
│  │         │                 │                  │                │          │ │
│  │  ┌──────▼─────────────────▼──────────────────▼────────────────▼──────┐  │ │
│  │  │                    CAPABILITY REGISTRY                            │  │ │
│  │  │  { gmail_read, gmail_send, hubspot_leads, filter, draft, ... }    │  │ │
│  │  └───────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │                    MCP CLIENT (STDIO transport)                 │   │ │
│  │  │            Gmail ── HubSpot ── Calendar ── Slack ── Web         │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │ │
│  │  │ BullMQ      │  │ Checkpoint   │  │ Push        │                    │ │
│  │  │ (job queue) │  │ Manager      │  │ Notifier    │                    │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                    │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│              ▼ Postgres                ▼ Redis (BullMQ)                      │
│         ┌─────────────┐           ┌─────────────┐                             │
│         │ Neon Postgres│           │ Upstash Redis│                             │
│         │ agents       │           │ jobs, queues │                             │
│         │ runs         │           │ heartbeats   │                             │
│         │ checkpoints  │           │              │                             │
│         │ traces (30d) │           └─────────────┘                             │
│         └─────────────┘                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Patterns from Claude Code (To Steal Directly)

These are implemented in Node.js TypeScript. We copy them:

| Pattern | Claude Code File | AgentOS Implementation |
|---|---|---|
| Tool executor (streaming) | `StreamingToolExecutor.ts` | `streamingToolExecutor.ts` |
| Read/write partitioning | `toolOrchestration.ts` | `partitionToolCalls()` |
| Retry with backoff | `withRetry.ts` | `withRetry()` |
| Tool interface | `Tool.ts` | `Capability` (same pattern) |
| SSE event types | ServerEvent pattern | `ServerEvent` types in trace streaming |
| Permission rules | `permissions.ts` | Escalation + approval system |
| Heartbeat protocol | Bridge heartbeat | BullMQ job heartbeat |
| Feature flags | `feature()` calls | `features.ts` |

---

## Data Models

### Postgres Schema (Core Entities)

```sql
-- orgs
CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  org_id UUID REFERENCES orgs(id),
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- agents (Team Lead is one per org; Workers are canvas nodes)
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('team-lead', 'worker')),
  name TEXT NOT NULL,
  archetype TEXT CHECK (archetype IN ('ingest', 'process', 'distill')),
  config JSONB NOT NULL DEFAULT '{}',
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  status TEXT DEFAULT 'stopped',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- wires
CREATE TABLE wires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id) NOT NULL,
  source_id UUID REFERENCES agents(id) NOT NULL,
  target_id UUID REFERENCES agents(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- runs
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) NOT NULL,
  status TEXT DEFAULT 'pending',
  exit_reason TEXT CHECK (exit_reason IN ('completed', 'escalated', 'budget_exceeded', 'stopped')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  step_count INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  escalation_count INT DEFAULT 0,
  checkpoint_data JSONB
);

-- run_steps (reasoning trace)
CREATE TABLE run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  step_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_run_steps_run_id ON run_steps(run_id);
CREATE INDEX idx_run_steps_created_at ON run_steps(created_at);

-- escalations
CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  step_id UUID REFERENCES run_steps(id) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- Retention: cron job deletes run_steps older than 30/90 days
```

### BullMQ Job Types

```typescript
// Agent run job
interface AgentRunJob {
  runId: string;
  agentId: string;
  input: object;
}

// Heartbeat job (runs every 30s per active agent)
interface HeartbeatJob {
  runId: string;
  step: number;
}

// Scheduled trigger (cron)
interface ScheduledTriggerJob {
  agentId: string;
  cronExpression: string;
}
```

---

## Non-Negotiables

These are constraints that cannot be violated regardless of stack decisions:

1. **No LLM call without retry.** Every Anthropic API call wraps `withRetry()` with exponential backoff. Circuit breaker after 3 consecutive failures.

2. **No tool execution without concurrency check.** `partitionToolCalls()` runs read tools in parallel and holds write tools until no reads are in-flight.

3. **No checkpoint skip.** Every tool result is checkpointed before the next step runs. A server restart always resumes from the last committed tool result.

4. **No escalation bypass.** Consequential tools (PAYMENTS, ADMIN, EXECUTE_CODE) always emit `escalated` exit reason and wait for Maria's response. No force-override.

5. **No trace without retention policy.** All `run_steps` rows have a TTL. A nightly cron job enforces it. No exceptions.

---

## Dependencies (package.json core)

```json
{
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "reactflow": "latest",
    "@anthropic-ai/sdk": "latest",
    "bullmq": "latest",
    "ioredis": "latest",
    "postgres": "latest",
    "zod": "latest",
    "trpc": "latest",
    "@trpc/server": "latest",
    "undici": "latest",
    "lucide-react": "latest",
    "zustand": "latest",
    "react-hook-form": "latest"
  }
}
```

---

## Deferred Decisions

| Decision | Why Deferred | Resolution Path |
|---|---|---|
| tRPC vs plain Route Handlers | Need to validate complexity vs type-safety payoff | tRPC if >5 API surface; plain handlers if simple |
| Redis client (ioredis vs @upstash/redis) | Upstash is serverless-native but ioredis is more generic | Default ioredis; switch if Upstash perf justifies it |
| Vercel Postgres vs Neon | Both are serverless Postgres; Neon has branching | Evaluate when deploying; both work |
| Rate limiting library | Depends on Redis choice | Defer to Phase 1 |
