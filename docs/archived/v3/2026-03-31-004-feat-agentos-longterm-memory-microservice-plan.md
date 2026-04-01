---
title: "feat: Long-Term Memory Microservice"
type: feat
status: active
date: 2026-03-31
---

# Long-Term Memory Microservice

## Overview

Implement a memory microservice that gives agents persistent context across sessions — remembering what happened in past runs, user preferences, and accumulated knowledge. Backed by mem0.ai for LLM-powered memory extraction and Qdrant for semantic vector search.

**Architecture:** AgentOS is NOT a memory-first platform. This is a microservice that AgentOS calls via REST API — keeping AgentOS itself clean and focused on orchestration.

## Problem Frame

Working memory (per-session) solves short-term context. Long-term memory solves:
- "Agent ran a lead research task 2 weeks ago. Today user wants to follow up on those leads."
- "User prefers short, direct emails. Agent should draft accordingly."
- "User's team has 3 members. Agent should route to correct person automatically."

**This is the key differentiator vs. stateless automation tools.** Zapier has no memory. AgentOS with memory learns.

## Requirements Trace

- **New requirement (from AgentScope adoption):** Cross-session memory for personalized, context-aware agent behavior
- **New requirement:** Memory that improves agent quality over time as it learns user preferences and patterns

## Key Technical Decisions

**Decision: mem0.ai as the LLM extraction layer (not self-hosted).**
- Rationale: mem0.ai provides managed LLM extraction API — no self-hosted model needed. Simple REST integration.
- Alternative: Self-host an extraction model (ReMe from AgentScope) — rejected for MVP due to infrastructure complexity.
- Future: Can swap mem0 for self-hosted ReMe without changing the AgentOS client interface.

**Decision: Qdrant as the vector store (not Pinecone or Weaviate).**
- Rationale: Qdrant is open-source, Docker-deployable, and has better Python/TypeScript SDK support than Weaviate.
- Alternative: Pinecone — rejected because it's a third-party SaaS with separate pricing.
- Future: Can swap vector stores if needed.

**Decision: Postgres for structured facts (existing @vercel/postgres).**
- Rationale: Structured facts (user preferences, team members, recurring tasks) are better stored relationally than as vectors.
- Facts table: `user_id`, `category`, `fact_key`, `fact_value`, `created_at`, `updated_at`

**Decision: Microservice is standalone, NOT embedded in AgentOS app.**
- Rationale: Memory operations (LLM extraction, vector search) are slow. Running them in-process blocks agent execution.
- Alternative: Run memory ops in worker threads — rejected because Node.js worker threads share memory complexity.

## Scope Boundaries

