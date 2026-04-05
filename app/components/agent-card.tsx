'use client'

export interface AgentCardProps {
  agent: { id: string; name: string; role: string; tools: string[]; description?: string }
  status: 'ready' | 'running' | 'waiting' | 'completed' | 'error' | 'pending_approval' | 'skipped' | 'paused_budget' | 'idle' | 'stopped' | 'scheduled' | 'budget_exceeded'
  milestone?: string
  style?: React.CSSProperties
}

const roleColors: Record<string, string> = {
  email_reader: 'var(--agent-reader)',
  response_drafter: 'var(--agent-drafter)',
  ticket_reader: 'var(--agent-reader)',
  faq_responder: 'var(--agent-drafter)',
  escalation_triage: '#a78bfa',
  lead_researcher: 'var(--success)',
  lead_enricher: 'var(--agent-drafter)',
  llm: 'var(--accent)',
  reader: 'var(--agent-reader)',
  drafter: 'var(--agent-drafter)',
  sender: 'var(--agent-sender)',
  escalation: '#a78bfa',
  researcher: 'var(--success)',
}

const statusColors: Record<string, string> = {
  ready: '#6b6b7b',
  running: 'var(--success)',
  waiting: 'var(--agent-drafter)',
  completed: 'var(--success)',
  error: '#ef4444',
  pending_approval: '#f97316',
  skipped: '#6b6b7b',
}

export function AgentCard({ agent, status, milestone, style }: AgentCardProps) {
  const borderColor = roleColors[agent.role] || 'var(--border)'

  return (
    <div
      style={{
        width: '160px',
        backgroundColor: 'var(--panel)',
        border: `2px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '14px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        position: 'relative',
        ...style,
      }}
    >
      {/* Status dot */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: statusColors[status],
          animation: (status === 'running' || status === 'pending_approval') ? 'pulse 1.5s infinite' : 'none',
        }}
      />

      {/* Agent name */}
      <div
        style={{
          fontWeight: 700,
          fontSize: '13px',
          marginBottom: '4px',
          color: 'var(--text-primary)',
        }}
      >
        {agent.name || agent.role.replace('_', ' ')}
      </div>

      {/* Milestone label */}
      {milestone && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '6px',
            lineHeight: 1.3,
          }}
        >
          {milestone}
        </div>
      )}

      {/* Agent description */}
      {agent.description && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '10px',
            lineHeight: 1.4,
          }}
        >
          {agent.description}
        </div>
      )}

      {/* Tool badges */}
      {agent.tools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {agent.tools.slice(0, 3).map((tool) => (
            <span
              key={tool}
              style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
