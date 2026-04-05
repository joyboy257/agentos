'use client'

import { useState, useCallback, useRef } from 'react'
import type { AgentGraph, Connection } from '@/lib/nl/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasAgent {
  id: string
  name: string
  role: 'team-lead' | 'worker'
  archetype?: 'Ingest' | 'Process' | 'Distill'
  tools: string[]
  description?: string
  position_x: number
  position_y: number
}

export interface CanvasConnection {
  id?: string
  source: string
  target: string
  label?: string
}

export interface PreviewGraph {
  agents: CanvasAgent[]
  connections: CanvasConnection[]
}

export type PromptBarState =
  | 'default'
  | 'submitting'
  | 'preview'
  | 'error'

export interface NLToCanvasResult {
  graph: PreviewGraph
  explanation: string
  confidence: number
  ambiguousFields?: string[]
}

const PLACEHOLDERS = [
  "Hire a worker that follows up with leads who haven't replied in 7 days...",
  'Create a worker that reads my Gmail every morning and drafts follow-ups for emails I haven\'t replied...',
  'Set up a research agent that pulls weekly reports from my inbox...',
]

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNLToCanvas(teamId: string) {
  const [state, setState] = useState<PromptBarState>('default')
  const [preview, setPreview] = useState<NLToCanvasResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clarification, setClarification] = useState<{
    question: string
    options: { label: string; goal: string }[]
  } | null>(null)
  const [showProgressive, setShowProgressive] = useState(false)
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDERS.length))
  const [charCount, setCharCount] = useState(0)

  const abortControllerRef = useRef<AbortController | null>(null)
  const progressiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (progressiveTimerRef.current) clearTimeout(progressiveTimerRef.current)
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)
    progressiveTimerRef.current = null
    timeoutTimerRef.current = null
    setShowProgressive(false)
    setState('default')
    setPreview(null)
    setError(null)
    setClarification(null)
    setCharCount(0)
  }, [])

  const submit = useCallback(
    async (goal: string, existingNodes: CanvasAgent[] = []) => {
      if (!goal.trim()) return

      cancel()

      setState('submitting')
      setError(null)
      setClarification(null)
      setShowProgressive(false)
      setCharCount(goal.length)

      abortControllerRef.current = new AbortController()

      // Progressive loading card at 15s
      progressiveTimerRef.current = setTimeout(() => {
        setShowProgressive(true)
      }, 15_000)

      // Hard timeout at 30s
      timeoutTimerRef.current = setTimeout(() => {
        abortControllerRef.current?.abort()
        setShowProgressive(false)
        setError("That one was tricky. Try a shorter description or break it into smaller steps.")
        setState('error')
      }, 30_000)

      try {
        const res = await fetch('/api/canvas/nl-to-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, goal, existingNodes, existingEdges: [] }),
          signal: abortControllerRef.current.signal,
        })

        clearTimeout(progressiveTimerRef.current!)
        clearTimeout(timeoutTimerRef.current!)
        progressiveTimerRef.current = null
        timeoutTimerRef.current = null
        setShowProgressive(false)

        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Something went wrong. Please try again.')
          setState('error')
          return
        }

        const data = await res.json()

        if (data.needsClarification) {
          setClarification({ question: data.question, options: data.options ?? [] })
          setState('preview')
          setPreview(null)
          return
        }

        if (data.error) {
          setError(data.error)
          setState('error')
          return
        }

        // Convert interpret result to CanvasAgent format
        const canvasAgents: CanvasAgent[] = data.graph.agents.map(
          (a: {
            id: string
            name: string
            role: string
            tools: string[]
            description?: string
          }) => ({
            id: a.id,
            name: a.name,
            role: 'worker' as const,
            archetype: roleToArchetype(a.role),
            tools: a.tools,
            description: a.description,
            position_x: 0,
            position_y: 0,
          })
        )

        const canvasConnections: CanvasConnection[] = data.graph.connections.map(
          (c: { from: string; to: string }) => ({
            source: c.from,
            target: c.to,
          })
        )

        setPreview({
          graph: { agents: canvasAgents, connections: canvasConnections },
          explanation: data.explanation,
          confidence: data.confidence ?? 1,
          ambiguousFields: data.ambiguousFields,
        })
        setState('preview')
      } catch (err: unknown) {
        clearTimeout(progressiveTimerRef.current!)
        clearTimeout(timeoutTimerRef.current!)
        progressiveTimerRef.current = null
        timeoutTimerRef.current = null
        setShowProgressive(false)

        if (err instanceof Error && err.name === 'AbortError') {
          setState('default')
          return
        }
        setError('Something went wrong. Please try again.')
        setState('error')
      }
    },
    [teamId, cancel]
  )

  const selectClarificationOption = useCallback(
    (goal: string, existingNodes: CanvasAgent[]) => {
      setClarification(null)
      submit(goal, existingNodes)
    },
    [submit]
  )

  const clearError = useCallback(() => {
    setError(null)
    setState('default')
  }, [])

  return {
    state,
    preview,
    error,
    clarification,
    showProgressive,
    placeholder: PLACEHOLDERS[placeholderIdx],
    charCount,
    submit,
    cancel,
    selectClarificationOption,
    clearError,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleToArchetype(
  role: string
): 'Ingest' | 'Process' | 'Distill' | undefined {
  const ingestRoles = [
    'email_reader',
    'ticket_reader',
    'lead_researcher',
    'lead_enricher',
  ]
  const processRoles = [
    'response_drafter',
    'faq_responder',
    'escalation_triage',
  ]
  if (ingestRoles.includes(role)) return 'Ingest'
  if (processRoles.includes(role)) return 'Process'
  if (role === 'llm') return 'Distill'
  return undefined
}