- **Memory deletion by user** — out of scope (user can't delete specific memories yet)
- **Memory consent/GDPR** — out of scope (handled at data layer, same as traces)
- **Multi-modal memory (images, files)** — out of scope (text only for v1)
- **Memory TTL/expiration** — out of scope (manual flush only)

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AgentOS App                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Working Mem │  │ Memory API   │  │ Agent Runner              │  │
│  │ (in-process)│  │ Client       │  │                           │  │
│  │             │  │              │  │  1. Run agent              │  │
│  │ (session)   │  │ /memory/     │  │  2. On completion,         │  │
│  │             │  │   remember    │  │    call remember API       │  │
│  │             │  │  /memory/    │  │  3. On start, call         │  │
│  │             │  │   recall      │  │    recall API              │  │
│  └─────────────┘  └──────┬───────┘  └──────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────────┘
                           │ REST
┌──────────────────────────▼──────────────────────────────────────────┐
│                    Memory Microservice                                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                      FastAPI App                             │    │
│  │                                                              │    │
│  │  POST /memory/remember    — Extract facts, store vectors     │    │
│  │  GET  /memory/recall      — Semantic search + fact lookup   │    │
│  │  GET  /memory/stats       — Retention stats for user        │    │
│  │  DELETE /memory/forget    — Clear user memory (GDPR)        │    │
│  │                                                              │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │                   mem0.ai                            │    │    │
│  │  │  LLM extraction: conversation → structured facts     │    │    │
│  │  │  Mem0Memory API (REST)                              │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │    │
│  │  │   Qdrant     │  │  Postgres    │  │  Redis       │     │    │
│  │  │  (vectors)   │  │  (facts)    │  │  (cache)    │     │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### API Contract

#### POST /memory/remember

Extract and store key facts from a conversation session.

```json
// Request
{
  "userId": "user_123",
  "agentId": "lead_researcher",
  "sessionId": "run_abc",
  "messages": [
    { "role": "user", "content": "Research healthcare startups in SF" },
    { "role": "agent", "content": "Found 12 healthcare startups..." },
    { "role": "user", "content": "Which ones are Series A?" }
  ]
}

// Response
{
  "stored": true,
  "factsExtracted": 4,
  "vectorIds": ["v_1", "v_2", "v_3", "v_4"]
}
```

mem0.ai processes the messages and returns structured facts:
```json
{
  "facts": [
    { "fact": "User is interested in healthcare startups", "category": "research_interest" },
    { "fact": "User prefers Series A startups", "category": "investment_preference" },
    { "fact": "San Francisco is the target geography", "category": "geography" }
  ]
}
```

#### GET /memory/recall

Retrieve relevant memories for a given context.

```json
// Request
{
  "userId": "user_123",
  "query": "What startups is the user interested in?",
  "limit": 5
}

// Response
{
  "memories": [
    {
      "fact": "User is interested in healthcare startups",
      "category": "research_interest",
      "score": 0.94,
      "source": "session_run_xyz"
    },
    {
      "fact": "User prefers Series A startups",
      "category": "investment_preference",
      "score": 0.89,
      "source": "session_run_abc"
    }
  ],
  "vectorResults": [
    { "id": "v_5", "content": "Healthcare AI companies in Boston...", "score": 0.78 }
  ]
}
```

#### DELETE /memory/forget

GDPR-compliant memory deletion for a user.

```json
// Request
{ "userId": "user_123" }

// Response
{ "deletedVectors": 47, "deletedFacts": 12 }
```

## Implementation Units

- [ ] **Unit 1: Microservice Core**

**Goal:** FastAPI microservice with mem0.ai, Qdrant, and Postgres integration.

**Files:**
- Create: `memory-service/main.py` (FastAPI app)
- Create: `memory-service/requirements.txt`
- Create: `memory-service/remember.py` (POST /memory/remember handler)
- Create: `memory-service/recall.py` (GET /memory/recall handler)
- Create: `memory-service/models.py` (Pydantic request/response models)
- Create: `memory-service/qdrant_client.py` (Qdrant connection)
- Create: `memory-service/mem0_client.py` (mem0.ai REST client)
- Create: `memory-service/Dockerfile`
- Create: `memory-service/docker-compose.yaml` (Qdrant + Redis)

**Approach:**
- FastAPI app with these routes:
  - `POST /memory/remember` — calls mem0.ai extraction → stores in Qdrant + Postgres facts
  - `GET /memory/recall` — semantic search in Qdrant + fact lookup in Postgres → merged results
  - `GET /memory/stats` — returns memory count per user
  - `DELETE /memory/forget` — deletes all vectors and facts for user
- Qdrant collection: `agent_memory` with `user_id` filter
- Postgres table: `structured_facts(user_id, category, fact_key, fact_value, created_at)`
- Redis cache: recent recall results with 5-minute TTL

**Patterns to follow:**
- `agentscope/src/agentscope/memory/_long_term_memory/mem0.py` for mem0 integration
- AgentScope's `Mem0Memory` as API reference

**Test scenarios:**
- Remember endpoint extracts and stores facts from mock conversation
- Recall returns relevant memories for a query
- Forget deletes all user memories

**Verification:**
- Unit tests with mocked mem0.ai and Qdrant
- Docker compose up with real services for integration test

---

- [ ] **Unit 2: AgentOS Memory Client**

**Goal:** TypeScript client library for AgentOS to call the memory microservice.

**Files:**
- Create: `lib/memory/memory-client.ts`
- Create: `lib/memory/memory-types.ts`
- Create: `lib/memory/index.ts` (exports both WorkingMemory and MemoryClient)

**Approach:**
```typescript
class MemoryClient {
  constructor(baseUrl: string, apiKey: string)

  // Called by runner after agent completes
  async remember(params: {
    userId: string
    agentId: string
    sessionId: string
    messages: { role: string; content: string }[]
  }): Promise<void>

  // Called by runner before agent starts
  async recall(params: {
    userId: string
    query: string
    limit?: number
  }): Promise<MemoryResult>

  // Admin: delete all memories for user
  async forget(userId: string): Promise<void>
}
```

**Patterns to follow:**
- `lib/mcp/mcp-client.ts` for HTTP client patterns
- `lib/middleware/` for error handling

**Test scenarios:**
- Client calls remember endpoint with correct payload
- Client calls recall and parses response correctly
- Client handles mem0 API errors gracefully

**Verification:**
- Integration test with running memory service

---

- [ ] **Unit 3: Runner Memory Integration**

**Goal:** Runner calls memory API on agent startup (recall context) and completion (remember).

**Files:**
- Modify: `lib/runtime/runner.ts` — inject MemoryClient, call on start/complete
- Modify: `lib/nl/types.ts` — add `memory` field to Agent config

**Approach:**
- Runner has `memoryClient?: MemoryClient` (optional — degrades gracefully if service unavailable)
- On agent start: call `memoryClient.recall(userId, agentDescription)` → inject results as memory context
- On agent complete: call `memoryClient.remember(userId, agentId, sessionId, messages)` → extract facts
- If memory service is down: log warning, continue without memory (no blocking)
- Memory context injected as a `system` mark entry in WorkingMemory

**Patterns to follow:**
- Existing runner tool injection pattern
- Graceful degradation from `lib/middleware/with-retry.ts`

**Test scenarios:**
- Runner calls recall before agent starts (when memoryClient is set)
- Runner calls remember after agent completes
- Runner continues normally when memory service is unavailable
- Memory context appears as WorkingMemory entry in SSE trace

**Verification:**
- End-to-end with running memory service

---

- [ ] **Unit 4: Memory Context Tool**

**Goal:** Expose memory recall as a tool the agent can call during execution.

**Files:**
- Create: `lib/memory/memory-tool.ts` (implements ToolFunction interface)
- Modify: `lib/runtime/runner.ts` — register memory recall tool

**Approach:**
- Agent can call `memory.recall(query: string)` as a tool during execution
- Tool calls `memoryClient.recall()` and returns formatted context
- Allows agent to proactively retrieve memories mid-run, not just at start

**Patterns to follow:**
- `lib/runtime/tools/` for existing tool patterns

**Test scenarios:**
- Agent calls `memory.recall("what did we research last time?")` and receives relevant memories
- Memory tool handles service errors gracefully

**Verification:**
- Agent run with memory tool calls verified in SSE trace

---

## System-Wide Impact

- **Runner:** Now depends on optional memory service — graceful degradation required
- **Tracing:** Memory events (recall/remember) appear in SSE trace
- **Canvas:** Memory tool visible as agent capability
- **A2A (future):** A2A agents can carry memory context in task payload

## Risks & Dependencies

- **mem0.ai dependency:** Third-party API — pricing, uptime, data privacy. Mitigation: mem0 offers HIPAA/SOC2, facts are user-level not raw conversation.
- **Qdrant infrastructure:** Self-hosted vector store adds deployment complexity. Mitigation: docker-compose for dev, managed Qdrant Cloud for production.
- **Latency:** Recall adds 200-500ms to agent startup. Mitigation: Redis cache for recent recalls, async remember (fire-and-forget).
- **Memory quality:** LLM extraction may miss important facts or hallucinate. Mitigation: confidence scores on recall, let agent validate.

## Documentation / Operational Notes

- `memory-service/README.md` for deployment instructions
- Document Docker compose setup for local development
- Document Qdrant Cloud setup for production
- Document mem0.ai API key setup
- Document GDPR behavior (forget deletes all vectors + facts)

## Deployment

```bash
# Development
cd memory-service && docker-compose up -d  # Qdrant + Redis
cp .env.example .env  # Set MEM0_API_KEY

# Production (Qdrant Cloud)
# 1. Create Qdrant Cloud cluster
# 2. Set QDRANT_URL, QDRANT_API_KEY in environment
# 3. Set MEM0_API_KEY
# 4. Deploy FastAPI to Vercel (serverless) or Cloud Run
```

## Sources & References

- `agentscope/src/agentscope/memory/_long_term_memory/mem0.py` — mem0 integration reference
- `agentscope/src/agentscope/memory/_long_term_memory/reme.py` — ReMe library reference (future alternative)
- [mem0.ai](https://mem0.ai) — LLM memory API
- [Qdrant](https://qdrant.tech) — Vector database
