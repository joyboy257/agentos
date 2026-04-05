'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ReasoningEvent } from '@/lib/tracing/event-schema'

// Emoji-based icons per event type — matches user spec
const EVENT_TYPE_EMOJI: Record<string, string> = {
  observation: '💡',
  classification: '🎯',
  decision: '🎯',
  action: '⚡',
  warning: '⚠️',
  approval_required: '⚠️',
  approval_resolved: '✅',
  status: '📊',
  done: '✅',
  error: '❌',
}

const EVENT_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  observation: { bg: '#1e3a5f', border: '#3b82f6', text: '#93c5fd' },
  classification: { bg: '#2d1f5e', border: '#a855f7', text: '#d8b4fe' },
  decision: { bg: '#2d1f5e', border: '#a855f7', text: '#d8b4fe' },
  action: { bg: '#14532d', border: '#22c55e', text: '#86efac' },
  warning: { bg: '#451a03', border: '#f59e0b', text: '#fcd34d' },
  approval_required: { bg: '#451a03', border: '#f59e0b', text: '#fcd34d' },
  approval_resolved: { bg: '#14532d', border: '#22c55e', text: '#86efac' },
  status: { bg: '#1f1f1f', border: '#6b6b68', text: '#a3a3a0' },
  done: { bg: '#14532d', border: '#22c55e', text: '#86efac' },
  error: { bg: '#4c0519', border: '#ef4444', text: '#fca5a5' },
}

const MAX_EVENTS = 500

function formatRelativeTime(timestamp: number, runStartTime: number): string {
  const delta = timestamp - runStartTime
  if (delta < 0) return '0.0s'
  const seconds = Math.floor(delta / 1000)
  const ms = Math.floor((delta % 1000) / 100)
  if (seconds < 60) return `${seconds}.${ms}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function getEventSummary(event: ReasoningEvent): string {
  const content = event.content as Record<string, unknown>
  switch (event.type) {
    case 'observation':
      return (content.text as string) || ''
    case 'classification':
      return `Classified as "${content.label}"${content.confidence ? ` (${Math.round((content.confidence as number) * 100)}%)` : ''}`
    case 'decision':
      return `Decided: ${content.chosen}`
    case 'action':
      return `Action: ${content.action}`
    case 'warning':
      return `Warning: ${content.text}`
    case 'approval_required':
      return `Approval required: ${content.summary}`
    case 'approval_resolved':
      return `Approval ${content.decision}`
    case 'status':
      return `Status: ${content.status}`
    case 'done':
      return `Completed: ${content.summary}`
    case 'error':
      return `Error: ${content.message}`
    default:
      return JSON.stringify(content)
  }
}

interface TraceEventItemProps {
  event: ReasoningEvent
  runStartTime: number
}

function TraceEventItem({ event, runStartTime }: TraceEventItemProps) {
  const emoji = EVENT_TYPE_EMOJI[event.type] || '📋'
  const colors = EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.status

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 14px',
        borderLeft: `3px solid ${colors.border}`,
        background: colors.bg,
        marginBottom: 6,
        borderRadius: '0 8px 8px 0',
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: '1.4' }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: colors.text,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              opacity: 0.8,
            }}
          >
            {event.type}
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#6b6b68',
              fontFamily: 'monospace',
              flexShrink: 0,
            }}
          >
            +{formatRelativeTime(event.timestamp, runStartTime)}
          </span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: colors.text,
            margin: 0,
            lineHeight: 1.4,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            wordBreak: 'break-word',
          }}
        >
          {getEventSummary(event)}
        </p>
        {event.type === 'action' && Boolean((event.content as Record<string, unknown>).args) && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: colors.text,
              opacity: 0.7,
              fontFamily: 'monospace',
            }}
          >
            {(Object.entries((event.content as Record<string, unknown>).args as Record<string, unknown>) as [string, unknown][])
              .slice(0, 3)
              .map(([key, value]) => (
                <span key={key} style={{ marginRight: 10 }}>
                  {key}: {String(value).substring(0, 30)}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface TracePanelProps {
  runId: string | null
  isOpen: boolean
  onToggle: () => void
  maxHeight?: number
  runStartTime?: number
}

export function TracePanel({
  runId,
  isOpen,
  onToggle,
  maxHeight = 500,
  runStartTime: initialRunStartTime,
}: TracePanelProps) {
  const [events, setEvents] = useState<ReasoningEvent[]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [lastSequence, setLastSequence] = useState(0)
  const [runStartTime, setRunStartTime] = useState(initialRunStartTime ?? Date.now())
  const eventSourceRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (shouldAutoScroll.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events])

  // Handle scroll to detect if user scrolled up — disable auto-scroll if so
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50
    shouldAutoScroll.current = isAtBottom
  }, [])

  useEffect(() => {
    if (!runId || !isOpen) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsConnected(false)
      }
      return
    }

    // Set run start time on first connection
    if (!runStartTime || runStartTime === 0) {
      setRunStartTime(Date.now())
    }

    const connect = () => {
      const url = `/api/runs/${runId}/events${lastSequence > 0 ? `?lastSequence=${lastSequence}` : ''}`
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setIsConnected(true)
      }

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'stream_end') {
            eventSource.close()
            setIsConnected(false)
            return
          }
          const event = data as ReasoningEvent
          setLastSequence(event.sequence || 0)
          setEvents((prev) => {
            const newEvents = [...prev, event]
            if (newEvents.length > MAX_EVENTS) {
              return newEvents.slice(-MAX_EVENTS)
            }
            return newEvents
          })
        } catch {
          // Ignore parse errors
        }
      }

      eventSource.onerror = () => {
        setIsConnected(false)
        eventSource.close()
        // Reconnect after 2 seconds
        setTimeout(() => {
          if (runId) connect()
        }, 2000)
      }
    }

    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsConnected(false)
      }
    }
  }, [runId, isOpen, lastSequence, runStartTime])

  // Collapsed toggle button when panel is closed
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: '#1f1f1f',
          border: '1px solid #3f3f3f',
          borderRadius: 10,
          color: '#a3a3a0',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 16 }}>📋</span>
        <span>Trace</span>
        {events.length > 0 && (
          <span
            style={{
              background: '#22c55e',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 9999,
            }}
          >
            {events.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      style={{
        background: '#18181b',
        border: '1px solid #3f3f3f',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#1f1f1f',
          borderBottom: '1px solid #3f3f3f',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#e4e4e7',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Trace
          </span>
          {isConnected && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: '#22c55e',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#22c55e',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              Live
            </span>
          )}
          {!isConnected && events.length > 0 && (
            <span style={{ fontSize: 11, color: '#f59e0b' }}>Reconnecting...</span>
          )}
          {events.length > 0 && (
            <span style={{ fontSize: 11, color: '#6b6b68' }}>
              {events.length} events
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid #3f3f3f',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#a3a3a0',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▲' : '▼'}
          </button>
          <button
            onClick={onToggle}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid #3f3f3f',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#a3a3a0',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Event list */}
      {!isCollapsed && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 12px',
          }}
          onScroll={handleScroll}
        >
          {events.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 120,
                color: '#6b6b68',
              }}
            >
              <span style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>⏳</span>
              <p style={{ fontSize: 13, margin: 0 }}>Waiting for events...</p>
            </div>
          ) : (
            <>
              {events.map((event, i) => (
                <TraceEventItem
                  key={`${event.step}-${i}`}
                  event={event}
                  runStartTime={runStartTime}
                />
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
