'use client'

import { useRef, useEffect, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useNLToCanvas, type PromptBarState, type CanvasAgent, type NLToCanvasResult } from '@/app/hooks/useNLToCanvas'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PromptBarVariant = 'bottom-bar' | 'command-palette'

interface NLPromptBarProps {
  teamId: string
  onActivate: (result: NLToCanvasResult) => void
  onCancel: () => void
  /** 'bottom-bar' renders at bottom of screen (default). 'command-palette' renders centered with backdrop. */
  variant?: PromptBarVariant
  /** For command-palette variant: callback when user clicks the backdrop to close. */
  onBackdropClick?: () => void
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Minimal mini-canvas for the preview card */
function MiniCanvasPreview({
  agents,
  connections,
}: {
  agents: CanvasAgent[]
  connections: { source: string; target: string }[]
}) {
  const ARCHETYPE_COLORS: Record<string, { border: string; bg: string }> = {
    Ingest: { border: '#0EA5E9', bg: '#f0f9ff' },
    Process: { border: '#F59E0B', bg: '#fffbeb' },
    Distill: { border: '#10B981', bg: '#ecfdf5' },
    undefined: { border: '#5B4FE9', bg: '#eef0fc' },
  }

  // Layout agents in a simple horizontal cascade
  const nodeWidth = 120
  const nodeHeight = 60
  const gapX = 80
  const gapY = 40
  const startX = 20
  const startY = 40

  const positioned = agents.map((agent, idx) => ({
    ...agent,
    x: startX + idx * (nodeWidth + gapX),
    y: startY + Math.floor(idx / 3) * (nodeHeight + gapY),
  }))

  const nodeMap = new Map(positioned.map(a => [a.id, a]))

  return (
    <svg
      width="100%"
      height="120"
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Agent workflow preview"
    >
      {/* Edges */}
      {connections.map(conn => {
        const from = nodeMap.get(conn.source)
        const to = nodeMap.get(conn.target)
        if (!from || !to) return null

        const x1 = from.x + nodeWidth
        const y1 = from.y + nodeHeight / 2
        const x2 = to.x
        const y2 = to.y + nodeHeight / 2
        const midX = (x1 + x2) / 2

        return (
          <g key={`${conn.source}-${conn.target}`}>
            <path
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#5B4FE9"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            {/* Arrow */}
            <polygon
              points={`${x2 - 6},${y2 - 4} ${x2},${y2} ${x2 - 6},${y2 + 4}`}
              fill="#5B4FE9"
            />
          </g>
        )
      })}

      {/* Nodes */}
      {positioned.map(agent => {
        const colors = ARCHETYPE_COLORS[agent.archetype ?? 'undefined']
        return (
          <g key={agent.id}>
            <rect
              x={agent.x}
              y={agent.y}
              width={nodeWidth}
              height={nodeHeight}
              rx={8}
              fill={colors.bg}
              stroke={colors.border}
              strokeWidth={2}
            />
            <text
              x={agent.x + nodeWidth / 2}
              y={agent.y + 22}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#1c1c1a"
            >
              {agent.name.length > 16 ? agent.name.slice(0, 14) + '…' : agent.name}
            </text>
            <text
              x={agent.x + nodeWidth / 2}
              y={agent.y + 40}
              textAnchor="middle"
              fontSize={10}
              fill="#6b6b68"
            >
              {agent.archetype ?? 'Worker'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Progressive loading card — shown after 15s of submitting */
function ProgressiveLoadingCard({ onCancel }: { onCancel: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 340,
        background: '#ffffff',
        border: '1px solid #e5e5e3',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        textAlign: 'center',
        zIndex: 200,
        animation: 'slideUp 200ms ease-out',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>
        <Loader2 size={28} color="#5B4FE9" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1a', marginBottom: 4 }}>
        Still working on it…
      </div>
      <div style={{ fontSize: 13, color: '#6b6b68', marginBottom: 16 }}>
        Your goal is a bit complex. Still interpreting — this usually takes about 15–20 seconds.
      </div>
      <button
        onClick={onCancel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          background: '#f5f5f3',
          border: '1px solid #e5e5e3',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          color: '#6b6b68',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

/** Preview card — the trust-building moment */
function PreviewCard({
  preview,
  confidence,
  onActivate,
  onCancel,
  onClarificationSelect,
  clarification,
}: {
  preview: NLToCanvasResult | null
  confidence: number
  clarification: { question: string; options: { label: string; goal: string }[] } | null
  onActivate: () => void
  onCancel: () => void
  onClarificationSelect: (goal: string) => void
}) {
  const isLowConfidence = confidence < 0.5
  const showWasThisRight = isLowConfidence && !clarification

  if (clarification) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 520,
          maxWidth: '90vw',
          background: '#ffffff',
          border: '1px solid #e5e5e3',
          borderLeft: '4px solid #5B4FE9',
          borderRadius: 12,
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          zIndex: 200,
          animation: 'slideUp 200ms ease-out',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🤔</span>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#1c1c1a',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}
        >
          Not sure I understood
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1a', marginBottom: 16 }}>
          {clarification.question}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {clarification.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onClarificationSelect(opt.goal)}
              style={{
                display: 'block',
                width: '100%',
                padding: '12px 16px',
                background: '#f5f5f3',
                border: '1px solid #e5e5e3',
                borderRadius: 8,
                fontSize: 14,
                color: '#1c1c1a',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #e5e5e3',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: '#6b6b68',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    )
  }

  if (!preview) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520,
        maxWidth: '90vw',
        background: '#ffffff',
        border: '1px solid #e5e5e3',
        borderLeft: '4px solid #5B4FE9',
        borderRadius: 12,
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        zIndex: 200,
        animation: 'slideUp 200ms ease-out',
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1c1c1a', marginBottom: 16 }}>
        I'll create a {preview.graph.agents[0]?.name ?? 'worker team'}
      </div>

      {/* Node + wire preview */}
      <div
        style={{
          background: '#f5f5f3',
          borderRadius: 8,
          padding: '12px 12px 4px 12px',
          marginBottom: 16,
          overflow: 'hidden',
        }}
      >
        <MiniCanvasPreview
          agents={preview.graph.agents}
          connections={preview.graph.connections}
        />
      </div>

      {/* Tools summary */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
          fontSize: 13,
          color: '#6b6b68',
        }}
      >
        <span style={{ fontWeight: 500 }}>Reads:</span>
        {preview.graph.agents
          .filter(a => a.archetype === 'Ingest')
          .flatMap(a => a.tools)
          .filter((t, i, arr) => arr.indexOf(t) === i)
          .map(t => (
            <span key={t} style={pillStyle('#0EA5E9', '#f0f9ff')}>{t}</span>
          ))}
      </div>

      <div
        style={{
          fontSize: 13,
          color: '#6b6b68',
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 500 }}>Does:</span>{' '}
        {preview.graph.agents
          .filter(a => a.tools.includes('llm'))
          .map(a => a.description ?? a.name)
          .slice(0, 2)
          .join(', ') || 'processes and routes information'}
      </div>

      {/* Explanation */}
      <div
        style={{
          fontSize: 14,
          color: '#1c1c1a',
          lineHeight: 1.5,
          padding: '12px',
          background: '#f9f9f7',
          borderRadius: 8,
          marginBottom: 20,
          borderLeft: '3px solid #d4d4d1',
        }}
      >
        {preview.confidence < 0.5
          ? `I think you want: ${preview.explanation}`
          : preview.explanation}
      </div>

      {/* Low confidence confirmation */}
      {showWasThisRight && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#6b6b68',
            marginBottom: 12,
          }}
        >
          Was this right?
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 18px',
            background: '#ffffff',
            border: '1px solid #e5e5e3',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            color: '#6b6b68',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onActivate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 20px',
            background: '#5B4FE9',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: '#ffffff',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(91,79,233,0.3)',
          }}
        >
          {showWasThisRight ? 'Yes, Activate' : 'Edit & Activate'}
        </button>
      </div>
    </div>
  )
}

function pillStyle(color: string, bg: string) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    background: bg,
    border: `1px solid ${color}`,
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 500,
    color,
  }
}

// ---------------------------------------------------------------------------
// Main NLPromptBar
// ---------------------------------------------------------------------------

export function NLPromptBar({ teamId, onActivate, onCancel, variant = 'bottom-bar', onBackdropClick }: NLPromptBarProps) {
  const {
    state,
    preview,
    error,
    clarification,
    placeholder,
    charCount,
    submit,
    cancel,
    selectClarificationOption,
    clearError,
    showProgressive,
  } = useNLToCanvas(teamId)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // Cmd+K / Ctrl+K focuses the prompt bar from anywhere
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Escape cancels / closes preview
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && state !== 'default') {
        cancel()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state, cancel, onCancel])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const value = inputRef.current?.value ?? ''
      if (!value.trim()) return
      submit(value.trim(), [])
    },
    [submit]
  )

  const handleActivate = useCallback(() => {
    if (preview) {
      onActivate(preview)
    }
  }, [preview, onActivate])

  const isActive = state !== 'default'
  const isSubmitting = (state as string) === 'submitting'
  const isPreview = (state as string) === 'preview'

  const borderColor =
    state === 'error' ? '#ef4444' : isActive ? '#5B4FE9' : '#e5e5e3'
  const boxShadow =
    state === 'error'
      ? '0 0 0 3px rgba(239,68,68,0.15), 0 4px 16px rgba(0,0,0,0.10)'
      : isActive
      ? '0 0 0 3px rgba(91,79,233,0.15), 0 4px 16px rgba(0,0,0,0.10)'
      : '0 4px 16px rgba(0,0,0,0.10)'

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Preview card / progressive loading — rendered outside the form */}
      {(state === 'preview' || state === 'error') && (
        <>
          {state === 'error' && error ? (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 12px)',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 340,
                background: '#ffffff',
                border: '1px solid #fee2e2',
                borderLeft: '4px solid #ef4444',
                borderRadius: 12,
                padding: '16px 20px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 200,
                animation: 'slideUp 200ms ease-out',
                color: '#991b1b',
                fontSize: 14,
              }}
            >
              {error}
            </div>
          ) : (
            <PreviewCard
              preview={preview}
              confidence={preview?.confidence ?? 0}
              clarification={clarification}
              onActivate={handleActivate}
              onCancel={cancel}
              onClarificationSelect={goal => selectClarificationOption(goal, [])}
            />
          )}
        </>
      )}

      {/* Progressive loading — shown after 15s while still submitting */}
      {state === 'submitting' && showProgressive && (
        <ProgressiveLoadingCard onCancel={cancel} />
      )}

      {/* Backdrop — command palette only */}
      {variant === 'command-palette' && (
        <div
          onClick={onBackdropClick}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 150,
            animation: 'fadeIn 150ms ease-out',
          }}
        />
      )}

      {/* Prompt bar */}
      <div
        ref={barRef}
        style={
          variant === 'command-palette'
            ? {
                position: 'fixed',
                top: '20vh',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 640,
                maxWidth: '90vw',
                zIndex: 200,
              }
            : {
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 560,
                maxWidth: '90vw',
                zIndex: 100,
              }
        }
      >
        <form
          onSubmit={handleSubmit}
          style={{
            background: '#ffffff',
            border: `2px solid ${borderColor}`,
            borderRadius: 9999,
            padding: '4px 4px 4px 20px',
            boxShadow,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          {/* Sparkle icon */}
          <span
            style={{
              fontSize: 18,
              color: '#5B4FE9',
              flexShrink: 0,
              animation: state === 'submitting' ? 'spin 1s linear infinite' : 'sparkle 2s ease-in-out infinite',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ✦
          </span>

          {/* Input */}
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={placeholder}
            disabled={state === 'submitting' || state === 'preview'}
            onChange={e => {
              // Auto-resize
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
              setCharCountInHook(e.target.value.length)
            }}
            onFocus={() => {}}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const val = (e.target as HTMLTextAreaElement).value.trim()
                if (val) submit(val, [])
              }
              if (e.key === 'Escape') {
                cancel()
                onCancel()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 15,
              color: '#1c1c1a',
              background: 'transparent',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              maxHeight: 120,
              overflowY: 'auto',
              padding: '6px 0',
            }}
          />

          {/* Char count + submit */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {state === 'submitting' ? (
              <span style={{ fontSize: 12, color: '#6b6b68', padding: '0 4px' }}>
                Interpreting…
              </span>
            ) : (
              <span
                style={{
                  fontSize: 12,
                  color: charCount > 450 ? '#f59e0b' : '#a3a3a0',
                  padding: '0 4px',
                  minWidth: 36,
                  textAlign: 'right',
                }}
              >
                {charCount}/500
              </span>
            )}

            {state === 'submitting' ? (
              <button
                type="button"
                onClick={cancel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  background: '#f5f5f3',
                  border: '1px solid #e5e5e3',
                  borderRadius: 9999,
                  cursor: 'pointer',
                  color: '#6b6b68',
                  flexShrink: 0,
                }}
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || isPreview}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  background: '#5B4FE9',
                  border: 'none',
                  borderRadius: 9999,
                  cursor: isSubmitting || isPreview ? 'not-allowed' : 'pointer',
                  color: '#ffffff',
                  flexShrink: 0,
                  opacity: isSubmitting || isPreview ? 0.6 : 1,
                }}
                aria-label="Submit"
              >
                ↵
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setCharCountInHook(_len: number) {
  // charCount is managed inside the hook via submit()
  // This function is kept for clarity but does nothing —
  // the hook tracks charCount via the submit call, not via this callback.
}

// Re-export types for convenience
export type { NLToCanvasResult, CanvasAgent }
