# AgentOS — UI/UX Direction: Hybrid Card + Live Capability Graph

Date: 2026-03-27
Status: DRAFT — For discussion

---

## tl;dr

A **hybrid UI** that combines the structural clarity of a structured agent card with a **live mini canvas** in the Tools section. As tools are added, capability edges draw themselves between them — making emergent capabilities visible rather than abstract. The Discovery Panel remains the primary differentiator; the graph makes it tangible.

---

## The Problem With "IDE"

IDEs are the wrong metaphor for AI agents in two ways:

1. **The wrong user:** IDEs serve developers building things. The team lead who manages a fleet of agents isn't building — they're operating. They need a dashboard or a list view, not a code editor.

2. **Agents aren't code:** Code is static text. Agents are dynamic, stateful, probabilistic. An IDE implies you're writing instructions. The agent builder experience should feel more like **composing capabilities** than writing YAML.

The right mental model: **not "write code for an agent" — "equip an agent with tools and watch it become capable."**

---

## The Two Extremes

### n8n Canvas (Full Visual)
- Each tool = a node
- Capabilities = edges between nodes
- Tools are dragged onto a canvas and wired together
- **Gets right:** Capability emergence is *visible* — you see the connections form
- **Gets wrong:** Complex agents (15+ tools) become a hairball. The canvas doesn't scale to fleet overview.

### Structured Card (Flat List)
- Agent = a form with name, description, tool checklist, memory config, task settings
- **Gets right:** Clean, scannable, fast to build, scales to 20+ tools
- **Gets wrong:** Capability emergence is *abstract* — you have to imagine what Web Search + Browser enables. The Discovery Panel tells you, but you don't *see* it.

---

## The Hybrid Approach

```
┌──────────────────────────────────────────────────────────────────────┐
│  Agent: Research Agent                            [Export ▼] [Save]  │
│  ──────────────────────────────────────────────────────────────────  │
│                                                                      │
│  Memory & Context          Tools                      Reliability    │
│  ─────────────────         ─────                      ──────────    │
│  ● Persistent session      ┌────────────────┐         Max steps: 50  │
│    Context: 200k tokens     │  [Web Search]──┼──→Synthesis         │
│    History: last 50        │       │         │                     │
│                            │  [File System]─┼─→Code Runner         │
│  Tasks                     │       │         │         Retry: 3x   │
│  ─────                     │  [Browser]───────→Research Pipeline    │
│  ● Long-running enabled     └────────────────┘    Timeout: 30min    │
│  ● Checkpoint: every 50 steps                      ○ Health: OK     │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  DISCOVERY PANEL                                                     │
│  ─────────────────────────────────────────────────────────────────── │
│  Ready:                                                                │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ ● Research Pipeline                            [Add to Agent] │     │
│  │   Web Search + File System + Browser                         │     │
│  │   "Cross-reference claims across multiple sources..."        │     │
│  └─────────────────────────────────────────────────────────────┘     │
│  Partial:                                                             │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ ○ Synthesis → needs: Code Interpreter        [Add Missing]   │     │
│  │   Web Search + File System                                   │     │
│  └─────────────────────────────────────────────────────────────┘     │
│  Unverified:                                                          │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ ◌ Multi-hop Reasoning (AI-generated)       [Review] [Trust] │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### The Tools Section = Mini Canvas

Within the Agent Card's Tools section:

1. **Tools are small nodes** — circle + icon + name, compact
2. **Capability edges draw automatically** — when 2+ tools that compose a known capability are both selected, a labeled edge animates in between them
3. **Click the edge** → highlights the corresponding Discovery Panel card (bidirectional)
4. **Click a Discovery card** → highlights the tools that compose it in the graph
5. **Auto-layout** — the graph arranges itself; drag to rearrange if desired
6. **Tools are added via picker** — not by dragging onto the canvas. The graph updates reactively when tools are added/removed.

### The Discovery Panel — Still the Moat

The Discovery Panel is unchanged in function:
- **Ready** — all required tools selected; capability is available
- **Partial** — some tools selected; shows "Needs: X" with one-click to add
- **Unverified** — AI-generated entry; human review before trusting

The graph makes these states *visible and connected to the tool config*, not just listed in a sidebar.

### The Structured Sections Stay Structured

- **Memory & Context** — not trying to visualize these. They're config. Checkboxes and dropdowns.
- **Tasks / Reliability** — explicit config: max steps, timeout, retry policy, checkpoint settings. Visible, not hidden.
- **Health indicator** — per-tool dot (green/red/yellow) showing "is this tool reachable right now?"

---

## What "Reliable" Looks Like in the UI

"Reliable" for long-running agents isn't a backend promise — it's visible in the card:

| What the user sees | What it means |
|---|---|
| `Max steps: 50` | Agent won't spiral indefinitely |
| `Timeout: 30min` | Agent won't hang forever |
| `Retry: 3x` | Agent recovers from transient failures |
| `Checkpoint: every 50 steps` | Long tasks can resume, not restart |
| `● Health: OK` per tool | This tool is reachable at config time |

These aren't YAML keys — they're labeled config rows in the Reliability section.

---

## v1 Scope for the Graph

The mini canvas in v1 is scoped tightly:

- Tools are shown as small circular nodes (icon + name)
- Edges draw between tools when a known capability is detected
- Clicking an edge highlights the Discovery Panel card
- Clicking a Discovery Panel card highlights the relevant tools/edges
- Auto-layout; optional drag to rearrange
- No drag-to-add tools — tools added via the existing picker, graph updates reactively
- The graph is **read-only visualization** of capability composition — not a full canvas editor

**List/Graph toggle** for v1: the Tools section defaults to a clean list, with a `○ Graph` toggle to show the capability graph. This keeps v1 scope manageable while making the Discovery Panel's value proposition visible.

---

## Why This Is the Right Hybrid

| Property | n8n Canvas | Flat Card | Hybrid |
|---|---|---|---|
| Capability emergence visible | ✓ | ✗ | ✓ |
| Scales to 20+ tools | ✗ | ✓ | ✓ |
| Fast to build (v1 scope) | ✗ | ✓ | ✓ |
| Tool config stays organized | ✗ | ✓ | ✓ |
| Discovery Panel is central | ~ | ✓ | ✓ |
| Feels "alive" as you configure | ✓ | ✗ | ✓ |
| Memory/Tasks stay clean | ✗ | ✓ | ✓ |

---

## Open Questions

1. **Does the graph need to be interactive beyond clicking?** Drag-to-rearrange is v1-nice-to-have. Full edge drawing/editing is v2.

2. **How does the graph handle 30+ tools?** Beyond a threshold, the mini canvas becomes unreadable. At that scale, the Discovery Panel's filter/search becomes the primary interface, not the graph.

3. **Where does the agent "canvas" end and the fleet view begin?** The agent card is one agent. The fleet view (Linear-style list of all agents) is a different UI on top of the same data. Build the card first, then decide what the fleet view needs to show.

4. **What does persistence/memory look like in the graph?** Should persistent memory be a labeled edge attached to the agent? Or is it always a structured config row? Lean toward structured config — memory isn't tool composition.

---

## Next Steps

1. Validate with 5 team leads: show them the hybrid card mockup, ask if they'd use it to build agents for their team
2. Test the graph readability at 5, 10, 15, 20 tools — find the threshold where it breaks
3. Prototype the list/graph toggle — is the toggle discoverable enough, or does the graph need to be default-on?
4. Decide: does the graph animate on tool add? (Feels alive, but costs dev time)

---

*Last updated: 2026-03-27*
