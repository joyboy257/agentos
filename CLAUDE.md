# AgentOS — Developer Context

## What is AgentOS?

AgentOS is a visual platform for multi-agent AI orchestration — built for people who manage teams, not people who build software.

**Core reframe (v3):**
- Agents are the product — not a point solution
- The distribution problem is the real problem — most people who could use agents don't know they exist or can't configure them
- UI/UX is the moat — not the agent runtime, not the protocol

**ADE redefined:** "Agent Distribution Environment" — infrastructure that makes AI agents accessible to the masses, the same way Canva made design accessible to non-designers.

**The right comparison:** Not "VS Code for agents." It's **"Canva for AI agents."**

**Target users:** Small business owners wearing many hats. Marketing managers. Ops leads. People who use ChatGPT but have never built a multi-agent workflow. NOT developers.

---

## Competitive Landscape (v3)

| App | Type | Target | Canvas | Multi-Agent | Runtime |
|-----|------|--------|--------|-------------|---------|
| **Emdash** | ADE | Developers | ❌ | ✅ | ✅ (23 CLI agents) |
| **Glass** | ADE | Developers | ❌ | ❌ | ❌ |
| **Collaborator** | ADE | Developers | ✅ | ✅ | ❌ (terminals) |
| **Cling Kanban** | ADE | Developers | ✅ | ✅ | ❌ (display) |
| **AgentOS** | ADE | Everyone else | ✅ | ✅ | ✅ |

**Key insight:** Every existing ADE targets developers. No ADE targets non-technical business users. That's the opening.

---

## The Three Premises

1. **Agents are the product** — not a social media tool, not a Google Ads optimizer. AgentOS makes any agent accessible to anyone.
2. **Distribution problem is real** — most people who could benefit don't know what agents are or can't configure them.
3. **UI/UX is the moat** — the feeling of opening a canvas, dragging in an agent, and understanding immediately what to do. Canva-level usability for multi-agent AI.

---

## Current Status

- **Stage:** Pre-product, v3 planning
- **All v2 docs archived** to `docs/archived/v2/` — v2 was developer-focused and had 11 unresolved gaps
- **v3 direction:** Non-technical business users as primary, visual orchestration canvas, Canva-level usability

## Key Directories

- `docs/` — design documents and brainstorms
- `docs/archived/` — archived work, including all v2 material
- `ceo-plans/` — CEO-level plans

## Architecture Notes (from v2 — may inform v3)

- Electron-based desktop app (main process = process supervisor, renderer = sandboxed UI)
- MCP (Model Context Protocol) for tool/agent communication
- React Flow for canvas, xterm.js for terminal
- better-sqlite3 for persistence
- See TODOs.md T1-T7 for engineering concerns

## Deploy Configuration

Two separate Vercel deployments:

| Project | Local Path | Vercel Project |
|---------|------------|----------------|
| Landing page | `/Users/deon/agentos/landing/` | vercel.com/project/landing |
| App | `/Users/deon/agentos/app/` | vercel.com/project/agentos-app |

### Deploy Instructions

**Landing:**
```bash
cd /Users/deon/agentos/landing && vercel --prod
```

**App:**
```bash
cd /Users/deon/agentos/app && vercel --prod
```

**Important:** Root `/Users/deon/agentos/` has no package.json. Build from subdirectories only.

---

## Design Principles

- **Show, don't tell** — users understand by doing, not reading
- **Non-technical first** — no jargon, no configuration files, no terminals
- **Agent as team member** — not a pipeline, not a workflow — a person you put to work
- **Visual handoffs** — connect agents by dragging, not by writing YAML
