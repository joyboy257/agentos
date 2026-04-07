'use client'

import { useState, useRef, useEffect } from 'react'
import { Info, X } from 'lucide-react'
import type { AgentNodeData } from './CanvasProvider'

interface AgentCardProps {
  data: AgentNodeData
}

const statusColors: Record<AgentNodeData['status'], string> = {
  running: '#22c55e',
  idle: '#a3a3a0',
  stopped: '#a3a3a0',
  scheduled: '#f59e0b',
  error: '#ef4444',
  waiting: '#60a5fa',
  paused_budget: '#f59e0b',
}

const statusLabels: Record<AgentNodeData['status'], string> = {
  running: 'Running',
  idle: 'Idle',
  stopped: 'Stopped',
  scheduled: 'Scheduled',
  error: 'Error',
  waiting: 'Waiting for input',
  paused_budget: 'Budget exceeded',
}

export function AgentCard({ data }: AgentCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const statusColor = statusColors[data.status] ?? statusColors.idle

  return (
    <div ref={cardRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Info button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        title="Agent info"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          background: 'none',
          border: '1px solid #e5e5e3',
          borderRadius: 6,
          cursor: 'pointer',
          color: '#6b6b68',
          padding: 0,
        }}
      >
        <Info size={12} />
      </button>

      {/* Card popover */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 220,
            background: '#1c1c1a',
            border: '1px solid #3f3f3c',
            borderRadius: 12,
            padding: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.32)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#a3a3a0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Agent Status
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(false)
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#6b6b68',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={12} />
            </button>
          </div>

          {/* Agent name */}
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#fafaf9',
              lineHeight: 1.3,
            }}
          >
            {data.name}
          </div>

          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor,
                flexShrink: 0,
                animation: data.status === 'running' ? 'pulse 2s ease-in-out infinite' : 'none',
              }}
            />
            <span style={{ fontSize: 13, color: '#fafaf9', fontWeight: 500 }}>
              {statusLabels[data.status]}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#3f3f3c' }} />

          {/* Last run */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#6b6b68', fontWeight: 500 }}>Last run</span>
            <span style={{ fontSize: 13, color: '#fafaf9' }}>
              {data.lastRunAt ?? 'Never'}
            </span>
          </div>

          {/* Next wake */}
          {data.nextWakeAt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#6b6b68', fontWeight: 500 }}>Next wake</span>
              <span style={{ fontSize: 13, color: '#fafaf9' }}>{data.nextWakeAt}</span>
            </div>
          )}

          {/* Runs today */}
          {data.runCountToday !== undefined && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#6b6b68', fontWeight: 500 }}>Runs today</span>
              <span style={{ fontSize: 13, color: '#fafaf9' }}>{data.runCountToday}</span>
            </div>
          )}

          {/* Escalations today */}
          {data.escalatedCountToday !== undefined && data.escalatedCountToday > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#6b6b68', fontWeight: 500 }}>Escalations today</span>
              <span style={{ fontSize: 13, color: '#f97316' }}>{data.escalatedCountToday}</span>
            </div>
          )}

          {/* Budget bar */}
          {data.budgetUsedPercent !== undefined && data.budgetUsedPercent > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#6b6b68', fontWeight: 500 }}>Budget used</span>
                <span style={{ fontSize: 11, color: '#a3a3a0' }}>{data.budgetUsedPercent}%</span>
              </div>
              <div
                style={{
                  height: 6,
                  background: '#3f3f3c',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(data.budgetUsedPercent, 100)}%`,
                    height: '100%',
                    background:
                      data.budgetUsedPercent > 80
                        ? '#ef4444'
                        : data.budgetUsedPercent > 50
                        ? '#f59e0b'
                        : '#22c55e',
                    borderRadius: 3,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              {data.budgetUsedPercent > 80 && (
                <a
                  href="/settings/agents"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px 10px',
                    background: 'none',
                    border: '1px solid #ef4444',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#ef4444',
                    textDecoration: 'none',
                  }}
                >
                  Add budget
                </a>
              )}
            </div>
          )}

          {/* Resume button — shown when agent is paused on budget */}
          {data.status === 'paused_budget' && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  const res = await fetch(`/api/agents/${data.nodeId}/resume`, { method: 'POST' })
                  if (res.ok) {
                    // Reload the page to refresh canvas state
                    window.location.reload()
                  }
                } catch (err) {
                  console.error('Failed to resume agent:', err)
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 12px',
                background: '#f59e0b',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: '#ffffff',
                width: '100%',
              }}
            >
              Resume Agent
            </button>
          )}
        </div>
      )}
    </div>
  )
}
