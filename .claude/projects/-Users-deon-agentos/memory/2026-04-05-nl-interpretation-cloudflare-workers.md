---
name: nl-interpretation-cloudflare-workers
description: Cloudflare Workers + AI Gateway chosen for NL interpretation server
type: reference
---

# NL Interpretation Server: Cloudflare Workers + AI Gateway

**Decision date:** 2026-04-05
**Context:** Open question from `docs/plans/2026-04-03-006-feat-agentos-nl-prompt-preview-flow.md`

## Decision

NL interpretation server = **Cloudflare Workers + AI Gateway** (not Next.js API route).

## Rationale

- Near-zero cold starts (V8 isolates vs Vercel's 500ms-2s cold starts)
- AI Gateway built-in: prompt caching + semantic deduplication reduces LLM costs
- Stateless workload (NL → nodes/edges) is the perfect Workers use case
- Global edge distribution

## Architecture

```
Maria types goal → Vercel Next.js → Cloudflare Worker (AI Gateway) → Claude
                                    ↓
                              cached response?
```

## Files to create

- `workers/nl-interpret/index.ts` — main Worker entry
- `workers/nl-interpret/prompt.ts` — NL interpretation prompt template
- `workers/nl-interpret/schema.ts` — Zod schemas for request/response
- `workers/wrangler.toml` — Workers config
- `app/lib/nl-interpret-client.ts` — client in Next.js app

## Open technical considerations

- Hyperdrive for Postgres access: verify per-tenant RLS works through Workers + Hyperdrive
- AI Gateway prompt cache key strategy
- Fallback retry logic to Next.js route
