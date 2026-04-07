'use client'

import { useState } from 'react'
import { Check, X, Plus } from 'lucide-react'

export interface GovernanceActionData {
  id: string
  user_id: string
  canvas_id: string | null
  action_type: 'new_agent' | 'new_tool' | 'schema_change'
  payload_json: string
  status: 'pending' | 'approved' | 'denied'
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

interface GovernanceActionCardProps {
  action: GovernanceActionData
  onResolve: (actionId: string, status: 'approved' | 'denied') => Promise<void>
}

function parsePayload(actionType: GovernanceActionData['action_type'], payloadJson: string): {
  summary: string
  details: string[]
} {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    return { summary: 'Unknown change', details: ['Could not parse payload'] }
  }

  if (actionType === 'new_agent') {
    const agentName = (payload.name as string) ?? 'Unnamed agent'
    const tools = (payload.tools as string[]) ?? []
    const risk = tools.includes('gmail.send') ? 'MEDIUM' : 'LOW'
    return {
      summary: `New agent: ${agentName}`,
      details: [
        `Role: ${(payload.role as string) ?? 'worker'}`,
        `Tools: ${tools.join(', ') || 'none'}`,
        `Risk level: ${risk}`,
      ],
    }
  }

  if (actionType === 'new_tool') {
    const toolName = (payload.tool_name as string) ?? 'Unknown tool'
    return {
      summary: `New tool: ${toolName}`,
      details: [
        `Description: ${(payload.description as string) ?? 'No description'}`,
        `Permission level: ${(payload.permission_level as string) ?? 'needs_approval'}`,
      ],
    }
  }

  if (actionType === 'schema_change') {
    return {
      summary: `Schema change: ${(payload.table as string) ?? 'unknown table'}`,
      details: [
        `Change type: ${(payload.change_type as string) ?? 'unknown'}`,
        `Column: ${(payload.column as string) ?? 'unknown'}`,
      ],
    }
  }

  return { summary: 'Unknown change', details: [] }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function GovernanceActionCard({ action, onResolve }: GovernanceActionCardProps) {
  const [loading, setLoading] = useState<'approved' | 'denied' | null>(null)
  const { summary, details } = parsePayload(action.action_type, action.payload_json)

  const handleResolve = async (status: 'approved' | 'denied') => {
    if (loading) return
    setLoading(status)
    try {
      await onResolve(action.id, status)
    } finally {
      setLoading(null)
    }
  }

  const isResolved = action.status !== 'pending'

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${action.status === 'pending' ? '#e5e7eb' : action.status === 'approved' ? '#059669' : '#ef4444'}`,
        borderRadius: 10,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: isResolved ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: action.action_type === 'new_agent' ? '#ede9fe' : action.action_type === 'new_tool' ? '#fef3c7' : '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Plus size={16} style={{ color: '#6b7280' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
            {summary}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
            {action.action_type === 'new_agent' ? 'New Agent' : action.action_type === 'new_tool' ? 'New Tool' : 'Schema Change'} &middot; {timeAgo(action.created_at)}
          </p>
        </div>
        {isResolved && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: 99,
              background: action.status === 'approved' ? '#d1fae5' : '#fee2e2',
              color: action.status === 'approved' ? '#065f46' : '#991b1b',
            }}
          >
            {action.status}
          </span>
        )}
      </div>

      {/* Details */}
      {details.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: '0 0 0 46px',
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {details.map((d, i) => (
            <li key={i} style={{ fontSize: 13, color: '#374151', display: 'flex', gap: 6 }}>
              <span style={{ color: '#9ca3af' }}>&bull;</span>
              {d}
            </li>
          ))}
        </ul>
      )}

      {/* Payload raw (collapsible) */}
      <details style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer' }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>View raw payload</summary>
        <pre
          style={{
            marginTop: 6,
            padding: 8,
            background: '#f9fafb',
            borderRadius: 6,
            fontSize: 11,
            overflow: 'auto',
            maxHeight: 120,
          }}
        >
          {action.payload_json}
        </pre>
      </details>

      {/* Actions */}
      {action.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button
            onClick={() => handleResolve('denied')}
            disabled={loading !== null}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: '1px solid #ef4444',
              background: '#fff',
              color: '#dc2626',
              opacity: loading === 'denied' ? 0.5 : 1,
            }}
          >
            <X size={14} />
            Deny
          </button>
          <button
            onClick={() => handleResolve('approved')}
            disabled={loading !== null}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: '1px solid #059669',
              background: '#059669',
              color: '#fff',
              opacity: loading === 'approved' ? 0.5 : 1,
            }}
          >
            <Check size={14} />
            Approve
          </button>
        </div>
      )}
    </div>
  )
}
