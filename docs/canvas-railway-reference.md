# Canvas UI: Railway-Inspired 3-Panel Architecture

**Date:** 2026-04-03
**Status:** Direction Locked
**Parent:** `docs/plans/2026-04-02-001-feat-agentos-canvas-ui-plan.md`
**PRD Ref:** `docs/PRD.md` v5.1 — Visual Canvas (Pillar 1)

---

## Source of Inspiration

**[Railway](https://railway.com/)** — Railway's interface is the closest reference to the vision for AgentOS's infinite canvas. It proves that a **dark, dense, professional tool-like UI** with clear information hierarchy builds trust with users who need to manage complex systems.

Railway is NOT a dumbed-down SaaS dashboard. It's a professional developer tool that happens to be approachable. That's exactly the bar for AgentOS: Maria should feel like she has professional-grade visibility into her team, not a toy.

---

## The 3-Panel Architecture

```
┌─────────────────┬────────────────────────────────────────┬────────────────────┐
│   LEFT PANEL    │            MAIN CANVAS                  │    RIGHT PANEL     │
│   (280px)       │            (flexible)                  │    (480px)         │
│                 │                                         │                    │
│  Team Navigator │   [INFINITE CANVAS — NODE GRAPH]        │  Context Drawer    │
│                 │                                         │                    │
│  Search all     │   Pan: drag on empty canvas             │  Slides in when:   │
│  agents ────    │   Zoom: scroll / pinch                  │  • Node selected   │
│                 │   Grid: dot pattern, 20px spacing       │  • "View Trace"    │
│  ▼ Team Lead    │                                         │  • Escalation open │
│    Worker A     │   ┌─────────────┐                       │                    │
│    Worker B     │   │ Team Lead   │                       │  ┌──────────────┐  │
│    Worker C     │   │    (👑)     │                       │  │ Reasoning    │  │
│                 │   └──────┬──────┘                       │  │ Trace        │  │
│  ▼ Connectors   │          │                              │  │              │  │
│    Gmail        │   ┌──────┴──────┐                       │  │ [step 1]     │  │
│    HubSpot ──── │   │             │                       │  │ [step 2]     │  │
│    Calendar     │   ▼             ▼                       │  │ [step 3]     │  │
│                 │ ┌──────┐   ┌──────┐                    │  │ ...          │  │
│                 │ │ Wkr A│   │ Wkr B│                    │  └──────────────┘  │
│                 │ └──────┘   └──────┘                    │                    │
│                 │                                         │  OR               │
│                 │   [Empty state: "Start building"]       │                    │
│                 │                                         │  ┌──────────────┐  │
│                 │                                         │  │ Node Config  │  │
│                 │                                         │  │ & Details    │  │
│                 │                                         │  └──────────────┘  │
└─────────────────┴────────────────────────────────────────┴────────────────────┘
```

### LEFT PANEL: Team Navigator (280px, collapsible)

**Purpose:** Provides full-text search and hierarchical view of all agents, connectors, and capabilities. Maria can always find anything on her team instantly.

**Sections:**

1. **Team Tree**
   - Team Lead at top (always present, non-deletable)
   - Workers nested under Team Lead
   - Visual hierarchy shows reporting structure
   - Clicking a node selects it and pans canvas to center it

2. **Connectors / Capabilities**
   - All integrations Maria has connected (Gmail, HubSpot, etc.)
   - Status indicator per connector (connected/error)
   - Quick-add to canvas via drag

3. **Search** (top of panel)
   - Full-text search across all node names, descriptions, tools
   - Filters: "Running", "Stopped", "Escalated"
   - `⌘K` focuses search from anywhere

**States:**
- Expanded: 280px, full labels
- Collapsed: 48px, icon-only strip
- Mobile: replaced by bottom sheet

---

### MAIN CANVAS: Infinite Canvas

**Purpose:** The primary workspace — spatial, direct, trustworthy. Feels like Figma/Notion, not a developer console.

**Canvas anatomy:**
```
Background: --bg-canvas (#F0F0EC) or dark variant
Grid: dots at 20px intersections, subtle color
Pan: drag on empty canvas, middle-mouse
Zoom: scroll wheel, pinch, 25%–200% range
```

**Node rendering:**
- Each node is a card (240px wide, auto height)
- Node border color indicates type (Team Lead: purple, Worker: indigo, archetype tint)
- Selected node: elevated shadow + selection ring
- Running nodes: subtle pulse on status dot
- Selected node triggers RIGHT PANEL open

**Wires:**
- Bezier curves connecting node handles
- Color indicates state (idle/active/escalation/error)
- Animated dash for active data flow
- Click wire to select → shows delete option

**Empty state:**
```
┌────────────────────────────────────────────────────────────┐
│                                                             │
│         ✦ Your canvas is empty                              │
│                                                             │
│         Start by typing what you want your team            │
│         to do, or drag a connector from the left panel     │
│                                                             │
│         ┌──────────────────────────────────────┐            │
│         │ "Hire a worker that follows up with  │            │
│         │  leads who haven't replied..."       │            │
│         └──────────────────────────────────────┘            │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

### RIGHT PANEL: Context Drawer (480px, slides from right)

**Purpose:** Context-sensitive detail panel. Shows different content based on what's selected.

**Trigger conditions (in priority order):**
1. **Escalation open** → Escalation response UI (highest priority)
2. **"View Trace" clicked** → Reasoning trace panel
3. **Node selected** → Node config/details
4. **Nothing selected** → Team overview (last state before deselection)

**Panel content by state:**

| State | Content |
|---|---|
| Escalation | Escalation card with Approve/Edit/Cancel |
| Reasoning Trace | Step-by-step trace with real-time streaming |
| Node Selected | Node name, archetype, tools, stats, config |
| Team Overview | Aggregate team status, today's runs, active escalations |

**Panel anatomy:**
```
Width: 480px desktop, 100% mobile
Background: --bg-surface
Border-left: 1px solid --border-default
Shadow: --shadow-lg (slide-in)
Animation: translateX(100%) → 0, 300ms ease-out
```

---

## Railway Patterns Applied to AgentOS

### 1. Dark Theme (Phase 2 consideration)

Railway's dark theme is central to its premium feel. For AgentOS:

| Railway | AgentOS (Phase 1 — Light) | AgentOS (Phase 2 — Dark) |
|---|---|---|
| `#0F0F0F` base | `#FAFAF8` base | `#0F0F0F` base |
| Purple accent `#7C3AED` | Purple `#7C3AED` | Purple `#7C3AED` |
| Teal `#2DD4BF` | Teal `#2DD4BF` | Teal `#2DD4BF` |

**Design token architecture supports both:**
```css
:root {
  --bg-base: #FAFAF8;
  --text-primary: #1C1C1A;
  /* Light mode tokens */
}

[data-theme="dark"] {
  --bg-base: #0F0F0F;
  --text-primary: #FAFAF8;
  /* Dark mode tokens */
}
```

### 2. Section-Based Organization

Railway organizes its main canvas into environment sections (Dev/Preview/Prod). AgentOS organizes into:

```
┌─────────────────────────────────────────────────────────────┐
│  CANVAS — PAN/ZOOMABLE NODE GRAPH                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  COORDINATION LAYER                                  │    │
│  │  Team Lead (👑) — coordinates all workers           │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  WORKER LAYER (horizontally arranged)               │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │    │
│  │  │ Ingest   │  │ Process  │  │ Distill  │          │    │
│  │  │ Worker   │  │ Worker   │  │ Worker   │          │    │
│  │  └──────────┘  └──────────┘  └──────────┘          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3. Real-Time Log Streaming

Railway's deployment logs are **dark, monospace, streaming**. AgentOS's reasoning trace follows the same pattern but adapted for Maria:

| Railway (Developer) | AgentOS (Maria — Non-Technical) |
|---|---|
| Dark terminal aesthetic | Light card, readable typography |
| Monospace throughout | Monospace for tool names/values only |
| Raw JSON/logs | Plain English descriptions |
| No truncation | Full text, expandable sections |
| Streaming at speed | Steps appear with 2s polling interval |

**Reasoning trace style:**
```
┌────────────────────────────────────────────────────────────┐
│  ← Back to canvas        Lead Research Worker — Trace     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ● Running — started 2 minutes ago                        │
│                                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                            │
│  10:42:03  ┌──────────────────────────────────────────┐   │
│            │ 🔧 Searching HubSpot for leads...        │   │
│            │    query: "status=open AND last_reply<7" │   │
│            └──────────────────────────────────────────┘   │
│                                                            │
│  10:42:08  ✓ Found 23 leads                               │
│            │  12 hot (>50% reply rate)                    │
│            │  11 warm (20-50% reply rate)                 │
│            │  Delivered to: Filter Worker                │
│                                                            │
│  10:42:12  ┌──────────────────────────────────────────┐   │
│            │ 🤔 Deciding: which leads need follow-up  │   │
│            │    Reasoning: "11 warm leads haven't     │   │
│            │    received a follow-up in 7+ days.     │   │
│            │    These are highest priority."          │   │
│            └──────────────────────────────────────────┘   │
│                                                            │
│  10:42:18  ✓ Routed 11 leads to Draft Worker             │
│                                                            │
│  ─────────────────────────────────────────────────────────  │
│                                                            │
│  ⚠️  ESCALATION — needs your input                        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 4. Railway's Deployment Card → AgentOS's Node Card

Railway cards show deployment status at a glance:

```
Railway Deployment Card:
┌─────────────────────────────────────────────┐
│  production  ● 3 months ago                │
│  ┌─────────┐                                │
│  │ v2.1.0  │    Railway  ↗                  │
│  └─────────┘                                │
│  ─────────────────────────────────────────  │
│  ● Connected   3 vars   📦 1.2GB           │
└─────────────────────────────────────────────┘
```

Maps to AgentOS Worker Node Card:
```
┌─────────────────────────────────────────────┐
│  Lead Research Worker              ● Running │
│  ─────────────────────────────────────────  │
│  Archetype: Ingest                          │
│  Tools: HubSpot, Gmail                      │
│  ─────────────────────────────────────────  │
│  Runs today: 47    Escalated: 3             │
│  Last run: 2 min ago                        │
└─────────────────────────────────────────────┘
```

### 5. Railway's Activity/Event Feed → AgentOS Activity Log

Railway's activity feed shows deployments over time. AgentOS's activity log shows agent runs/tickets in the right panel.

### 6. Persistent State

Railway persists all state server-side — your deployment is always there when you return. AgentOS persists all canvas state to Postgres. No refresh loses work.

---

## Specific UI Decisions

### Left Panel: Team Navigator

**Width:** 280px expanded, 48px collapsed (icon strip)

**Collapse behavior:**
- Toggle button at bottom of panel
- Collapsed state shows: Team icon, connectors icon, search icon
- Remembers collapsed state per session

**Team tree item:**
```
┌──────────────────────────────────────────────┐
│ [👑/🔧/📥]  Lead Research Worker    ● Running │
└──────────────────────────────────────────────┘
│ [icon]  [name]           [status dot]
```
- Selected: `--bg-elevated` background, left border accent
- Hover: subtle `--bg-elevated` lift
- Click: selects node, pans canvas to center it

### Canvas: Node Selection

**Clicking a node:**
1. Node gets selected ring (2px `--brand-primary` border + shadow)
2. RIGHT PANEL slides in with node details
3. Other nodes remain visible and interactive

**Clicking empty canvas:**
1. Deselects all nodes
2. RIGHT PANEL shows team overview or hides (取决于 state)

**Pan behavior:**
- Drag on empty canvas = pan
- Drag on node = move node (reposition)
- Double-click node = open RIGHT PANEL with full details

### Right Panel: Context Drawer

**Close behavior:**
- Click "← Back to canvas" (top left)
- Click outside panel (on canvas)
- Press Escape
- Panel does NOT auto-close on canvas changes (preserves context)

**Escalation override:**
- When escalation is active, panel is locked to escalation UI
- Cannot navigate away until escalation is resolved
- Background canvas dims (`--bg-overlay`)

### NL Prompt Bar

**Position:** Fixed, bottom center, above canvas
**Width:** 560px max
**Style:** Pill-shaped, floating, `--shadow-lg`

```
┌──────────────────────────────────────────────────────────┐
│ [✨]  "Hire a worker that follows up with leads..."  [↵] │
└──────────────────────────────────────────────────────────┘
```

**Keyboard shortcut:** `⌘K` focuses from anywhere (global)

**States:**
- Default: placeholder text, subtle border
- Focus: `--shadow-focus`, border `--border-focus`
- Loading: sparkle animates, "Building..." text, disabled
- Error: red border, error message below

---

## Component Inventory

### CanvasPage
Full-page canvas layout with 3-panel structure

### LeftPanel / TeamNavigator
- Team tree with collapsible sections
- Search input
- Connector list
- Collapse toggle

### InfiniteCanvas
- React Flow wrapper
- Dot grid background
- Pan/zoom controls (floating, bottom-right)
- Minimap (floating, bottom-right, collapsible)

### TeamLeadNode
- Purple border (--node-team-lead)
- Crown icon
- Aggregate team status
- Cannot be deleted

### WorkerNode
- Indigo border by default, archetype tint
- Archetype badge (Ingest/Process/Distill)
- Status indicator
- Tool chips
- Run stats

### ReasoninPanel
- Slide-in from right
- Step list with streaming
- Escalation card at top if escalated
- Jump-to-latest button when scrolled

### EscalationCard
- Amber left border
- Plain English description
- Action buttons: Approve / Edit & Approve / Cancel
- Cannot dismiss without action

### NLPromptBar
- Fixed bottom center
- Sparkle icon
- Keyboard shortcut hint
- Loading/error states

### ActivityLog
- Right panel tab or standalone
- Filterable by node, type, date
- Expandable entries

---

## Implementation Implications

### React Flow Configuration

The 3-panel layout requires React Flow's `Panel` component for floating controls and minimap, and careful z-index management:

```
z-index layers:
1. Canvas background + grid: 0
2. Nodes: 10
3. Wires: 5
4. Left panel: 100
5. Right panel: 100
6. Floating controls (minimap, zoom): 50
7. Modals/escalation: 200
8. Toast notifications: 300
```

### Responsive Behavior

| Breakpoint | Left Panel | Canvas | Right Panel |
|---|---|---|---|
| < 640px | Bottom sheet, hidden by default | Full width | Full-width bottom sheet |
| 640–1024px | Collapsed icon strip (48px) | Full width | 400px drawer |
| > 1024px | 280px expanded | Flexible | 480px drawer |

### Performance Considerations

- React Flow handles 50+ nodes with virtualization
- Left panel tree should virtualize if > 20 nodes
- Right panel trace steps should virtualize if > 100 steps
- Canvas dot grid should use CSS background pattern, not SVG elements

---

## Comparison: Current Plan vs Railway-Inspired

| Aspect | Current Plan | Railway-Inspired |
|---|---|---|
| Layout | Canvas + bottom prompt bar | **3-panel (left nav + canvas + right drawer)** |
| Navigation | Search in top nav | **Team tree in left panel** |
| Context | Click "View Trace" opens overlay | **Right panel, persistent until closed** |
| Node selection | Click opens detail card | **Click selects, opens right panel** |
| Empty state | Centered on canvas | **Canvas empty state + NL prompt still bottom** |
| Dark mode | Phase 2 | **Token architecture ready, dark supported** |

---

## Document Dependencies

| Document | Relationship |
|---|---|
| `docs/plans/2026-04-02-001-feat-agentos-canvas-ui-plan.md` | Parent plan — this refines the architecture |
| `docs/design-system-v2.md` | Design tokens — already supports dark mode |
| `docs/PRD.md` v5.1 | Product requirements, Visual Canvas pillar |
| `docs/ARCHITECTURE-05-reasoning-trace.md` | Trace format spec |
| `docs/ARCHITECTURE-01-capability-registry.md` | Capability schema for left panel |

---

## Change Log

| Date | Version | Changes |
|---|---|---|
| 2026-04-03 | 1.0 | Initial Railway reference — 3-panel architecture, component inventory, UI decisions |
