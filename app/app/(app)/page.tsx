'use client'

import { useState, useRef } from 'react'
import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent } from '@/lib/nl/types'
import { RunButton } from '@/components/run-button'
import { ApprovalModal } from '@/components/approval-modal'
import type { ApprovalRequiredEvent } from '@/lib/tracing/event-schema'
import type { ReasoningSnapshot } from '@/lib/tracing/event-buffer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveApproval {
  event: ApprovalRequiredEvent
  snapshot: ReasoningSnapshot | null
  summary: string
  suggestions: Array<{ id: string; proposal_headline: string; proposal_detail: string }>
}

// ---------------------------------------------------------------------------
// HomePage — integrated canvas + approval modal
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'bot', content: string}>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [assembledGraph, setAssembledGraph] = useState<AgentGraph | null>(null)
  const [agentStatuses, setAgentStatuses] = useState<Map<string, string>>(new Map())
  const [activeApprovals, setActiveApprovals] = useState<ActiveApproval[]>([])
  const [runId, setRunId] = useState<string | null>(null)

  // Store pending approval args for edit mode (keyed by toolCallId)
  const approvalArgsRef = useRef<Record<string, Record<string, unknown>>>({})

  // ---------------------------------------------------------------------------
  // SSE stream handler — manages full run lifecycle including approvals
  // ---------------------------------------------------------------------------

  const handleRunStart = async (graph: AgentGraph) => {
    setAgentStatuses(new Map())
    setActiveApprovals([])
    approvalArgsRef.current = {}

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      })

      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        let i = 0
        while (i < buffer.length) {
          if (buffer.slice(i, i + 7) !== 'event: ') break
          i += 7
          const nl = buffer.indexOf('\n', i)
          if (nl === -1) break
          const eventType = buffer.slice(i, nl).trim()
          i = nl + 1
          if (buffer.slice(i, i + 6) !== 'data: ') break
          i += 6
          const dataEnd = buffer.indexOf('\n\n', i)
          if (dataEnd === -1) break
          const rawData = buffer.slice(i, dataEnd)
          i = dataEnd + 2

          try {
            const data = JSON.parse(rawData)

            if (eventType === 'status') {
              const e = data as AgentStatusEvent
              setAgentStatuses(s => new Map(s).set(e.agentId, e.status))
            } else if (eventType === 'reasoning') {
              // Unit 5a: reasoning events including approval_required
              const e = data as { type: string }
              if (e.type === 'approval_required') {
                const approvalEvent = data as ApprovalRequiredEvent
                setRunId(approvalEvent.runId)
                const summary = approvalEvent.content.summary
                const snapshot: ReasoningSnapshot | null = null

                setActiveApprovals(prev => [
                  ...prev,
                  { event: approvalEvent, snapshot, summary, suggestions: [] },
                ])

                // Fetch suggestions for this run to show in the modal
                const currentRunId = approvalEvent.runId
                try {
                  const res = await fetch(`/api/escalation-suggestions?runId=${currentRunId}`)
                  if (res.ok) {
                    const data = await res.json()
                    setActiveApprovals(prev => prev.map(a =>
                      a.event.content.toolCallId === approvalEvent.content.toolCallId
                        ? { ...a, suggestions: data.suggestions ?? [] }
                        : a
                    ))
                  }
                } catch {
                  // Suggestions are best-effort; don't fail the approval flow
                }
              }
            } else if (eventType === 'done') {
              const e = data as RunDoneEvent
              setMessages(m => [...m, { role: 'bot', content: e.summary }])
              setAgentStatuses(new Map())
              setActiveApprovals([])
              setRunId(null)
              break
            } else if (eventType === 'error') {
              const e = data as RunErrorEvent
              setMessages(m => [...m, { role: 'bot', content: `Error: ${e.message}` }])
              setAgentStatuses(new Map())
              setActiveApprovals([])
              setRunId(null)
              break
            }
          } catch {
            // Malformed event — skip
          }
        }

        if (!buffer.includes('event: ')) break
        buffer = ''
      }
    } catch {
      setMessages(m => [...m, { role: 'bot', content: 'Something went wrong. Please try again.' }])
      setAgentStatuses(new Map())
      setActiveApprovals([])
      setRunId(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Goal submission
  // ---------------------------------------------------------------------------

  const handleGoalSubmit = async (goal: string) => {
    setMessages(m => [...m, { role: 'user', content: goal }])
    setIsLoading(true)

    try {
      const res = await fetch('/api/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      })
      const data = await res.json()

      if (data.error) {
        setMessages(m => [...m, { role: 'bot', content: data.message }])
      } else if (data.clarification) {
        setMessages(m => [...m, {
          role: 'bot',
          content: `${data.question}\n\n${data.options.map((o: any, i: number) => `${i+1}. ${o.label}`).join('\n')}`
        }])
      } else {
        setAssembledGraph(data)
        setMessages(m => [...m, {
          role: 'bot',
          content: `I'll set up a team for you: ${data.agents.map((a: any) => a.name).join(' → ')}`
        }])
      }
    } catch {
      setMessages(m => [...m, { role: 'bot', content: 'Something went wrong. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Approval resolution
  // ---------------------------------------------------------------------------

  const handleApprove = async (
    approvalId: string,
    toolCallId: string,
    revisedArgs?: Record<string, unknown>
  ) => {
    if (!runId) return

    try {
      await fetch(`/api/approvals/${approvalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          toolCallId,
          decision: revisedArgs ? 'edited' : 'approved',
          revisedArgs,
        }),
      })

      setActiveApprovals(prev => prev.filter(a => a.event.content.toolCallId !== toolCallId))
    } catch (err) {
      console.error('Failed to resolve approval:', err)
    }
  }

  const handleCancel = async (approvalId: string, toolCallId: string) => {
    if (!runId) return

    try {
      await fetch(`/api/approvals/${approvalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          toolCallId,
          decision: 'cancelled',
        }),
      })

      setActiveApprovals(prev => prev.filter(a => a.event.content.toolCallId !== toolCallId))
    } catch (err) {
      console.error('Failed to cancel approval:', err)
    }
  }

  const handleDismissApproval = (approvalId: string) => {
    setActiveApprovals(prev => prev.filter(a => a.event.content.toolCallId !== approvalId))
  }

  const handleSuggestionAccept = async (approvalToolCallId: string, suggestionId: string) => {
    if (!runId) return
    try {
      const res = await fetch('/api/escalation-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: suggestionId, action: 'accepted' }),
      })
      if (!res.ok) throw new Error('Failed to accept suggestion')
      setActiveApprovals(prev => prev.map(a =>
        a.event.content.toolCallId === approvalToolCallId
          ? { ...a, suggestions: a.suggestions.filter(s => s.id !== suggestionId) }
          : a
      ))
    } catch (err) {
      console.error('Failed to accept suggestion:', err)
    }
  }

  const handleSuggestionDismiss = async (approvalToolCallId: string, suggestionId: string) => {
    if (!runId) return
    try {
      const res = await fetch('/api/escalation-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: suggestionId, action: 'dismissed' }),
      })
      if (!res.ok) throw new Error('Failed to dismiss suggestion')
      setActiveApprovals(prev => prev.map(a =>
        a.event.content.toolCallId === approvalToolCallId
          ? { ...a, suggestions: a.suggestions.filter(s => s.id !== suggestionId) }
          : a
      ))
    } catch (err) {
      console.error('Failed to dismiss suggestion:', err)
    }
  }

  const handleRunDone = (e: RunDoneEvent) => {
    setMessages(m => [...m, { role: 'bot', content: e.summary }])
    setAgentStatuses(new Map())
    setAssembledGraph(null)
    setActiveApprovals([])
    setRunId(null)
  }

  const handleRunError = (e: RunErrorEvent) => {
    setMessages(m => [...m, { role: 'bot', content: `Error: ${e.message}` }])
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="app-container">
      <div className="chat-panel">
        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`message message-${m.role}`}>
              {m.content}
            </div>
          ))}
          {isLoading && <div className="message message-bot">Thinking...</div>}
        </div>
        <form onSubmit={(e) => {
          e.preventDefault()
          const input = (e.target as HTMLFormElement).elements.namedItem('goal') as HTMLInputElement
          if (input.value.trim()) {
            handleGoalSubmit(input.value.trim())
            input.value = ''
          }
        }} className="input-form">
          <input name="goal" placeholder="What would you like to do?" className="goal-input" />
          <button type="submit" disabled={isLoading}>Send</button>
        </form>
      </div>

      <div className="canvas-panel">
        {assembledGraph ? (
          <div className="graph-view">
            {assembledGraph.agents.map(agent => {
              const status = agentStatuses.get(agent.id) || 'pending'
              const isWaiting = status === 'waiting'
              return (
                <div key={agent.id} className={`agent-node agent-${agent.role}${isWaiting ? ' agent-waiting' : ''}`}>
                  <div className="agent-name">{agent.name}</div>
                  <div className="agent-status">
                    {isWaiting ? 'Awaiting approval...' : status}
                  </div>
                  {isWaiting && <div className="approval-badge">Awaiting your approval</div>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty-canvas">
            <p>Describe a goal to assemble your agent team</p>
          </div>
        )}
      </div>

      {assembledGraph && (
        <div className="run-button-container">
          <RunButton
            graph={assembledGraph}
            onRunStart={handleRunStart}
            onStatusUpdate={(e) => setAgentStatuses(s => new Map(s).set(e.agentId, e.status))}
            onRunDone={handleRunDone}
            onRunError={handleRunError}
          />
        </div>
      )}

      {/* Unit 5: Approval Modals — one per pending approval */}
      {activeApprovals.map((approval) => (
        <ApprovalModal
          key={approval.event.content.toolCallId}
          event={approval.event}
          snapshot={approval.snapshot}
          summary={approval.summary}
          initialArgs={approvalArgsRef.current[approval.event.content.toolCallId]}
          onApprove={(approvalId, toolCallId, revisedArgs) => {
            if (revisedArgs) {
              approvalArgsRef.current[toolCallId] = revisedArgs
            }
            handleApprove(approvalId, toolCallId, revisedArgs)
          }}
          onCancel={handleCancel}
          onDismiss={handleDismissApproval}
          suggestions={approval.suggestions}
          onSuggestionAccept={(id) => handleSuggestionAccept(approval.event.content.toolCallId, id)}
          onSuggestionDismiss={(id) => handleSuggestionDismiss(approval.event.content.toolCallId, id)}
        />
      ))}

      <style jsx>{`
        .app-container {
          display: flex;
          height: 100vh;
          overflow: hidden;
        }
        .chat-panel {
          width: 320px;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          background: var(--panel);
        }
        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }
        .message {
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 8px;
        }
        .message-user {
          background: var(--accent);
          color: white;
        }
        .message-bot {
          background: var(--border);
          color: var(--text-primary);
        }
        .input-form {
          padding: 16px;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
        }
        .goal-input {
          flex: 1;
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text-primary);
        }
        .canvas-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .graph-view {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          padding: 24px;
        }
        .agent-node {
          padding: 16px 24px;
          border-radius: 8px;
          border: 2px solid;
          transition: border-color 0.2s;
        }
        .agent-name {
          font-weight: 600;
        }
        .agent-status {
          font-size: 12px;
          margin-top: 4px;
          opacity: 0.7;
        }
        .agent-waiting {
          border-color: #f59e0b;
          background: #fffbeb;
        }
        .approval-badge {
          margin-top: 6px;
          font-size: 11px;
          color: #92400e;
          background: #fef3c7;
          padding: 2px 8px;
          border-radius: 999px;
          display: inline-block;
        }
        .empty-canvas {
          color: var(--text-muted);
        }
        .run-button-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 100;
        }
      `}</style>
    </div>
  )
}
