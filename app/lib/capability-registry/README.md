# Capability Registry

Provides a centralized registry of agent capabilities with NL trigger matching, tool definitions, and permission levels.

## Files

- `types.ts` — TypeScript types and Zod schemas
- `index.ts` — `CapabilityRegistry` class with 8 built-in capabilities

## Architecture

- `CapabilityRegistry` — singleton registry mapping capability IDs to `Capability` definitions and `ToolDefinition`s
- `matchByTrigger(phrase)` — matches a natural language phrase against registered trigger phrases (supports fuzzy word matching)
- `getToolDef(name)` — returns `ToolDefinition` for a tool, exposing `isConcurrencySafe`, `isDestructive`, `permissionLevel`

## Built-in Capabilities

| ID | Archetype | Description |
|---|---|---|
| `gmail.read` | ingest | Read emails from Gmail |
| `gmail.send` | process | Send email via Gmail |
| `hubspot.leads` | ingest | Read leads from HubSpot CRM |
| `hubspot.write` | process | Write/update HubSpot CRM data |
| `web.search` | ingest | Search the web |
| `llm.reason` | process | LLM reasoning and analysis |
| `distill.summarize` | distill | Summarize content |
| `distill.notify` | distill | Send notification email |