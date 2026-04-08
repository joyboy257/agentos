'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNode, AgentNodeData } from './CanvasProvider'
import { Eye } from 'lucide-react'
import { AgentCard } from './AgentCard'

// ── Railway dark canvas design tokens ──────────────────────────────
const canvas = {
  bg: '#0a0a0f',
  panel: '#12121a',
  panelHover: '#1a1a24',
  border: '#1e1e2e',
  borderHover: '#2e2e3e',
  text: '#e5e5e5',
  textMuted: '#6b6b7b',
  textDim: '#3e3e4e',
  accent: '#7c3aed',     // Railway soft violet
  active: '#2dd4bf',     // teal — running/active
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#60a5fa',
}

const statusColors: Record<AgentNodeData['status'], string> = {
  running: canvas.active,
  idle: canvas.textMuted,
  stopped: canvas.textMuted,
  scheduled: canvas.warning,
  error: canvas.error,
  waiting: canvas.info,
  paused_budget: canvas.warning,
}

const archetypeBorderColors: Record<NonNullable<AgentNodeData['archetype']>, string> = {
  Ingest: '#0ea5e9',
  Process: '#f59e0b',
  Distill: '#10b981',
}

const archetypeDotColors: Record<NonNullable<AgentNodeData['archetype']>, string> = {
  Ingest: '#38bdf8',
  Process: '#fbbf24',
  Distill: '#34d399',
}

