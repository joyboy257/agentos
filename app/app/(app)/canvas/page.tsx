'use client'

import Link from 'next/link'
import { InfiniteCanvas } from '@/app/components/canvas/InfiniteCanvas'
import { ReasoningPanel } from '@/components/reasoning-panel'
import { PushNotificationBell } from '@/app/components/push-notification-bell'
import { NLPromptBar as CommandPalettePromptBar } from '@/app/components/canvas/NLPromptBar'
import { NLPromptBar } from '@/components/nl-prompt-bar'
import { useCanvas } from '@/app/components/canvas/CanvasProvider'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { NLToCanvasResult } from '@/app/hooks/useNLToCanvas'

interface Canvas {
  id: string
  name: string
  domain: string | null
  is_default: boolean
}

const TEAM_STATUS_COLORS: Record<string, string> = {
  running: '#22c55e',
  completed: '#6b7280',
  blocked: '#f59e0b',
  failed: '#ef4444',
  created: '#6b7280',
}

function TeamStatusChip({ teamId }: { teamId: string }) {
  const [teamStatus, setTeamStatus] = useState<string>('created')
  const [teamName, setTeamName] = useState<string>('My Team')

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        setTeamStatus(data.team?.status ?? 'created')
        setTeamName(data.team?.name ?? 'My Team')
      } catch { /* ignore */ }
    }
    load()
    const interval = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [teamId])

  if (!teamId) return null
  const color = TEAM_STATUS_COLORS[teamStatus] ?? '#6b7280'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 8,
      background: '#1a1a18', border: '1px solid #2a2a2a',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color,
        animation: teamStatus === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
        {teamName}
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )
}

function CanvasPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { nodes, edges, teamId } = useCanvas()
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [reasoningPanelOpen, setReasoningPanelOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [canvases, setCanvases] = useState<Canvas[]>([])
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCanvasName, setNewCanvasName] = useState('')
  const currentCanvasId = searchParams.get('canvasId')

  // Load canvases list
  useEffect(() => {
    fetch('/api/canvases')
      .then(r => r.json())
      .then(data => setCanvases(data.canvases ?? []))
      .catch(() => {})
  }, [])

  const currentCanvas = canvases.find(c => c.id === currentCanvasId) ?? canvases.find(c => c.is_default) ?? canvases[0]

  // Cmd+K / Ctrl+K toggles the command palette
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Listen for run-started to capture runId and open-reasoning-panel to show the panel
  useEffect(() => {
    function handleRunStarted(e: Event) {
      setActiveRunId((e as CustomEvent<{ runId: string }>).detail.runId)
      setReasoningPanelOpen(true)
    }
    function handleOpenReasoningPanel() {
      setReasoningPanelOpen(true)
    }
    document.addEventListener('run-started', handleRunStarted)
    document.addEventListener('open-reasoning-panel', handleOpenReasoningPanel)
    return () => {
      document.removeEventListener('run-started', handleRunStarted)
      document.removeEventListener('open-reasoning-panel', handleOpenReasoningPanel)
    }
  }, [])

  const handlePaletteActivate = (result: NLToCanvasResult) => {
    // Wire the interpreted agents into the canvas via the InfiniteCanvas's hook
    const event = new CustomEvent('nl-palette-activate', { detail: result, bubbles: true })
    document.dispatchEvent(event)
    setPaletteOpen(false)
  }

  const handleSwitchCanvas = (canvasId: string) => {
    setSwitcherOpen(false)
    router.push(`/canvas?canvasId=${canvasId}`)
  }

  const handleCreateCanvas = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCanvasName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/canvases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCanvasName.trim() }),
      })
      const data = await res.json()
      if (data.canvas) {
        setCanvases(prev => [data.canvas, ...prev])
        setNewCanvasName('')
        setSwitcherOpen(false)
        router.push(`/canvas?canvasId=${data.canvas.id}`)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top-left: canvas switcher + nav */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 50, display: 'flex', gap: 8, alignItems: 'center' }}>

        {/* Canvas switcher */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSwitcherOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 8,
              background: '#1a1a18', color: '#ffffff',
              border: '1px solid #2a2a2a',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              minWidth: 160,
              justifyContent: 'space-between',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentCanvas?.name ?? 'Select Canvas'}
            </span>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 14, height: 14, flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Switcher dropdown */}
          {switcherOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: '#1a1a18', border: '1px solid #2a2a2a',
              borderRadius: 10, minWidth: 220, maxHeight: 320, overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {canvases.map(canvas => (
                <button
                  key={canvas.id}
                  onClick={() => handleSwitchCanvas(canvas.id)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 0,
                    background: canvas.id === currentCanvasId ? '#2a2a3a' : 'transparent',
                    border: 'none', color: '#fff', fontSize: 14,
                    textAlign: 'left', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#252535'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background =
                    canvas.id === currentCanvasId ? '#2a2a3a' : 'transparent'}
                >
                  <span>{canvas.name}</span>
                  {canvas.is_default && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1' }}>DEFAULT</span>
                  )}
                </button>
              ))}

              {/* Divider */}
              <div style={{ borderTop: '1px solid #2a2a2a', margin: '4px 0' }} />

              {/* Create new */}
              <form onSubmit={handleCreateCanvas} style={{ padding: '8px 14px' }}>
                <input
                  autoFocus
                  value={newCanvasName}
                  onChange={e => setNewCanvasName(e.target.value)}
                  placeholder="New canvas name..."
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 6,
                    background: '#0f0f0f', border: '1px solid #2a2a2a',
                    color: '#fff', fontSize: 13, outline: 'none', marginBottom: 8,
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="submit"
                  disabled={creating || !newCanvasName.trim()}
                  style={{
                    width: '100%', padding: '7px', borderRadius: 6,
                    background: '#6366f1', border: 'none',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: creating ? 'not-allowed' : 'pointer',
                    opacity: creating ? 0.6 : 1,
                  }}
                >
                  {creating ? 'Creating...' : '+ New Canvas'}
                </button>
              </form>

              {/* Divider */}
              <div style={{ borderTop: '1px solid #2a2a2a', margin: '4px 0' }} />

              <button
                onClick={() => { setSwitcherOpen(false); router.push('/portfolios') }}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 0,
                  background: 'transparent', border: 'none', color: '#9ca3af',
                  fontSize: 13, textAlign: 'left', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#252535'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
              >
                View All Canvases
              </button>
            </div>
          )}
        </div>

        {/* Team status chip — visible when a team is loaded */}
        <TeamStatusChip teamId={teamId ?? ''} />

        {/* Activity link */}
        <Link
          href="/activity"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            background: '#1a1a18', color: '#ffffff',
            textDecoration: 'none', fontSize: 14, fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Activity
        </Link>

        {/* HubSpot Connect */}
        <a
          href="/api/connectors/hubspot/authorize"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            background: '#ff7a59', color: '#ffffff',
            textDecoration: 'none', fontSize: 14, fontWeight: 600,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Connect HubSpot
        </a>
      </div>

      {/* Main React Flow canvas */}
      <InfiniteCanvas canvasId={currentCanvasId} />

      {/* Top-right controls: notifications bell + reasoning panel */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          width: 400,
          maxHeight: 'calc(100vh - 100px)',
        }}
      >
        <PushNotificationBell />
        <ReasoningPanel
          runId={activeRunId}
          isOpen={reasoningPanelOpen}
          onToggle={() => setReasoningPanelOpen((v) => !v)}
          maxHeight={600}
        />
      </div>

      {/* Top prompt bar — always visible when palette is closed */}
      {!paletteOpen && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 560,
            maxWidth: 'calc(100vw - 200px)',
            zIndex: 50,
          }}
        >
          <NLPromptBar
            teamId="team-1"
            existingNodes={nodes.map(n => ({
              id: n.id,
              name: n.data.name,
              role: n.data.role === 'Team Lead' ? 'team-lead' : 'worker',
              archetype: n.data.archetype,
              tools: n.data.tools ?? [],
              description: '',
              position_x: n.position.x,
              position_y: n.position.y,
            }))}
            existingEdges={edges.map(e => ({ source: e.source, target: e.target }))}
          />
        </div>
      )}

      {/* Command palette — centered overlay, toggled by Cmd+K */}
      {paletteOpen && (
        <CommandPalettePromptBar
          teamId="team-1"
          variant="command-palette"
          onActivate={handlePaletteActivate}
          onCancel={() => setPaletteOpen(false)}
          onBackdropClick={() => setPaletteOpen(false)}
        />
      )}
    </div>
  )
}

export default function CanvasPage() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }} />}>
      <CanvasPageContent />
    </Suspense>
  )
}
