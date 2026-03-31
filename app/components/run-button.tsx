'use client'

import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent } from '@/lib/nl/types'

interface RunButtonProps {
  graph: AgentGraph
  /** Called when the run button is clicked, before SSE starts */
  onRunStart?: (graph: AgentGraph) => void
  onStatusUpdate: (event: AgentStatusEvent) => void
  onRunDone: (event: RunDoneEvent) => void
  onRunError: (event: RunErrorEvent) => void
}

export function RunButton({ graph, onRunStart, onStatusUpdate, onRunDone, onRunError }: RunButtonProps) {
  const [running, setRunning] = useState(false)

  const handleRun = async () => {
    if (running) return
    setRunning(true)

    onRunStart?.(graph)

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      let buffer = ''

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process SSE events: lines of "event: TYPE" followed by "data: JSON"
        let i = 0
        while (i < buffer.length) {
          if (buffer.slice(i, i + 7) !== 'event: ') break
          i += 7
          const nl = buffer.indexOf('\n', i)
          if (nl === -1) break
          const eventType = buffer.slice(i, nl)
          i = nl + 1
          if (buffer.slice(i, i + 6) !== 'data: ') break
          i += 6
          const dataEnd = buffer.indexOf('\n\n', i)
          if (dataEnd === -1) break
          const data = JSON.parse(buffer.slice(i, dataEnd))
          i = dataEnd + 2
          if (eventType === 'status') onStatusUpdate(data as AgentStatusEvent)
          else if (eventType === 'done') { onRunDone(data as RunDoneEvent); setRunning(false) }
          else if (eventType === 'error') { onRunError(data as RunErrorEvent); setRunning(false) }
        }
        buffer = buffer.slice(i)
      }
    } catch (err) {
      console.error('Run error:', err)
      setRunning(false)
    }
  }

  return (
    <button
      onClick={handleRun}
      disabled={running || !graph.agents.length}
      className="run-button"
    >
      {running ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
      {running ? 'Running...' : 'Run'}
    </button>
  )
}
