# Canvas Node Component Spec

> **Status:** Phase 1 — Ratified
> **Owner:** Unit 1 (Canvas Node Component Spec)
> **Date:** 2026-03-30
> **Requirement:** R2 (Readable pipeline visualization)

---

## Overview

This document defines the concrete React component specification for canvas nodes in the AgentOS visual pipeline canvas. It specifies the anatomy, states, event contracts, and CSS variable color system for `AgentNode`, `ToolNode`, and `GatewayNode` components.

---

## 1. AgentNode (AgentCard)

The `AgentNode` (rendered via `AgentCard` component) is the primary canvas node representing an autonomous agent in the pipeline.

### 1.1 Anatomy

```
┌──────────────────────────────┐
│  ● [status dot]          [8px] │
│                               │
│  Agent Name / Role Label      │
│  (13px, bold, primary)        │
│                               │
│  Description text (11px)      │
│  (optional, muted)            │
│                               │
│  [tool badge] [tool badge]   │
│  (max 3 shown)               │
└──────────────────────────────┘
```

### 1.2 Visual Specifications

| Element | Specification |
|---------|---------------|
| Width | 160px (fixed) |
| Background | `var(--panel)` (#12121a) |
| Border | 2px solid, color from `roleColors` map |
| Border radius | 12px |
| Padding | 14px |
| Shadow | `0 4px 24px rgba(0,0,0,0.4)` |
| Position | Absolute (used in canvas coordinate system) |

### 1.3 Role Colors (CSS Variable Map)

The `roleColors` map in `agent-card.tsx` maps agent roles to CSS variable colors:

```typescript
const roleColors: Record<string, string> = {
  email_reader: 'var(--agent-reader)',    // #3b82f6 (blue)
  response_drafter: 'var(--agent-drafter)', // #f59e0b (amber)
  ticket_reader: 'var(--agent-reader)',  // #3b82f6 (blue)
  faq_responder: 'var(--agent-drafter)', // #f59e0b (amber)
  escalation_triage: '#a78bfa',           // purple
  lead_researcher: 'var(--success)',      // #22c55e (green)
  lead_enricher: 'var(--agent-drafter)', // #f59e0b (amber)
  llm: 'var(--accent)',                   // #a78bfa (violet)
  reader: 'var(--agent-reader)',          // #3b82f6 (blue)
  drafter: 'var(--agent-drafter)',        // #f59e0b (amber)
  sender: 'var(--agent-sender)',          // #ec4899 (pink)
  escalation: '#a78bfa',                  // purple
  researcher: 'var(--success)',           // #22c55e (green)
}
```

Fallback: `var(--border)` (#1e1e2e) when role not in map.

### 1.4 Status Dot

The status dot is positioned top-right (top: 10px, right: 10px), 8x8px circle.

| Status | Color | Animation |
|--------|-------|-----------|
| `ready` | `#6b6b7b` (gray) | None |
| `running` | `var(--success)` (#22c55e) | CSS `pulse` keyframe (opacity 1→0.5→1, 1.5s infinite) |
| `waiting` | `var(--agent-drafter)` (#f59e0b, amber) | None |
| `completed` | `var(--success)` (#22c55e, green) | None |
| `error` | `#ef4444` (red) | None |
| `pending_approval` | `#f97316` (orange) | CSS `pulse` keyframe |
| `skipped` | `#6b6b7b` (gray) | None |

**CSS pulse animation** (defined in `globals.css`):
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### 1.5 Milestone Label

The milestone label is a text element displayed below the agent name. It communicates the current activity or progress of the agent.

- **Font:** 11px, `var(--text-muted)`
- **Content:** Set via `milestone` prop or derived from status
- **Format examples:**
  - Running: "Reading emails..."
  - Completed: "Found 12 unread"
  - Error: "Failed: timeout"

### 1.6 Tool Badges

Tool badges display the tools the agent uses. Rendered as small pills below the description.

- **Container:** `display: flex; flex-wrap: wrap; gap: 4px`
- **Badge style:** 9px font, `2px 6px` padding, `var(--border)` background, `var(--text-muted)` text, 4px border-radius
- **Max shown:** 3 badges (slice from tools array)

### 1.7 Connection Handles

React Flow handles for edges:
- **Source handle:** Right side of card, automatic
- **Target handle:** Left side of card, automatic

Handle style: Hidden (managed by React Flow).

---

## 2. ToolNode

A `ToolNode` represents a single tool call, typically embedded within or connected to an `AgentNode`.

### 2.1 Anatomy

```
┌─────────────────────┐
│  ⚙ [tool name]      │
│  ● [status]          │
└─────────────────────┘
```

### 2.2 Visual Specifications

| Element | Specification |
|---------|---------------|
| Width | 120px (fixed) |
| Background | `var(--panel)` |
| Border | 1px solid `var(--border)` |
| Border radius | 8px |
| Padding | 10px |

### 2.3 Status Indicator

Small status dot (6x6px) next to tool name.

| Status | Color |
|--------|-------|
| idle | `var(--border)` |
| running | `var(--success)` + pulse |
| success | `var(--success)` |
| error | `#ef4444` |

---

## 3. GatewayNode (Conditional Branching)

A `GatewayNode` represents a conditional branch in the pipeline (e.g., "if/else" logic).

### 3.1 Anatomy

```
┌─────────────────┐
│  ? [condition]   │
│   [label]       │
└─────────────────┘
     │    │
     ▼    ▼
  [yes] [no]
```

### 3.2 Visual Specifications

| Element | Specification |
|---------|---------------|
| Width | 100px |
| Shape | Diamond or hexagon (rotated square) |
| Background | `var(--panel)` |
| Border | 2px solid `var(--accent)` |
| Condition label | Centered, 11px |

### 3.3 Branching Edges

Edges from a GatewayNode are styled differently:
- **Yes path:** `var(--success)` (#22c55e) stroke
- **No path:** `var(--border-hover)` (#2e2e3e) stroke

---

## 4. Connection Edge States

Edges (connections between nodes) have visual states based on data flow status.

### 4.1 SVG Bezier Specification

Connections use cubic bezier curves calculated in `connection-line.tsx`:

```typescript
const midX = (startX + endX) / 2
const cp1X = midX; const cp1Y = startY
const cp2X = midX; const cp2Y = endY
const pathD = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`
```

### 4.2 Edge State Styles

| State | Stroke Color | Stroke Width | Dash Array | Animation |
|-------|-------------|--------------|------------|-----------|
| Default | `var(--border-hover)` (#2e2e3e) | 2px | none | none |
| Running | `var(--border-hover)` | 2px | `8 4` | CSS `dash` keyframe (0.5s linear infinite) |
| Success | `var(--success)` (#22c55e) | 2px | none | none |
| Failed | `#ef4444` (red) | 2px | none | none |

**CSS dash animation** (defined in `globals.css`):
```css
@keyframes dash {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}
```

---

## 5. CSS Variable Color System

All colors are defined as CSS custom properties in `globals.css`:

```css
:root {
  --bg: #0a0a0f;
  --panel: #12121a;
  --border: #1e1e2e;
  --border-hover: #2e2e3e;
  --text-primary: #e5e5e5;
  --text-muted: #6b6b7b;
  --text-dim: #52525b;
  --accent: #a78bfa;
  --agent-reader: #3b82f6;
  --agent-drafter: #f59e0b;
  --agent-sender: #ec4899;
  --success: #22c55e;
}
```

---

## 6. State Machine

### 6.1 AgentNode States

```
┌───────┐   run started   ┌─────────┐
│ ready │ ──────────────▶ │ running │
└───────┘                 └────┬────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌─────────┐
    │  waiting  │        │ completed │        │  error  │
    │(approval) │        └───────────┘        └─────────┘
    └─────┬─────┘
          │
    approved/skipped
          │
          ▼
    ┌───────────┐
    │  skipped  │
    └───────────┘
```

### 6.2 Valid State Transitions

| From | To | Trigger |
|------|-----|---------|
| `ready` | `running` | SSE `status: running` event |
| `running` | `waiting` | SSE `status: waiting` event (approval required) |
| `running` | `completed` | SSE `status: completed` event |
| `running` | `error` | SSE `status: error` event |
| `waiting` | `running` | User approves (resume) |
| `waiting` | `skipped` | User rejects / max iterations reached |
| `completed` | `running` | Re-run |
| `skipped` | `running` | Re-run |

---

## 7. SSE Event Contract

### 7.1 Status Event → State Transition Mapping

The `AgentCard` receives `AgentStatusEvent` from SSE:

```typescript
type AgentStatusEvent = {
  event: 'status'
  runId: string
  agentId: string
  status: 'ready' | 'running' | 'waiting' | 'completed' | 'error'
  result?: AgentOutput
  timestamp: number
}
```

### 7.2 Event → UI Update Rules

| SSE Event | Card State Change | Visual Update |
|-----------|-------------------|---------------|
| `status: ready` | Set `ready` | Gray dot, no animation |
| `status: running` | Set `running` | Green dot, pulse animation, milestone label |
| `status: waiting` | Set `waiting` | Amber dot, approval badge appears |
| `status: completed` | Set `completed` | Green dot, milestone shows result summary |
| `status: error` | Set `error` | Red dot, milestone shows error message |

### 7.3 AgentOutput Result Shape

```typescript
type AgentOutput = {
  agentId: string
  role: string
  status: 'completed' | 'error'
  data: any
  error?: string
}
```

---

## 8. Props Interface

### 8.1 AgentCardProps

```typescript
interface AgentCardProps {
  agent: {
    id: string
    name: string
    role: string
    tools: string[]
    description?: string
  }
  status: 'ready' | 'running' | 'waiting' | 'completed' | 'error' | 'pending_approval' | 'skipped'
  milestone?: string
  style?: React.CSSProperties
}
```

### 8.2 Extended Status (Phase 2)

The following statuses are planned for Phase 2 (Human Approval UX):

- `pending_approval`: Awaiting user approval — shows orange pulsing dot + "Awaiting your approval" label
- `skipped`: Tool call was skipped (user rejected or max iterations reached)

---

## 9. Component Tree

```
<CanvasPanel>
  <svg.grid />                      {/* Background grid */}
  {agents.map(agent => (
    <AgentCard                        {/* AgentNode */}
      key={agent.id}
      agent={agent}
      status={statusMap[agent.id]}
      milestone={milestoneMap[agent.id]}
      style={{ left, top }}          {/* Absolute positioning */}
    />
  ))}
  {connections.map(conn => (
    <ConnectionLine                   {/* SVG bezier edge */}
      key={`${conn.from}-${conn.to}`}
      startX={...}
      startY={...}
      endX={...}
      endY={...}
      isRunning={isConnectionRunning}
    />
  ))}
</CanvasPanel>
```

---

## 10. Canvas Integration Notes (Phase 2 Contract)

For Phase 2 implementers:

1. **Milestone labels**: Render when `milestone` prop is provided. Format: `"{verb} {object}"` (e.g., "Reading emails", "Found 12 unread").

2. **Approval badge**: When `status === 'pending_approval'`, render a pulsing orange badge with text "Awaiting your approval" below the agent name.

3. **Positioning**: Agents use absolute positioning with `left`/`top` coordinates calculated by the canvas layout algorithm.

4. **Running pulse**: Only the status dot pulses, not the entire card. Pulse animation is CSS `pulse` keyframe (opacity 1→0.5→1, 1.5s infinite).

5. **Connection animation**: When any connected edge has `isRunning === true`, that edge shows animated dash pattern.

---

## 11. React Flow Compatibility

While the current canvas uses custom SVG positioning, the `AgentCard` component is designed to be compatible with React Flow:

1. **Handles**: Add React Flow `Handle` components (source on right, target on left) when integrating with React Flow
2. **Dragging**: Wrap in React Flow `Node` wrapper for drag-and-drop support
3. **Selection**: Use React Flow `useNodeId` for edge connections
4. **Types**: Consider creating `AgentNodeData` type extending React Flow `NodeProps`

---

## 12. Appendix: Status Colors Reference

| Status | Hex | CSS Variable | Pulse? |
|--------|-----|--------------|--------|
| ready | #6b6b7b | (none) | No |
| running | #22c55e | `var(--success)` | Yes |
| waiting | #f59e0b | `var(--agent-drafter)` | No |
| completed | #22c55e | `var(--success)` | No |
| error | #ef4444 | (none) | No |
| pending_approval | #f97316 | (none) | Yes |
| skipped | #6b6b7b | (none) | No |
