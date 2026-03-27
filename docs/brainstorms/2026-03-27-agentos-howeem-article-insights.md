---
date: 2026-03-27
topic: agentos-howeem-article-insights
---

# AgentOS: hooeem Article Insights for v1.2 Planning

## Problem Frame

The hooeem "Build an AI Agent From Scratch" article (March 26, 2026) validates and sharpens AgentOS's product direction. Six insights directly affect what to build in v1, v1.1, and v1.2. This doc captures those implications so they survive the current session.

## Insights and Product Implications

### I1: Use the Five Workflow Patterns as Capability Taxonomy

The article's five patterns (prompt chaining, routing, parallelisation, orchestrator-workers, evaluator-optimiser) are the established vocabulary agent builders already know. Use these as the top-level category labels in the Discovery Panel, not custom names.

**Implication for v1 seed data:** Name capability entries after these patterns. "Orchestrator-Workers" as a capability label is immediately meaningful. "Research Pipeline" is not.

**Implication for Discovery Panel:** When selected tools map to a pattern, the edge connects to a label like "Parallelisation" with a tooltip explaining the pattern.

### I2: The Structured Card IS the Agent Formula

The article's mental model `Agent = Role + Goal + Tools + Rules + Output format` maps directly to AgentOS's hybrid card:

| Formula Element | AgentOS Location |
|---|---|
| Role + Goal | Memory/Config section (system prompt, agent name) |
| Tools | Tool Canvas with capability graph |
| Rules | Reliability config (safety boundaries, health checks) |
| Output format | Export layer (YAML, MCP, OpenAI JSON) |

**Implication:** The card's structural clarity is a feature, not an accident. Validate this mapping in user testing.

### I3: The Durable Moat Is Evaluation, Not Export

> "The core loop fits in 50 lines of Python. The real work is in tool design, error handling, evaluation."

MCP is explicitly named in the article as having "become a universal standard in under a year." This confirms the MCP commoditisation risk flagged in the v2 thesis. The export layer is syntax. The durable moat is:

- The capability DB (which combinations actually work)
- The Generator-Evaluator pipeline (v1.2)
- The Verification harness (v1.2)
- The Discovery Panel (where capabilities are discovered and trusted)

**Implication:** Accelerate v1.2 planning for the Generator-Evaluator pipeline. Deprioritise MCP export complexity — it's table stakes, not advantage.

### I4: Fewer Tools = More Reliable. Minimal Tool Sets Signal Quality.

> "Better tools = smarter agent. Fewer tools = more reliable agent."

A capability with 8 toolIds is a "super-agent" anti-pattern — exactly what the article warns against. Flag high tool-count capabilities in the Discovery Panel.

**Implication:** Seed the capability DB with a `complexity` or `toolCount` field. Entries with 5+ tools marked as "experimental/complex." The "Partial" state in Discovery Panel signals "you have some of what you need" without demanding all tools.

### I5: Discovery Panel Is Visual Version of the Course

The article's value is showing builders "which tools combine to do what." The Discovery Panel does this visually — instead of reading about tool combinations, users see them emerge as they configure.

**Implication:** This validates the land-and-expand GTM. The content strategy for v1.1 should include publishing worked examples of capability combinations — essentially blog posts that are also Discovery Panel introductions.

### I6: AI-Assisted Agent Design as Onboarding Feature

> "Ask Claude or ChatGPT to turn your one-sentence goal into: agent spec, system prompt, tool list, 10 test prompts."

An "AI-assisted agent design" mode in AgentOS would lower the barrier to entry: paste your goal, get back Role, Goal, Tool suggestions, Rules, Output format. This seeds the capability DB with real user intent.

**Implication:** Consider as a v1.1 or v1.2 feature. Depends on v1 engagement metrics. If first-run experience shows users stuck on "what should I build?", this becomes a priority.

## Requirements

- R1. Name capability DB entries after the five Anthropic workflow patterns (prompt chaining, routing, parallelisation, orchestrator-workers, evaluator-optimiser) as the primary category labels
- R2. Add a `toolCount` or `complexity` field to the capability schema. Flag entries with 5+ tools as "experimental/complex"
- R3. Accelerate v1.2 Generator-Evaluator pipeline design — this is the durable moat, not the export layer
- R4. Write a worked example for each of the five workflow patterns as Discovery Panel seed content (in addition to the 30+ minimum entries)
- R5. Add "AI-assisted agent design" as a tracked v1.2 feature candidate; gate behind v1 first-run engagement metrics

## Key Decisions

- **Decision:** Use the five named workflow patterns as Discovery Panel taxonomy, not custom names. Rationale: builders already know these terms from Anthropic's published work.
- **Decision:** Complexity/tool-count flag on capability entries. Rationale: "fewer tools = more reliable" is a core principle that should be visible in the UI.
- **Decision:** Generator-Evaluator pipeline is the priority moat over MCP export. Rationale: MCP is becoming universal; export syntax is commoditisable, evaluation is not.

## Dependencies / Assumptions

- D1: The capability DB seeding (30+ entries) must use the five-pattern taxonomy — this is a content constraint, not a design constraint
- D2: v1.2 Generator-Evaluator pipeline design depends on the Generator-Evaluator deferred TODO from the CEO plan

## Outstanding Questions

### Resolve Before Planning
- None — these are implications from external validation, not blocking decisions

### Deferred to Planning
- [I3] Generator-Evaluator pipeline design: what does the Evaluator scorecard look like? (Deferred to v1.2 planning)
- [I6] AI-assisted agent design: what does the input/output look like? (Deferred to v1.2 planning pending v1 engagement data)

## Next Steps

→ Resume `/ce:brainstorm` if hooeem publishes follow-up content or new demand signals emerge
→ `/ce:plan` for v1.2 Generator-Evaluator pipeline when that phase begins
