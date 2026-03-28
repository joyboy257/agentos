# AgentOS — Reimagined: The AI-Native IDE and Terminal

**Status:** DRAFT — For /office-hours review
**Date:** 2026-03-28
**Based on:** Multi-agent research synthesis (canvas editors, MCP ecosystem, orchestrator patterns, agent runtimes)

---

## tl;dr

The IDE and terminal were built for humans writing code. AI agents are not humans writing code — they are autonomous processes that *use* tools, *collaborate* with other agents, and *reason* about what to do next. Every existing tool (n8n, CrewAI, AutoGen Studio, Dify, LangFlow) either bolts AI onto a workflow canvas designed for APIs, or gives you raw code with no visual debugging. **AgentOS is the first environment built from scratch for what AI agents actually are: living, reasoning processes that run in the terminal and can be composed visually on a canvas.**

---

## The Core Premise

### What Tools Exist Today

| Tool | What it is | Why it's incomplete |
|------|-----------|-------------------|
| **Terminal/SSH** | Human interface to shell | Not agent-aware — no concept of tool calls, reasoning traces, or multi-agent state |
| **VS Code + Copilot** | Human IDE with AI autocomplete | Session-based, not persistent; no canvas, no workflow orchestration |
| **n8n** | Visual workflow builder for APIs | Workflows are static API pipelines, not *agents* — no reasoning, no tool autonomy |
| **CrewAI** | Code-first multi-agent framework | No canvas, no visual debugging, no runtime visibility |
| **AutoGen Studio** | Visual agent builder | Research prototype, not production-ready; agent reasoning is opaque |
| **Dify/LangFlow** | Visual LLM flow builders | Built for RAG and prompt chaining, not autonomous agents with tool use |
| **Claude Code** | Best-in-class agent coding | Session-based, solo, no visual orchestration, terminal-only |

### The Gap Nobody Is Filling

**Every existing tool treats agents as either:**
1. **A workflow step** — n8n, Dify, LangFlow: agents are nodes in a pipeline, not autonomous entities
2. **A code library** — CrewAI, AutoGen: agents are Python classes, not first-class visual objects

**Agents are neither of these things.**

An agent is:
- A **process** that runs over time, not a step in a pipeline
- A **reasoning entity** that decides its own next action, not a function that executes deterministically
- A **tool user** that can call external capabilities, not just pass data along
- A **collaborator** that can hand off to other agents, not just return a value
- A **persistent entity** with memory across sessions, not a stateless function

The IDE and terminal were designed for *humans writing code*. They were never designed for *agents running workflows*. That's the gap.

---

## What AgentOS Is

### Not a Dashboard
Dashboards show you what *happened*. AgentOS is a live environment where things *happen*.

### Not a Config Form
Forms let you configure things. AgentOS is where things run.

### A Live Working Environment
AgentOS is to agents what VS Code is to code — the place where you build, run, debug, and orchestrate them. Not a preview. Not a config export. The actual working environment.

---

## The Three Pillars

### Pillar 1: The Canvas — Visual Agent Composition

**The mental model:** Not "nodes connected by wires." Not "flowchart." The canvas is a **workspace** where agents exist as living objects, not static nodes.

**What agents look like on the canvas:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ┌──────────┐         ┌──────────┐         ┌──────────┐  │
│    │ Research │────────▶│ Writer   │────────▶│ Publisher │  │
│    │  Agent   │         │  Agent   │         │  Agent   │  │
│    └──────────┘         └──────────┘         └──────────┘  │
│         │                                           │       │
│         ▼                                           ▼       │
│    ┌──────────┐                              ┌──────────┐  │
│    │  Tools:  │                              │  Tools:  │  │
│    │ Web Scrape│                             │ Discord  │  │
│    │  Search  │                              │  Slack   │  │
│    └──────────┘                              └──────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**But agents are NOT just boxes on a canvas.** They are living processes. The canvas shows:
- **Agent state** — idle, running, waiting for input, error, completed
- **Message flow** — animated lines showing handoffs between agents
- **Tool calls** — expand an agent to see what tools it's using right now
- **Reasoning trace** — collapsible decision tree showing what the agent decided and why

