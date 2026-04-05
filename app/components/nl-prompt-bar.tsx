'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { CanvasAgent, CanvasConnection, NLToCanvasResult } from '@/app/hooks/useNLToCanvas'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PromptBarStatus = 'idle' | 'loading' | 'preview' | 'clarification' | 'error'

interface ClarificationOption {
  label: string
  goal: string
}

interface NLToCanvasResponse {
  graph?: {
    agents: Array<{
      id: string
      name: string
      role: string
      tools: string[]
      description?: string
    }>
    connections: Array<{ from: string; to: string }>
  }
  explanation: string
  confidence: number
  needsClarification?: boolean
  question?: string
  options?: ClarificationOption[]
  error?: string
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Animated loading dots */
function LoadingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'nlDotBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  )
}

/** Read-only preview card — Phase 1.1 shows "Coming soon" badge, no Activate */
function PreviewCard({
  goal,
  result,
  clarification,
  onClarificationSelect,
  onDismiss,
}: {
  goal: string
  result: NLToCanvasResult
  clarification: { question: string; options: ClarificationOption[] } | null
  onClarificationSelect: (goal: string) => void
  onDismiss: () => void
}) {
  const { graph } = result

  if (clarification) {
    return (
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span style={iconStyle}>🤔</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Need clarification
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
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
                padding: '10px 14px',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.background = 'var(--border)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.background = 'var(--panel)'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={onDismiss}
          style={cancelButtonStyle}
        >
          Cancel
        </button>
      </div>
    )
  }

  const agents = graph.agents

  return (
    <div style={cardStyle}>
      {/* Goal text */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        Your goal
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 20, lineHeight: 1.5 }}>
        &ldquo;{goal}&rdquo;
      </div>

      {/* Agent list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {agents.map(agent => (
          <div key={agent.id} style={agentRowStyle}>
            {/* Agent icon */}
            <div style={{
              ...archetypeIconStyle,
              background: archetypeBg(agent.archetype),
              border: `1px solid ${archetypeColor(agent.archetype)}`,
              color: archetypeColor(agent.archetype),
            }}>
              {archetypeEmoji(agent.archetype)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Agent name + role badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {agent.name}
                </span>
                {agent.archetype && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '1px 7px',
                    background: `${archetypeColor(agent.archetype)}18`,
                    border: `1px solid ${archetypeColor(agent.archetype)}40`,
                    borderRadius: 9999,
                    fontSize: 10,
                    fontWeight: 600,
                    color: archetypeColor(agent.archetype),
                  }}>
                    {agent.archetype}
                  </span>
                )}
              </div>

              {/* Tools */}
              {agent.tools.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {agent.tools.map(tool => (
                    <span key={tool} style={toolBadgeStyle}>
                      {tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Explanation */}
      {result.explanation && (
        <div style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          padding: '10px 12px',
          background: 'var(--bg)',
          borderRadius: 8,
          marginBottom: 20,
          borderLeft: '3px solid var(--accent)',
        }}>
          {result.explanation}
        </div>
      )}

      {/* Coming soon badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          background: '#f59e0b18',
          border: '1px solid #f59e0b40',
          borderRadius: 9999,
          fontSize: 12,
          fontWeight: 600,
          color: '#f59e0b',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          Coming soon
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Preview only — activation coming in Phase 1.2
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARCHETYPE_META: Record<string, { color: string; bg: string; emoji: string }> = {
  Ingest: { color: '#3b82f6', bg: '#3b82f618', emoji: '📥' },
  Process: { color: '#f59e0b', bg: '#f59e0b18', emoji: '⚙️' },
  Distill: { color: '#22c55e', bg: '#22c55e18', emoji: '✨' },
}

function archetypeColor(archetype?: string) {
  return ARCHETYPE_META[archetype ?? '']?.color ?? 'var(--accent)'
}

function archetypeBg(archetype?: string) {
  return ARCHETYPE_META[archetype ?? '']?.bg ?? '#a78bfa18'
}

function archetypeEmoji(archetype?: string) {
  return ARCHETYPE_META[archetype ?? '']?.emoji ?? '🤖'
}

const cardStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 12px)',
  left: 0,
  right: 0,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '20px 24px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  zIndex: 100,
  animation: 'slideDown 200ms ease-out',
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 12,
}

const iconStyle: React.CSSProperties = { fontSize: 20, lineHeight: 1 }

const archetypeIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  flexShrink: 0,
}

const agentRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
}

const toolBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  background: 'var(--border)',
  border: '1px solid var(--border-hover)',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--text-muted)',
}

const cancelButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

// ---------------------------------------------------------------------------
// Main nl-prompt-bar
// ---------------------------------------------------------------------------

export interface NLPromptBarProps {
  /** Fixed teamId for now */
  teamId: string
  /** Canvas nodes to pass as context to the NL API */
  existingNodes: CanvasAgent[]
  /** Canvas edges to pass as context to the NL API */
  existingEdges: CanvasConnection[]
}

export function NLPromptBar({ teamId, existingNodes, existingEdges }: NLPromptBarProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<PromptBarStatus>('idle')
  const [preview, setPreview] = useState<NLToCanvasResult | null>(null)
  const [clarification, setClarification] = useState<{ question: string; options: ClarificationOption[] } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Clear debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      abortRef.current?.abort()
    }
  }, [debounceTimer])

  const submit = useCallback(
    async (goal: string) => {
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      setStatus('loading')
      setErrorMsg(null)
      setClarification(null)
      setPreview(null)

      try {
        const res = await fetch('/api/canvas/nl-to-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, goal, existingNodes, existingEdges }),
          signal: abortRef.current.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
          setStatus('error')
          return
        }

        const data: NLToCanvasResponse = await res.json()

        if (data.needsClarification) {
          setClarification({ question: data.question ?? '', options: data.options ?? [] })
          setStatus('clarification')
          return
        }

        if (data.error || !data.graph) {
          setErrorMsg(data.error ?? 'Could not interpret that goal. Try rephrasing.')
          setStatus('error')
          return
        }

        // Convert API agents to CanvasAgent format
        const canvasAgents: CanvasAgent[] = data.graph.agents.map(a => ({
          id: a.id,
          name: a.name,
          role: 'worker' as const,
          archetype: roleToArchetype(a.role),
          tools: a.tools,
          description: a.description,
          position_x: 0,
          position_y: 0,
        }))

        const canvasConnections: CanvasConnection[] = data.graph.connections.map(c => ({
          source: c.from,
          target: c.to,
        }))

        setPreview({
          graph: { agents: canvasAgents, connections: canvasConnections },
          explanation: data.explanation,
          confidence: data.confidence ?? 1,
        })
        setStatus('preview')
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          setStatus('idle')
          return
        }
        setErrorMsg('Something went wrong. Please try again.')
        setStatus('error')
      }
    },
    [teamId, existingNodes, existingEdges]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)

      if (status !== 'idle') {
        setStatus('idle')
        setPreview(null)
        setClarification(null)
        setErrorMsg(null)
        abortRef.current?.abort()
      }

      if (debounceTimer) clearTimeout(debounceTimer)

      if (!value.trim()) return

      const timer = setTimeout(() => {
        submit(value.trim())
      }, 500)

      setDebounceTimer(timer)
    },
    [status, debounceTimer, submit]
  )

  const handleClarificationSelect = useCallback(
    (goal: string) => {
      setClarification(null)
      submit(goal)
    },
    [submit]
  )

  const handleDismiss = useCallback(() => {
    setStatus('idle')
    setPreview(null)
    setClarification(null)
    setErrorMsg(null)
    setQuery('')
    abortRef.current?.abort()
    inputRef.current?.focus()
  }, [])

  const showCard = status === 'preview' || status === 'clarification' || status === 'error'
  const isLoading = status === 'loading'

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nlDotBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>

      <div style={{ position: 'relative', width: '100%' }}>
        {/* Prompt bar input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: 'var(--panel)',
            border: `1.5px solid ${status === 'error' ? '#ef4444' : 'var(--border)'}`,
            borderRadius: 12,
            boxShadow: status === 'error'
              ? '0 0 0 3px rgba(239,68,68,0.15)'
              : '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          {/* Sparkle icon */}
          <span style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0, lineHeight: 1 }}>
            ✦
          </span>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder="What do you want your team to do?"
            disabled={isLoading || status === 'preview'}
            onKeyDown={e => {
              if (e.key === 'Escape' && showCard) {
                handleDismiss()
              }
            }}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          />

          {/* Right-side status */}
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Analyzing your goal <LoadingDots />
              </span>
            </div>
          ) : status === 'preview' || status === 'clarification' ? (
            <button
              onClick={handleDismiss}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Clear
            </button>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
              Type to preview
            </span>
          )}
        </div>

        {/* Error message */}
        {status === 'error' && errorMsg && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              right: 0,
              padding: '10px 14px',
              background: '#ef444415',
              border: '1px solid #ef444440',
              borderRadius: 8,
              fontSize: 13,
              color: '#ef4444',
              zIndex: 100,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Preview / clarification card */}
        {showCard && status === 'preview' && preview && !clarification && (
          <PreviewCard
            goal={query}
            result={preview}
            clarification={null}
            onClarificationSelect={handleClarificationSelect}
            onDismiss={handleDismiss}
          />
        )}

        {showCard && status === 'clarification' && clarification && (
          <PreviewCard
            goal={query}
            result={{ graph: { agents: [], connections: [] }, explanation: '', confidence: 0 }}
            clarification={clarification}
            onClarificationSelect={handleClarificationSelect}
            onDismiss={handleDismiss}
          />
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleToArchetype(role: string): 'Ingest' | 'Process' | 'Distill' | undefined {
  const ingestRoles = ['email_reader', 'ticket_reader', 'lead_researcher', 'lead_enricher']
  const processRoles = ['response_drafter', 'faq_responder', 'escalation_triage']
  if (ingestRoles.includes(role)) return 'Ingest'
  if (processRoles.includes(role)) return 'Process'
  if (role === 'llm') return 'Distill'
  return undefined
}
