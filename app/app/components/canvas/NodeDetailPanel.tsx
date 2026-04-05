'use client'

import { X, Clock, Zap, AlertTriangle, Eye, Users, Activity } from 'lucide-react'
import { useCanvas, type AgentNodeData } from './CanvasProvider'
import { ReasoningPanel } from '@/components/reasoning-panel'
import { getActiveEscalation } from '@/lib/runtime/escalation-store'

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
  const { selectedNode, setSelectedNodeId, activeEscalationId } = useCanvas()

  // Priority 1: Escalation active
  if (activeEscalationId) {
    return (
      <div style={panelStyle}>
        <PanelHeader
          title="Needs Your Input"
          statusColor="#f59e0b"
          badge="1 pending"
          onClose={() => setSelectedNodeId(null)}
        />
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={14} color="#f59e0b" />
            <span style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>
              An agent is waiting for your input — respond using the card on the canvas
            </span>
          </div>
          <ReasoningPanel
            runId={getActiveEscalation().runId ?? null}
            isOpen={true}
            onToggle={() => {}}
            maxHeight={400}
          />
        </div>
      </div>
    )
  }

  // Priority 2: Node selected
  if (selectedNode) {
    return (
      <NodeSelectedState
        node={selectedNode}
        onClose={() => setSelectedNodeId(null)}
      />
    )
  }

  // Priority 3: Nothing selected — Team Lead overview
  return <TeamLeadOverview onSelectNode={(id) => setSelectedNodeId(id)} />
}

function PanelHeader({
  title,
  statusColor,
  badge,
  onClose,
}: {
  title: string
  statusColor?: string
  badge?: string
  onClose: () => void
}) {
  return (
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
        {statusColor && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#6b6b68',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            style={{
              padding: '2px 8px',
              background: '#fef3c7',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 600,
              color: '#92400e',
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <button
        onClick={onClose}
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
  )
}

function NodeSelectedState({
  node,
  onClose,
}: {
  node: ReturnType<typeof useCanvas>['selectedNode']
  onClose: () => void
}) {
  if (!node) return null
  const data = node.data as AgentNodeData
  const isTeamLead = data.role === 'Team Lead'
  const status = statusConfig[data.status] ?? statusConfig.idle
  const StatusIcon = status.icon
  const hasTrace = !!data.runId

  return (
    <div style={panelStyle}>
      <PanelHeader
        title={data.role}
        statusColor={status.color}
        onClose={onClose}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1c1c1a', margin: '0 0 16px 0', lineHeight: 1.3 }}>
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

      {/* Footer — View Trace */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #e5e5e3',
        }}
      >
        {hasTrace ? (
          <button
            onClick={() => {
              const event = new CustomEvent('open-reasoning-panel', {
                detail: { runId: data.runId },
                bubbles: true,
              })
              document.dispatchEvent(event)
            }}
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
            View Reasoning Trace
          </button>
        ) : (
          <div style={{ fontSize: 13, color: '#a3a3a0', textAlign: 'center' }}>
            No active run — trace available when agent is running
          </div>
        )}
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

function TeamLeadOverview({
  onSelectNode,
}: {
  onSelectNode: (id: string) => void
}) {
  const { nodes } = useCanvas()

  const teamLead = nodes.find((n) => (n.data as AgentNodeData).role === 'Team Lead')
  const workers = nodes.filter((n) => (n.data as AgentNodeData).role === 'Worker')

  const totalRunsToday = workers.reduce(
    (sum, w) => sum + ((w.data as AgentNodeData).runCountToday ?? 0),
    0
  )
  const totalEscalations = workers.reduce(
    (sum, w) => sum + ((w.data as AgentNodeData).escalatedCountToday ?? 0),
    0
  )
  const activeWorkers = workers.filter((w) => (w.data as AgentNodeData).status === 'running').length
  const teamLeadData = teamLead?.data as AgentNodeData | undefined

  return (
    <div style={panelStyle}>
      <PanelHeader title="Your Team" onClose={() => {}} />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {/* Team Lead card */}
        {teamLead && (
          <button
            onClick={() => onSelectNode(teamLead.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '12px 14px',
              background: '#f5f0ff',
              border: '2px solid #7c3aed',
              borderRadius: 12,
              cursor: 'pointer',
              marginBottom: 16,
              textAlign: 'left',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              M
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1a' }}>
                {teamLeadData?.name ?? "Maria's Research Lead"}
              </div>
              <div style={{ fontSize: 12, color: '#6b6b68', marginTop: 2 }}>
                {activeWorkers} workers active
              </div>
            </div>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: teamLeadData?.status === 'running' ? '#22c55e' : '#a3a3a0',
                flexShrink: 0,
              }}
            />
          </button>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <StatCard
            icon={<Activity size={14} />}
            value={totalRunsToday}
            label="Tasks today"
            color="#22c55e"
          />
          <StatCard
            icon={<AlertTriangle size={14} />}
            value={totalEscalations}
            label="Escalations"
            color={totalEscalations > 0 ? '#f59e0b' : '#a3a3a0'}
          />
        </div>

        {/* Worker list */}
        {workers.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6b6b68',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 8,
              }}
            >
              Workers ({workers.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {workers.map((worker) => {
                const wData = worker.data as AgentNodeData
                const wStatus = statusConfig[wData.status] ?? statusConfig.idle
                return (
                  <button
                    key={worker.id}
                    onClick={() => onSelectNode(worker.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      background: '#ffffff',
                      border: '1px solid #e5e5e3',
                      borderRadius: 10,
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: wStatus.color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#1c1c1a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {wData.name}
                      </div>
                      {wData.archetype && (
                        <span
                          style={{
                            fontSize: 11,
                            color: archetypeColors[wData.archetype]?.color ?? '#6b6b68',
                            fontWeight: 500,
                          }}
                        >
                          {wData.archetype}
                        </span>
                      )}
                    </div>
                    {wData.runCountToday !== undefined && (
                      <span style={{ fontSize: 12, color: '#6b6b68' }}>
                        {wData.runCountToday} runs
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {workers.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 16px',
              color: '#6b6b68',
              fontSize: 14,
            }}
          >
            <Users size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
            <div>No workers yet</div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#a3a3a0' }}>
              Use the prompt bar above to hire your first AI employee
            </div>
          </div>
        )}
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

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode
  value: number
  label: string
  color: string
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '12px 14px',
        background: '#f5f5f3',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ color, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1c1c1a', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#6b6b68', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
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
}
