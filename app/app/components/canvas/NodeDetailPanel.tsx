'use client'

import { X, Clock, Zap, AlertTriangle, Eye } from 'lucide-react'
import { useCanvas, type AgentNodeData } from './CanvasProvider'

const statusConfig: Record<AgentNodeData['status'], { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  running: { label: 'Running', color: '#22c55e', bgColor: '#dcfce7', icon: Zap },
  idle: { label: 'Idle', color: '#a3a3a0', bgColor: '#f5f5f3', icon: Clock },
  stopped: { label: 'Stopped', color: '#a3a3a0', bgColor: '#f5f5f3', icon: Clock },
  scheduled: { label: 'Scheduled', color: '#f59e0b', bgColor: '#fef3c7', icon: Clock },
  error: { label: 'Error', color: '#ef4444', bgColor: '#fee2e2', icon: AlertTriangle },
  waiting: { label: 'Waiting', color: '#60a5fa', bgColor: '#dbeafe', icon: Clock },
}

const archetypeColors: Record<NonNullable<AgentNodeData['archetype']>, { color: string; bgColor: string }> = {
  Ingest: { color: '#0ea5e9', bgColor: '#f0f9ff' },
  Process: { color: '#f59e0b', bgColor: '#fffbeb' },
  Distill: { color: '#10b981', bgColor: '#ecfdf5' },
}

export function NodeDetailPanel() {
  const { selectedNode, setSelectedNodeId } = useCanvas()

  if (!selectedNode) return null

  const data = selectedNode.data as AgentNodeData
  const isTeamLead = data.role === 'Team Lead'
  const status = statusConfig[data.status] ?? statusConfig.idle
  const StatusIcon = status.icon

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 360,
        height: '100%',
        background: '#ffffff',
        borderLeft: '1px solid #e5e5e3',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e5e3',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#6b6b68',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {data.role}
          </span>
          {data.archetype && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                background: archetypeColors[data.archetype].bgColor,
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 500,
                color: archetypeColors[data.archetype].color,
              }}
            >
              {data.archetype}
            </span>
          )}
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            border: 'none',
            background: 'transparent',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#6b6b68',
          }}
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {/* Agent name */}
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#1c1c1a',
            margin: '0 0 16px 0',
            lineHeight: 1.3,
          }}
        >
          {data.name}
        </h2>

        {/* Status badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: status.bgColor,
            borderRadius: 9999,
            marginBottom: 20,
          }}
        >
          <StatusIcon size={14} color={status.color} />
          <span style={{ fontSize: 13, fontWeight: 500, color: status.color }}>
            {status.label}
          </span>
        </div>

        {/* Team Lead stats */}
        {isTeamLead && data.workerCount !== undefined && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: '#6b6b68', marginBottom: 8 }}>
              Team: {data.workerCount} workers active
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {data.lastRunAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={14} color="#6b6b68" />
              <span style={{ fontSize: 14, color: '#6b6b68' }}>Last run:</span>
              <span style={{ fontSize: 14, color: '#1c1c1a', fontWeight: 500 }}>{data.lastRunAt}</span>
            </div>
          )}
          {data.nextWakeAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={14} color="#f59e0b" />
              <span style={{ fontSize: 14, color: '#6b6b68' }}>Next wake:</span>
              <span style={{ fontSize: 14, color: '#1c1c1a', fontWeight: 500 }}>{data.nextWakeAt}</span>
            </div>
          )}
        </div>

        {/* Budget bar */}
        {data.budgetUsedPercent !== undefined && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 13, color: '#6b6b68' }}>Budget used</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1c1c1a' }}>
                {data.budgetUsedPercent}%
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                background: '#f5f5f3',
                borderRadius: 9999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${data.budgetUsedPercent}%`,
                  height: '100%',
                  background:
                    data.budgetUsedPercent > 80
                      ? '#ef4444'
                      : data.budgetUsedPercent > 60
                        ? '#f59e0b'
                        : '#22c55e',
                  borderRadius: 9999,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Worker stats */}
        {!isTeamLead && (data.runCountToday !== undefined || data.escalatedCountToday !== undefined) && (
          <div
            style={{
              display: 'flex',
              gap: 16,
              padding: 16,
              background: '#f5f5f3',
              borderRadius: 12,
              marginBottom: 24,
            }}
          >
            {data.runCountToday !== undefined && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#1c1c1a' }}>
                  {data.runCountToday}
                </div>
                <div style={{ fontSize: 12, color: '#6b6b68' }}>Runs today</div>
              </div>
            )}
            {data.escalatedCountToday !== undefined && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#f59e0b' }}>
                  {data.escalatedCountToday}
                </div>
                <div style={{ fontSize: 12, color: '#6b6b68' }}>Escalated</div>
              </div>
            )}
          </div>
        )}

        {/* Tools */}
        {data.tools && data.tools.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: '#6b6b68',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}
            >
              Tools
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.tools.map((tool) => (
                <span
                  key={tool}
                  style={{
                    padding: '4px 10px',
                    background: '#eef0fc',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#5b4fe9',
                    fontWeight: 500,
                  }}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #e5e5e3',
        }}
      >
        <button
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 20px',
            background: '#5b4fe9',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Eye size={16} />
          View Run History
        </button>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
