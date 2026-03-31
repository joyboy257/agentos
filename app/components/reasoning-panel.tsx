'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  Bot,
} from 'lucide-react'
import { ReasoningEvent } from '@/lib/tracing/event-schema'

const MAX_RENDERED_EVENTS = 500

const EVENT_TYPE_ICONS: Record<string, typeof Eye> = {
  observation: Eye,
  classification: MessageSquare,
  decision: CheckCircle,
  action: Zap,
  warning: AlertTriangle,
  approval_required: AlertTriangle,
  approval_resolved: CheckCircle,
  status: Bot,
  done: CheckCircle,
  error: XCircle,
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  observation: 'bg-blue-100 border-blue-300 text-blue-800',
  classification: 'bg-purple-100 border-purple-300 text-purple-800',
  decision: 'bg-green-100 border-green-300 text-green-800',
  action: 'bg-orange-100 border-orange-300 text-orange-800',
  warning: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  approval_required: 'bg-amber-100 border-amber-300 text-amber-800',
  approval_resolved: 'bg-green-100 border-green-300 text-green-800',
  status: 'bg-gray-100 border-gray-300 text-gray-800',
  done: 'bg-green-100 border-green-300 text-green-800',
  error: 'bg-red-100 border-red-300 text-red-800',
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
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
  }
}

interface MilestoneCardProps {
  event: ReasoningEvent
  agentName?: string
}

function MilestoneCard({ event, agentName }: MilestoneCardProps) {
  const Icon = EVENT_TYPE_ICONS[event.type] || Eye
  const colorClass = EVENT_TYPE_COLORS[event.type] || 'bg-gray-100 border-gray-300 text-gray-800'

  return (
    <div className={`rounded-lg border p-3 ${colorClass} transition-all hover:shadow-md`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm truncate">
              {agentName || event.agentId}
            </span>
            <span className="text-xs opacity-75 flex-shrink-0">
              {formatTimestamp(event.timestamp)}
            </span>
          </div>
          <p className="text-sm mt-1 break-words">
            {getEventSummary(event)}
          </p>
          {event.type === 'action' && !!((event.content as Record<string, unknown>).args) && (
            <div className="mt-2 text-xs opacity-75">
              {Object.entries((event.content as Record<string, unknown>).args as Record<string, unknown>)
                .slice(0, 3)
                .map(([key, value]) => (
                  <span key={key} className="mr-2">
                    {key}: <span className="font-mono">{String(value).substring(0, 20)}</span>
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface VirtualListProps {
  items: ReasoningEvent[]
  renderItem: (event: ReasoningEvent, index: number) => React.ReactNode
  itemHeight: number
  height: number
}

function VirtualList({ items, renderItem, itemHeight, height }: VirtualListProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const visibleStart = Math.floor(scrollTop / itemHeight)
  const visibleEnd = Math.min(items.length, Math.ceil((scrollTop + height) / itemHeight))
  const visibleItems = items.slice(visibleStart, visibleEnd)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return (
    <div
      ref={containerRef}
      className="overflow-auto"
      style={{ height }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: items.length * itemHeight,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: visibleStart * itemHeight,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((event, i) => renderItem(event, visibleStart + i))}
        </div>
      </div>
    </div>
  )
}

interface ReasoningPanelProps {
  runId: string | null
  isOpen: boolean
  onToggle: () => void
  maxHeight?: number
}

export function ReasoningPanel({
  runId,
  isOpen,
  onToggle,
  maxHeight = 400,
}: ReasoningPanelProps) {
  const [events, setEvents] = useState<ReasoningEvent[]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [lastSequence, setLastSequence] = useState(0)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId || !isOpen) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsConnected(false)
      }
      return
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
          setLastSequence(data.sequence || 0)
          setEvents((prev) => {
            const newEvents = [...prev, data]
            // Apply virtual scrolling cap
            if (newEvents.length > MAX_RENDERED_EVENTS) {
              return newEvents.slice(-MAX_RENDERED_EVENTS)
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
        // Reconnect after 1 second
        setTimeout(() => {
          if (runId) connect()
        }, 1000)
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
  }, [runId, isOpen, lastSequence])

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200 transition-colors"
      >
        <Bot className="h-4 w-4" />
        <span>Reasoning</span>
        {events.length > 0 && (
          <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            {events.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-200">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-600" />
          <h3 className="font-semibold text-purple-900">Reasoning Trace</h3>
          {isConnected && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
          {events.length > 0 && (
            <span className="text-xs text-purple-600">
              {events.length} events
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-purple-100 rounded transition-colors"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-purple-100 rounded transition-colors"
            title="Close"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <>
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <div className="text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Waiting for reasoning events...</p>
              </div>
            </div>
          ) : (
            <VirtualList
              items={events}
              renderItem={(event) => (
                <div className="p-2">
                  <MilestoneCard event={event} />
                </div>
              )}
              itemHeight={100}
              height={maxHeight}
            />
          )}
        </>
      )}
    </div>
  )
}