**Canvas interactions:**
- Drag agents from a palette onto the canvas
- Connect them by drawing edges (handoff relationships)
- Click an agent to open its live workbench (see what it's doing *right now*)
- Multi-select agents and create a group (a "crew")
- Canvas is infinite — pan, zoom, minimap navigation

**The Orchestrator Agent — the visual watchdog:**

Every canvas has a special **Orchestrator Agent** that watches all other agents:

```
┌─────────────────────────────────────────────────────────────┐
│  🛡️ Orchestrator                              [Watching: 3 agents] │
│  ──────────────────────────────────────────────────────── │
│  ● Research Agent: Running (step 4/12)                     │
│  ● Writer Agent: Waiting (handoff received)                │
│  ● Publisher Agent: Idle                                   │
│                                                             │
│  ⚠️ Alert: Research Agent exceeded expected time on        │
│     Web Search tool. Options: [Retry] [Skip] [Inspect]     │
└─────────────────────────────────────────────────────────────┘
```

The Orchestrator is:
- A **first-class agent** that can be configured with its own tools and rules
- A **visual supervisor** — shows you what's happening across the canvas in real-time
- A **failure handler** — catches errors, retries, or escalates based on configurable policies
- A **human-in-the-loop gateway** — can pause and ask for approval before critical actions

### Pillar 2: The Terminal — Agent Runtime

**The terminal is not a separate thing AgentOS talks to. The terminal IS the agent runtime.**

This is the critical distinction. In existing tools, you configure an agent, export its config, and run it somewhere else. In AgentOS, when you click "Run" on an agent on the canvas, it spawns a process in the integrated terminal and you watch it work in real-time.

**Integrated terminal that IS the runtime:**

```
┌─────────────────────────────────────────────────────────────┐
│  bash — agentos:research-agent-001              [×] [−] [□] │
│  ───────────────────────────────────────────────────────── │
│  > Research Agent starting...                              │
│  > Loading tools: web_search, file_system, browser         │
│  > Context window: 200k tokens                             │
│                                                             │
│  [ Reasoning Trace ]                           [Tool Calls ] │
│  ───────────────────────────────────────────────────────── │
│  Thinking: "I need to find recent papers on..."            │
│  Decision: Call web_search with query "..."                │
│  ───────────────────────────────────────────────────────── │
│  🔧 web_search: Query = "..."                              │
│  📄 browser.navigate: url = "..."                          │
│  💾 memory.save: key = "research_001"                      │
│                                                             │
│  [ Completed in 47s ]  [ View Full Trace ]  [ Export ]     │
└─────────────────────────────────────────────────────────────┘
```

**What the integrated terminal provides:**

- **Live output streaming** — see agent reasoning and tool calls as they happen
- **Reasoning trace** — every decision the agent made, collapsible and inspectable
- **Tool call inspector** — expand any tool call to see input/output
- **Interactive debugging** — pause the agent, step through tool calls, inject context
- **Process persistence** — agents survive tab close; pick up where you left off
- **Shell access** — drop into a shell inside the agent's context to inspect files, run commands

**Why this matters:**
Claude Code is the best agent experience today because it's terminal-native. AgentOS takes that power and makes it visual and collaborative — multiple agents visible on a canvas, running in real-time, watched by an orchestrator.

### Pillar 3: The Discovery Panel — Capability Map

**Same as before, but now the capabilities are visible ON the canvas as edges.**

When you connect two agents on the canvas (or connect an agent to a tool), the Discovery Panel shows you what capability that combination unlocks:

```
┌─────────────────────────────────────────────────────────────┐
│  DISCOVERY PANEL                              [Seed DB: 47] │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  Ready Capabilities:                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● Research Pipeline                                 │   │
│  │   web_search + browser + memory                    │   │
│  │   "Cross-reference claims across multiple..."       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Partial:                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ○ Multi-hop Synthesis → needs: code_interpreter     │   │
│  │   web_search + file_system ──────────────────────▶? │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Ghost nodes on canvas:                                     │
│  [ ? ] Code Interpreter — would enable: Code Runner        │
│  [ ? ] Memory Store — would enable: Persistent Context    │
└─────────────────────────────────────────────────────────────┘
```

**The capability edge on the canvas:**
When two agents or tools on the canvas compose a known capability, a labeled edge draws itself between them — the same as before, but now the edge is on the same canvas where the agents are running.

---

## The Architecture

### System Layers

```
┌──────────────────────────────────────────────────────────────┐
│                      CANVAS LAYER                            │
│  Infinite canvas with agents as living nodes                 │
│  Pan/zoom, minimap, multi-select, groups                    │
│  Real-time state visualization (running, idle, error)        │
│  Animated message flow edges                                │
│  Capability edges (dashed when partial, solid when ready)   │
├──────────────────────────────────────────────────────────────┤
│                   WORKBENCH LAYER                           │
│  Live terminal per agent — reasoning trace, tool inspector  │
│  Orchestrator panel — watching all agents, alert policies   │
│  Debugger — pause, step, inject context                     │
├──────────────────────────────────────────────────────────────┤
│                    AGENT RUNTIME LAYER                      │
│  Per-agent process: tool executor, reasoning loop, memory   │
│  MCP client — connects to any MCP server                    │
│  Handoff protocol — agent-to-agent communication           │
│  Checkpoint/resume — agents survive context loss           │
├──────────────────────────────────────────────────────────────┤
│                   ORCHESTRATOR LAYER                        │
│  Supervisor agent watching all canvas agents                 │
│  Alert policies: retry, skip, escalate, human-in-loop       │
│  Fleet overview: all agents, all states, all outputs       │
├──────────────────────────────────────────────────────────────┤
│                    DISCOVERY ENGINE                         │
│  Capability DB: tool→capability mappings                    │
│  Edge renderer: given selected tools, draw capability edges │
│  Ghost nodes: what would this combo enable if added?        │
└──────────────────────────────────────────────────────────────┘
```

### Runtime Model

**AgentOS is not a frontend that talks to a backend.** AgentOS *is* the runtime. When you create an agent and click Run:

1. A new process spawns (Node.js worker or Python subprocess)
2. The MCP client connects the agent to its configured tools
3. The agent's reasoning loop starts
4. Output streams to the live workbench terminal
5. The orchestrator watches and enforces policies
6. The canvas updates in real-time to reflect agent state

**No cloud required for local development.** Agents run on your machine, in your terminal, with full process visibility. Cloud sync (for teams) comes later.

---

## The Orchestrator Agent — Deep Dive

The Orchestrator is the feature that makes AgentOS fundamentally different from every other canvas-based tool.

### What Is It?

The Orchestrator is a **special-purpose agent** that:
- Has **visibility into all other agents** on the canvas
- Can **read their state, outputs, and reasoning traces**
- Has a **configurable alert policy** for what to do when something goes wrong
- Can **take actions** (retry, skip, escalate, ask a human)

### Configurable Policies

```yaml
orchestrator:
  watch:
    - all_agents  # or specific agents by name/role

  policies:
    on_timeout:
      action: retry
      max_retries: 3
      backoff: exponential

    on_error:
      action: escalate
      notify: slack
      require_human_approval: true

    on_long_running:
      threshold: 5m
      action: alert
      show_context: true

    on_handoff_delay:
      threshold: 30s
      action: inspect
      show_reasoning: true
```

### Human-in-the-Loop

The Orchestrator can be configured to **pause and wait** before taking critical actions:

```
┌─────────────────────────────────────────────────────────────┐
│  🛡️ Orchestrator — APPROVAL REQUIRED                       │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  Writer Agent wants to send email to: external@company.com  │
│                                                             │
│  Reasoning: "The research is complete and quality checks    │
│             passed. Sending to external stakeholder as      │
│             requested in the task."                         │
│                                                             │
│  Tool call: send_email(to="external@company.com", ...)     │
│                                                             │
│  [ Approve ]  [ Reject ]  [ Inspect Agent ]  [ Modify ]   │
└─────────────────────────────────────────────────────────────┘
```

This is not a modal that blocks the entire system. The Orchestrator pauses *this agent* while others continue. The canvas shows the agent in a "waiting for approval" state.

---

## The Canvas Interactions

### Agent Node Anatomy

```
┌─────────────────────────────────────────┐
│  ┌────┐  Research Agent        ● Running │
│  │ 🤖 │  research-team         ↻ 4/12    │
│  └────┘                                    │
├────────────────────────────────────────────┤
│  🛠️ Tools:                                │
│  • web_search ✓                           │
│  • browser ✓                              │
│  • memory ✓                               │
│  • code_interpreter ✗ (missing)           │
├────────────────────────────────────────────┤
│  📊 This session:                          │
│  • 12 tool calls                          │
│  • 3 reasoning loops                      │
│  • 0 errors                               │
├────────────────────────────────────────────┤
│  [ Expand Workbench ]  [ ⏸ Pause ]  [ × ] │
└─────────────────────────────────────────────┘
```

### Edge Types

| Edge Type | Meaning | Appearance |
|-----------|---------|------------|
| **Handoff** | Agent A passed work to Agent B | Solid animated arrow |
| **Tool use** | Agent is using a tool | Dotted line with tool icon |
| **Capability** | Tools/agents compose a known capability | Dashed labeled line |
| **Memory** | Agent saved/loaded from memory | Dash-dot line |
| **Dependency** | Agent B depends on output from Agent A | Solid arrow with condition |

### Canvas Operations

| Action | How |
|--------|-----|
| Add agent | Drag from palette, or right-click canvas → "Add Agent" |
| Connect agents | Drag from agent output port to another agent's input |
| Configure agent | Double-click agent node |
| Open live workbench | Click "Expand Workbench" on agent node |
| Create group/crew | Multi-select agents → right-click → "Create Crew" |
| Add orchestrator rule | Right-click agent → "Add Watch Policy" |
| See capability edges | They appear automatically when agents match a capability pattern |

---

## MCP Integration

AgentOS is MCP-native at the runtime level.

### What This Means

Every agent on the canvas can connect to any MCP server. The canvas shows:
- Which MCP servers are connected
- Which agents are using which MCP tools
- The capability edges that MCP tools enable

### MCP Tool Palette

```
┌─────────────────────────────────────────────────────────────┐
│  MCP SERVERS                                    [ + Add ] │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  🟢 filesystem         14 tools  Connected                  │
│  🟢 github             12 tools  Connected                  │
│  🟢 memory             3 tools   Connected                  │
│  🟡 brave-search       — tools   Connecting...              │
│  🔴 aws-resources      — tools   Error: auth failed         │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│  AVAILABLE TOOLS (drag to agent):                          │
│  📁 file_system.read        📁 file_system.write           │
│  📁 file_system.search      🔍 web_search.search           │
│  💬 slack.message.send     💬 slack.message.list           │
│  🧠 memory.recall           🧠 memory.forget                │
└─────────────────────────────────────────────────────────────┘
```

---

## Comparison to Existing Tools

### vs. n8n

| Aspect | n8n | AgentOS |
|--------|-----|---------|
| Nodes are | API endpoints | Living agent processes |
| Execution model | Trigger → pipeline → done | Continuous reasoning loop |
| Debugging | Step run, view data | Live reasoning trace |
| Multi-agent | One workflow, no coordination | Canvas with handoff + orchestrator |
| Terminal | None | Integrated, IS the runtime |
| Agent awareness | Nodes don't know they're in a workflow | Agents aware of each other |

### vs. Claude Code

| Aspect | Claude Code | AgentOS |
|--------|-------------|---------|
| Interface | Terminal | Canvas + terminal |
| Multi-agent | /sub-agents (terminal only) | Visual canvas, drag-drop |
| Orchestration | Manual tmux grids | Configurable orchestrator agent |
| Persistence | Session-based | Agents persist, can resume |
| Visibility | Terminal scroll | Canvas shows all agents live |
| Collaboration | None | Canvas shareable (future) |

### vs. AutoGen Studio

| Aspect | AutoGen Studio | AgentOS |
|--------|---------------|---------|
| Production ready | No (research prototype) | Yes |
| Canvas | Team builder only | Full agent workspace |
| Runtime | Conversational | Live process + terminal |
| Orchestrator | None | First-class, configurable |
| Reasoning trace | Message flow | Full decision tree |

---

## v1 Scope

### Ship in v1

1. **Canvas** — Infinite canvas with agent nodes, pan/zoom, minimap
2. **Agent nodes** — Drag from palette, configure, connect with handoff edges
3. **Live workbench** — Integrated terminal showing agent reasoning + tool calls
4. **Orchestrator panel** — Watch all agents, see state changes, configure alert policies
5. **MCP integration** — Connect MCP servers, drag tools onto agents
6. **Capability edges** — Auto-draw when agents/tools compose a known capability
7. **Local runtime** — Agents run as local processes, no cloud required
8. **Basic persistence** — Save/load workspace, agents survive tab close

### Defer to v1.1

- Multiplayer collaboration (canvas sharing, real-time sync)
- Cloud deployment option
- Team workspaces + RBAC
- Export to Claude Code YAML / OpenAI JSON (original v1 plan)
- Community capability DB (seed from v1)

### Defer to v2

- Agent marketplace
- Compliance attestation
- Enterprise RBAC + audit logs

---

## Open Questions (For /office-hours)

1. **Browser runtime:** MCP servers require Node.js STDIO. How do we run agents in a browser? Options: (a) bundler a lightweight runtime (b) cloud-execute with local terminal UX (c) WASM-based tool execution. What did the research miss?

2. **Orchestrator is a first-class agent:** The orchestrator watches and manages other agents. But who watches the orchestrator? Is there a meta-orchestrator? Or does the human fill that role?

3. **Canvas at scale:** What does the canvas look like with 50 agents? 100? At what point does visualization become noise? What's the navigation model?

4. **Memory and state:** If agents are persistent processes, what does "memory" mean at the canvas level? Is there a shared memory space all agents can see? Or isolated memories per agent?

5. **Agent → tool → agent cycle:** An agent uses a tool (MCP server) and the result feeds into another agent. Does a tool call create a visible node on the canvas? Or is it invisible metadata inside the agent?

6. **The terminal is the IDE:** Is the canvas the primary interface and the terminal is a detail? Or is the terminal the primary interface and the canvas is an overlay? What does the UX feel like when you're actually working?

7. **Debugging vs. running:** When an agent is running, can you edit it mid-flight? Or does editing create a new version? How do you debug without disrupting?

---

## Next Steps

1. /office-hours to tear apart the architecture and surface contradictions
2. Validate the browser runtime assumption — this is the hardest technical problem
3. Sketch the Orchestrator configuration UI
4. Decide: canvas-first or terminal-first as the primary UX
5. Prototype the agent node rendering (canvas)

---

*Last updated: 2026-03-28*