function AgentNode({ data, id, selected }: NodeProps<CanvasNode>) {
  const nodeData = data as AgentNodeData
  const isCoordinator = nodeData.isCoordinator === true
  const isTeamLead = nodeData.role === 'Team Lead' || isCoordinator

  const statusColor = statusColors[nodeData.status] ?? canvas.textMuted

  // Role badge: TEAM LEAD or WORKER
  const roleBadge = isTeamLead ? (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      color: canvas.accent,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      {isCoordinator ? 'Coordinator' : 'Team Lead'}
    </span>
  ) : (
    <span style={{
      fontSize: 10,
      fontWeight: 500,
      color: canvas.textDim,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      Worker
    </span>
  )

  // Archetype badge — only for non-lead workers
  const archetypeBorder = !isTeamLead && nodeData.archetype
    ? archetypeBorderColors[nodeData.archetype]
    : canvas.accent

  const handleViewTrace = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (nodeData.runId) {
      const event = new CustomEvent('open-reasoning-panel', {
        detail: { runId: nodeData.runId },
        bubbles: true,
      })
      document.dispatchEvent(event)
    }
  }

  // ─── Coordinator (Team Lead) variant ───────────────────────────────────────
  if (isCoordinator) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation()
          const event = new CustomEvent('node-select', { detail: { id }, bubbles: true })
          document.dispatchEvent(event)
        }}
        style={{
          width: 260,
          minHeight: 120,
          background: canvas.panel,
          border: `1.5px solid ${canvas.accent}`,
          borderRadius: 16,
          padding: '14px 16px',
          boxShadow: selected
            ? `0 0 0 2px ${canvas.accent}40, 0 8px 32px rgba(0,0,0,0.5)`
            : `0 8px 32px rgba(0,0,0,0.4)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          position: 'relative',
          cursor: 'pointer',
          animation: 'nodeEnter 200ms ease-out',
        }}
      >
        {/* Coordinator top badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {roleBadge}
          {/* Status dot */}
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            boxShadow: nodeData.status === 'running' ? `0 0 6px ${statusColor}` : 'none',
            animation: nodeData.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />
        </div>

        {/* Agent name — IBM Plex Serif */}
        <div style={{
          fontFamily: "'IBM Plex Serif', Georgia, serif",
          fontWeight: 600,
          fontSize: 15,
          color: canvas.text,
          lineHeight: 1.3,
        }}>
          {nodeData.name}
        </div>

        {/* Status label */}
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          color: statusColor,
          textTransform: 'capitalize',
        }}>
          {nodeData.status === 'paused_budget' ? 'Budget exceeded' : nodeData.status.replace('_', ' ')}
        </div>

        {/* Team health dots */}
        {nodeData.teamMembers && nodeData.teamMembers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: canvas.textDim }}>
              TEAM
            </span>
            {nodeData.teamMembers.map((m) => (
              <div
                key={m.agentId}
                title={`${m.name}: ${m.status}`}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: m.status === 'completed' ? canvas.success
                    : m.status === 'failed' ? canvas.error
                    : m.status === 'running' ? canvas.active
                    : canvas.textDim,
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        )}

        {nodeData.status === 'running' && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: canvas.textMuted }}>
            Coordinating {nodeData.teamMembers?.length ?? 0} worker(s)...
          </div>
        )}

        <AgentCard data={{ ...nodeData, nodeId: id }} />

        {/* Handles */}
        <Handle type="target" position={Position.Top}    style={{ background: canvas.accent, width: 8, height: 8, border: 'none' }} />
        <Handle type="source" position={Position.Bottom} style={{ background: canvas.accent, width: 8, height: 8, border: 'none' }} />
      </div>
    )
  }

  // ─── Worker variant (Railway dark node) ────────────────────────────────
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        const event = new CustomEvent('node-select', { detail: { id }, bubbles: true })
        document.dispatchEvent(event)
      }}
      style={{
        width: 240,
        minHeight: 100,
        background: canvas.panel,
        border: `1.5px solid ${archetypeBorder}`,
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: selected
          ? `0 0 0 2px ${archetypeBorder}40, 0 8px 32px rgba(0,0,0,0.4)`
          : `0 8px 32px rgba(0,0,0,0.3)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
        cursor: 'pointer',
        transition: 'box-shadow 150ms ease, border-color 150ms ease',
        animation: 'nodeEnter 200ms ease-out',
      }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Left}  id={`${id}-target`} style={{ background: archetypeBorder, width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Right} id={`${id}-source`} style={{ background: archetypeBorder, width: 8, height: 8, border: 'none' }} />

      {/* Top row: role badge + status dot + info button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {roleBadge}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: canvas.textMuted,
            textTransform: 'capitalize',
          }}>
            {nodeData.status === 'paused_budget' ? 'Budget exceeded' : nodeData.status.replace('_', ' ')}
          </span>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            boxShadow: nodeData.status === 'running' ? `0 0 6px ${statusColor}` : 'none',
            animation: nodeData.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />
          <AgentCard data={{ ...nodeData, nodeId: id }} />
        </div>
      </div>

      {/* Agent name — IBM Plex Serif */}
      <div style={{
        fontFamily: "'IBM Plex Serif', Georgia, serif",
        fontWeight: 600,
        fontSize: 15,
        color: canvas.text,
        lineHeight: 1.3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {nodeData.name}
      </div>

      {/* Archetype accent bar — left edge indicator */}
      {!isTeamLead && nodeData.archetype && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <div style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            background: archetypeDotColors[nodeData.archetype],
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            fontWeight: 500,
            color: archetypeDotColors[nodeData.archetype],
          }}>
            {nodeData.archetype}
          </span>
        </div>
      )}

      {/* Escalation badge */}
      {nodeData.status === 'waiting' && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          background: `${canvas.warning}15`,
          border: `1px solid ${canvas.warning}40`,
          borderRadius: 9999,
          fontSize: 10,
          fontWeight: 600,
          color: canvas.warning,
          width: 'fit-content',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: canvas.warning,
            flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          Needs input
        </div>
      )}

      {/* Budget exceeded badge */}
      {nodeData.status === 'paused_budget' && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          background: `${canvas.warning}15`,
          border: `1px solid ${canvas.warning}40`,
          borderRadius: 9999,
          fontSize: 10,
          fontWeight: 600,
          color: canvas.warning,
          width: 'fit-content',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: canvas.warning,
            flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          Budget exceeded
        </div>
      )}

      {/* Error badge */}
      {nodeData.status === 'error' && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          background: `${canvas.error}15`,
          border: `1px solid ${canvas.error}40`,
          borderRadius: 9999,
          fontSize: 10,
          fontWeight: 600,
          color: canvas.error,
          width: 'fit-content',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: canvas.error,
            flexShrink: 0,
          }} />
          Error
        </div>
      )}

      {/* Footer: View Trace */}
      {nodeData.runId && (
        <button
          onClick={handleViewTrace}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            background: 'none',
            border: `1px solid ${canvas.border}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: canvas.textMuted,
            width: 'fit-content',
            marginTop: 'auto',
            transition: 'border-color 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            (e.target as HTMLElement).style.borderColor = canvas.borderHover
            ;(e.target as HTMLElement).style.color = canvas.text
          }}
          onMouseLeave={e => {
            (e.target as HTMLElement).style.borderColor = canvas.border
            ;(e.target as HTMLElement).style.color = canvas.textMuted
          }}
        >
          <Eye size={11} />
          View Trace
        </button>
      )}
    </div>
  )
}

AgentNode.displayName = 'AgentNode'

export { AgentNode }
export default AgentNode
