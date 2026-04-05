'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNode, AgentNodeData } from './CanvasProvider'
import { Eye } from 'lucide-react'
import { AgentCard } from './AgentCard'

const statusColors: Record<AgentNodeData['status'], string> = {
  running: '#22c55e',
  idle: '#a3a3a0',
  stopped: '#a3a3a0',
  scheduled: '#f59e0b',
  error: '#ef4444',
  waiting: '#60a5fa',
  paused_budget: '#f59e0b',
}

const roleColors: Record<AgentNodeData['role'], string> = {
  'Team Lead': '#7c3aed',
  Worker: '#5b4fe9',
}

const archetypeColors: Record<NonNullable<AgentNodeData['archetype']>, { color: string; bgColor: string }> = {
  Ingest: { color: '#0ea5e9', bgColor: '#f0f9ff' },
  Process: { color: '#f59e0b', bgColor: '#fffbeb' },
  Distill: { color: '#10b981', bgColor: '#ecfdf5' },
}

function AgentNode({ data, id, selected }: NodeProps<CanvasNode>) {
  const nodeData = data as AgentNodeData
  const borderColor = roleColors[nodeData.role] ?? '#e5e5e3'
  const statusColor = statusColors[nodeData.status] ?? statusColors.idle

  const isTeamLead = nodeData.role === 'Team Lead'
  const width = isTeamLead ? 280 : 220
  const height = isTeamLead ? 150 : 120

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


  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        // Dispatch selection event to parent
        const event = new CustomEvent('node-select', { detail: { id }, bubbles: true })
        document.dispatchEvent(event)
      }}
      style={{
        width,
        height,
        background: '#ffffff',
        border: `2px solid ${borderColor}`,
        borderRadius: 16,
        padding: '16px',
        boxShadow: `0 4px 16px rgba(0,0,0,0.10)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
        outline: selected ? '2px solid #5b4fe9' : 'none',
        outlineOffset: '2px',
        cursor: 'pointer',
      }}
    >
      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        id={`${id}-target`}
        style={{
          background: borderColor,
          width: 8,
          height: 8,
          border: 'none',
        }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: '#6b6b68',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {nodeData.role}
        </span>
        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: '10px',
              color: '#888',
              fontWeight: 400,
            }}
          >
            {nodeData.status === 'running' ? 'Running' : nodeData.status === 'scheduled' ? 'Scheduled' : nodeData.status === 'paused_budget' ? 'Budget exceeded' : 'Idle'}
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
              animation: nodeData.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
            }}
          />
        </div>
        <AgentCard data={{ ...nodeData, nodeId: id }} />
      </div>

      {/* Agent name */}
      <div
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#1c1c1a',
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {nodeData.name}
      </div>

      {/* Worker-specific: archetype badge */}
      {!isTeamLead && nodeData.archetype && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            background: archetypeColors[nodeData.archetype].bgColor,
            borderRadius: 9999,
            fontSize: '11px',
            fontWeight: 500,
            color: archetypeColors[nodeData.archetype].color,
            width: 'fit-content',
          }}
        >
          {nodeData.archetype}
        </div>
      )}

      {/* Team Lead-specific: team info */}
      {isTeamLead && (
        <div
          style={{
            fontSize: '12px',
            color: '#888',
          }}
        >
          {nodeData.status === 'running'
            ? 'Coordinating workers'
            : 'Team is idle'}
        </div>
      )}

      {/* Escalation badge: shown when node needs human input */}
      {nodeData.status === 'waiting' && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: '#fef3c7',
            borderRadius: 9999,
            fontSize: 10,
            fontWeight: 600,
            color: '#92400e',
            width: 'fit-content',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#f59e0b',
              flexShrink: 0,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          Needs input
        </div>
      )}

      {/* Budget exceeded badge */}
      {nodeData.status === 'paused_budget' && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: '#fef3c7',
            borderRadius: 9999,
            fontSize: 10,
            fontWeight: 600,
            color: '#92400e',
            width: 'fit-content',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#f59e0b',
              flexShrink: 0,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
          Budget exceeded
        </div>
      )}

      {/* Footer: View Trace button */}
      {nodeData.runId && (
        <button
          onClick={handleViewTrace}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            background: 'none',
            border: '1px solid #e5e5e3',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            color: '#6b6b68',
            width: 'fit-content',
            marginTop: 'auto',
          }}
        >
          <Eye size={11} />
          View Trace
        </button>
      )}

      {/* Output handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${id}-source`}
        style={{
          background: borderColor,
          width: 8,
          height: 8,
          border: 'none',
        }}
      />
    </div>
  )
}

AgentNode.displayName = 'AgentNode'

export { AgentNode }
export default AgentNode
