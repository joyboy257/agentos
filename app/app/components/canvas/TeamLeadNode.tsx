'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCallback } from 'react'

interface TeamLeadNodeData {
  name: string
  status: 'idle' | 'running' | 'waiting_for_approval' | 'completed' | 'failed'
  teamMembers?: Array<{ agentId: string; name: string; status: string }>
  runId?: string
  isCoordinator?: boolean
}

const statusColors: Record<TeamLeadNodeData['status'], string> = {
  idle: '#22c55e',
  running: '#3b82f6',
  waiting_for_approval: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
}

export function TeamLeadNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as TeamLeadNodeData
  const statusColor = statusColors[nodeData.status] ?? '#6b7280'

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        const event = new CustomEvent('node-select', { detail: { id }, bubbles: true })
        document.dispatchEvent(event)
      }}
      style={{
        background: '#1e1b4b', // Deep indigo bg
        border: `2px solid ${statusColor}`,
        borderRadius: 12,
        padding: 12,
        minWidth: 200,
        boxShadow: `0 0 0 1px ${statusColor}40, 0 4px 16px rgba(0,0,0,0.20)`,
        position: 'relative',
        outline: selected ? `2px solid ${statusColor}` : 'none',
        outlineOffset: '2px',
        cursor: 'pointer',
      }}
    >
      {/* Coordinator badge */}
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: 12,
          background: '#6366f1',
          color: '#fff',
          fontSize: 9,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 4,
          letterSpacing: '0.05em',
        }}
      >
        COORDINATOR
      </div>

      {/* Node content */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <div style={{ fontSize: 18 }}>
          {/* Crown icon */}
          <span style={{ color: '#fbbf24' }}>★</span>
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{nodeData.name}</div>
          <div style={{ color: statusColor, fontSize: 11, textTransform: 'capitalize' }}>
            {nodeData.status.replace('_', ' ')}
          </div>
        </div>
      </div>

      {/* Team member status dots */}
      {nodeData.teamMembers && nodeData.teamMembers.length > 0 && (
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#a5b4fc', fontSize: 10, fontWeight: 500, marginRight: 2 }}>
            Team:
          </span>
          {nodeData.teamMembers.map((m) => (
            <div
              key={m.agentId}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background:
                  m.status === 'completed'
                    ? '#22c55e'
                    : m.status === 'failed'
                      ? '#ef4444'
                      : m.status === 'running'
                        ? '#3b82f6'
                        : '#6b7280',
              }}
              title={`${m.name}: ${m.status}`}
            />
          ))}
        </div>
      )}

      {/* Status subtitle for team lead */}
      {nodeData.status === 'running' && (
        <div style={{ color: '#a5b4fc', fontSize: 10, marginTop: 6 }}>
          Coordinating {nodeData.teamMembers?.length ?? 0} worker(s)...
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#6366f1', width: 8, height: 8, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#6366f1', width: 8, height: 8, border: 'none' }}
      />
    </div>
  )
}

TeamLeadNode.displayName = 'TeamLeadNode'
