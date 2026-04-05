'use client'

import { InfiniteCanvas } from '@/app/components/canvas/InfiniteCanvas'
import { ReasoningPanel } from '@/components/reasoning-panel'
import { PushNotificationBell } from '@/app/components/push-notification-bell'
import { NLPromptBar } from '@/app/components/canvas/NLPromptBar'
import { useState, useEffect } from 'react'
import type { NLToCanvasResult } from '@/app/hooks/useNLToCanvas'

export default function CanvasPage() {
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [reasoningPanelOpen, setReasoningPanelOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Main React Flow canvas */}
      <InfiniteCanvas />

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

      {/* Command palette — centered overlay, toggled by Cmd+K */}
      {paletteOpen && (
        <NLPromptBar
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
