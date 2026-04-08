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
    Ingest: { border: '#0ea5e9', bg: '#0a1a2a' },
    Process: { border: '#f59e0b', bg: '#1a1400' },
    Distill: { border: '#10b981', bg: '#0a1a14' },
    undefined: { border: '#7c3aed', bg: '#12121a' },
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
              stroke="#7c3aed"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            {/* Arrow */}
            <polygon
              points={`${x2 - 6},${y2 - 4} ${x2},${y2} ${x2 - 6},${y2 + 4}`}
              fill="#7c3aed"
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
              strokeWidth={1.5}
            />
            <text
              x={agent.x + nodeWidth / 2}
              y={agent.y + 22}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#e5e5e5"
            >
              {agent.name.length > 16 ? agent.name.slice(0, 14) + '…' : agent.name}
            </text>
            <text
              x={agent.x + nodeWidth / 2}
              y={agent.y + 40}
              textAnchor="middle"
              fontSize={10}
              fill="#6b6b7b"
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
        background: '#12121a',
        border: '1px solid #1e1e2e',
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        textAlign: 'center',
        zIndex: 200,
        animation: 'slideUp 200ms ease-out',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>
        <Loader2 size={28} color="#7c3aed" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5', marginBottom: 4, fontFamily: "'IBM Plex Serif', Georgia, serif" }}>
        Still working on it…
      </div>
      <div style={{ fontSize: 13, color: '#6b6b7b', marginBottom: 16 }}>
        Your goal is a bit complex. Still interpreting — this usually takes about 15–20 seconds.
      </div>
      <button
        onClick={onCancel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid #2e2e3e',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          color: '#6b6b7b',
          cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
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
          background: '#12121a',
          border: '1px solid #1e1e2e',
          borderLeft: '3px solid #7c3aed',
          borderRadius: 12,
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 200,
          animation: 'slideUp 200ms ease-out',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🤔</span>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#6b6b7b',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            marginBottom: 8,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          Not sure I understood
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5', marginBottom: 16, fontFamily: "'IBM Plex Serif', Georgia, serif" }}>
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
                background: '#1a1a24',
                border: '1px solid #2e2e3e',
                borderRadius: 8,
                fontSize: 14,
                color: '#e5e5e5',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'border-color 150ms, background 150ms',
              }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.borderColor = '#7c3aed'
                ;(e.target as HTMLElement).style.background = '#12121a'
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.borderColor = '#2e2e3e'
                ;(e.target as HTMLElement).style.background = '#1a1a24'
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
            border: '1px solid #2e2e3e',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: '#6b6b7b',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          Cancel
        </button>
      </div>
    )
  }

  if (!preview) return null

  // Governance required — show a governance-specific card instead of the normal preview
  if (preview.governance) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 460,
          maxWidth: '90vw',
          background: '#12121a',
          border: '1px solid #f59e0b',
          borderLeft: '4px solid #f59e0b',
          borderRadius: 12,
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 200,
          animation: 'slideUp 200ms ease-out',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(245,158,11,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fef3c7', fontFamily: "'IBM Plex Serif', Georgia, serif" }}>
              Needs your approval
            </div>
            <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>
              Added to Governance Board
            </div>
          </div>
        </div>

        {/* Explanation */}
        <div style={{
          fontSize: 13, color: '#a3a3a0', lineHeight: 1.6,
          marginBottom: 16, padding: '12px',
          background: 'rgba(245,158,11,0.07)', borderRadius: 8,
          borderLeft: '3px solid #f59e0b',
        }}>
          {preview.governance.explanation}
        </div>

        {/* New tools requiring approval */}
        {preview.governance.newTools.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6b7b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              New tools requiring approval
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {preview.governance.newTools.map(tool => (
                <span key={tool} style={{
                  fontSize: 11, fontFamily: 'ui-monospace, monospace',
                  background: 'rgba(245,158,11,0.1)', color: '#fcd34d',
                  border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
                  padding: '2px 8px',
                }}>
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action — go to Governance Board */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 18px',
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              color: '#f59e0b', cursor: 'pointer',
            }}
          >
            View in Governance Board
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520,
        maxWidth: '90vw',
        background: '#12121a',
        border: '1px solid #1e1e2e',
        borderLeft: '3px solid #7c3aed',
        borderRadius: 12,
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        zIndex: 200,
        animation: 'slideUp 200ms ease-out',
      }}
    >
      {/* Header */}
      <div style={{ fontSize: 16, fontWeight: 600, color: '#e5e5e5', marginBottom: 16, fontFamily: "'IBM Plex Serif', Georgia, serif" }}>
        I&apos;ll create a {preview.graph.agents[0]?.name ?? 'worker team'}
      </div>

      {/* Node + wire preview */}
      <div
        style={{
          background: '#0a0a0f',
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
          color: '#6b6b7b',
        }}
      >
        <span style={{ fontWeight: 500, fontFamily: 'JetBrains Mono, monospace' }}>Reads:</span>
        {preview.graph.agents
          .filter(a => a.archetype === 'Ingest')
          .flatMap(a => a.tools)
          .filter((t, i, arr) => arr.indexOf(t) === i)
          .map(t => (
            <span key={t} style={pillStyle('#0ea5e9', '#0a1a2a')}>{t}</span>
          ))}
      </div>

      <div
        style={{
          fontSize: 13,
          color: '#6b6b7b',
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
          color: '#a3a3a0',
          lineHeight: 1.5,
          padding: '12px',
          background: '#1a1a24',
          borderRadius: 8,
          marginBottom: 20,
          borderLeft: '3px solid #7c3aed',
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
            color: '#6b6b7b',
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
            background: 'transparent',
            border: '1px solid #2e2e3e',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            color: '#6b6b7b',
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
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
            background: '#7c3aed',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: '#ffffff',
            cursor: 'pointer',
            boxShadow: '0 0 20px rgba(124, 58, 237, 0.4)',
            fontFamily: 'JetBrains Mono, monospace',
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
    border: `1px solid ${color}50`,
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 500,
    color,
    fontFamily: 'JetBrains Mono, monospace',
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
    state === 'error' ? '#ef4444' : isActive ? '#7c3aed' : '#2e2e3e'
  const boxShadow =
    state === 'error'
      ? '0 0 0 3px rgba(239,68,68,0.15), 0 4px 16px rgba(0,0,0,0.4)'
      : isActive
      ? '0 0 0 3px rgba(124,58,237,0.2), 0 4px 16px rgba(0,0,0,0.4)'
      : '0 4px 16px rgba(0,0,0,0.3)'

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
        /* Placeholder text on dark background */
        #nl-prompt-input::placeholder {
          color: #3e3e4e;
          opacity: 1;
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
                background: '#12121a',
                border: '1px solid #ef4444',
                borderLeft: '4px solid #ef4444',
                borderRadius: 12,
                padding: '16px 20px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 200,
                animation: 'slideUp 200ms ease-out',
                color: '#f87171',
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
            background: '#12121a',
            border: `2px solid ${borderColor === '#ef4444' ? '#ef4444' : '#2e2e3e'}`,
            borderRadius: 9999,
            padding: '4px 4px 4px 20px',
            boxShadow,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          {/* Sparkle icon — Railway violet */}
          <span
            style={{
              fontSize: 18,
              color: '#7c3aed',
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
            id="nl-prompt-input"
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
              color: '#e5e5e5',
              background: 'transparent',
              fontFamily: "'IBM Plex Serif', Georgia, serif",
              lineHeight: 1.5,
              maxHeight: 120,
              overflowY: 'auto',
              padding: '6px 0',
            }}
          />

          {/* Char count + submit */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {state === 'submitting' ? (
              <span style={{ fontSize: 12, color: '#6b6b7b', padding: '0 4px', fontFamily: 'JetBrains Mono, monospace' }}>
                Interpreting…
              </span>
            ) : (
              <span
                style={{
                  fontSize: 12,
                  color: charCount > 450 ? '#f59e0b' : '#3e3e4e',
                  padding: '0 4px',
                  minWidth: 36,
                  textAlign: 'right',
                  fontFamily: 'JetBrains Mono, monospace',
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
                  background: '#1e1e2e',
                  border: '1px solid #2e2e3e',
                  borderRadius: 9999,
                  cursor: 'pointer',
                  color: '#6b6b7b',
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
                  background: '#7c3aed',
                  border: 'none',
                  borderRadius: 9999,
                  cursor: isSubmitting || isPreview ? 'not-allowed' : 'pointer',
                  color: '#ffffff',
                  flexShrink: 0,
                  boxShadow: '0 0 12px rgba(124, 58, 237, 0.4)',
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
