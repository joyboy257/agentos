'use client'

import { useState } from 'react'
import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent } from '@/lib/nl/types'
import { RunButton } from '@/components/run-button'

export default function HomePage() {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'bot', content: string}>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [assembledGraph, setAssembledGraph] = useState<AgentGraph | null>(null)
  const [agentStatuses, setAgentStatuses] = useState<Map<string, string>>(new Map())
  
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
    } catch (err) {
      setMessages(m => [...m, { role: 'bot', content: 'Something went wrong. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleStatusUpdate = (e: AgentStatusEvent) => {
    setAgentStatuses(s => new Map(s).set(e.agentId, e.status))
  }
  
  const handleRunDone = (e: RunDoneEvent) => {
    setMessages(m => [...m, { role: 'bot', content: e.summary }])
    setAgentStatuses(new Map())
    setAssembledGraph(null)
  }
  
  const handleRunError = (e: RunErrorEvent) => {
    setMessages(m => [...m, { role: 'bot', content: `Error: ${e.message}` }])
  }
  
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
            {assembledGraph.agents.map(agent => (
              <div key={agent.id} className={`agent-node agent-${agent.role}`}>
                <div className="agent-name">{agent.name}</div>
                <div className="agent-status">{agentStatuses.get(agent.id) || 'pending'}</div>
              </div>
            ))}
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
            onStatusUpdate={handleStatusUpdate}
            onRunDone={handleRunDone}
            onRunError={handleRunError}
          />
        </div>
      )}
      
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
        }
        .agent-name {
          font-weight: 600;
        }
        .agent-status {
          font-size: 12px;
          margin-top: 4px;
          opacity: 0.7;
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
