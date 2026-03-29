'use client'

import { useState } from 'react'
import { Send, Bot } from 'lucide-react'
import { ChatMessage } from './chat-message'

export function ChatPanel({
  onGoalSubmit,
  onTemplateSelect,
  messages,
  isLoading,
  assembledGraph,
}: ChatPanelProps) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    onGoalSubmit(input.trim())
    setInput('')
  }

  const handleTemplateClick = (goal: string) => {
    onTemplateSelect(goal)
  }

  return (
    <div
      style={{
        width: '380px',
        height: '100vh',
        backgroundColor: 'var(--panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Bot size={24} color="var(--accent)" />
        <span
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          AgentOS
        </span>
      </div>

      {/* Message history */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              marginTop: '60px',
            }}
          >
            <p style={{ marginBottom: '16px' }}>Describe your goal or choose a template</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => handleTemplateClick('Build a customer email agent workflow')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'var(--border)',
                  border: '1px solid var(--border-hover)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Customer Email Agent
              </button>
              <button
                onClick={() => handleTemplateClick('Build a lead research agent workflow')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'var(--border)',
                  border: '1px solid var(--border-hover)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Lead Research Agent
              </button>
              <button
                onClick={() => handleTemplateClick('Build a customer support agent workflow')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'var(--border)',
                  border: '1px solid var(--border-hover)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Customer Support Agent
              </button>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <ChatMessage key={index} role={message.role} content={message.content} />
        ))}

        {isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-muted)',
              padding: '12px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent)',
                animation: 'pulse 1s infinite',
              }}
            />
            Thinking...
          </div>
        )}

        {assembledGraph && !isLoading && messages.length > 0 && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: 'var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Assembled {assembledGraph.agents.length} agents
            </div>
            {assembledGraph.agents.map((agent) => (
              <div key={agent.id} style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                - {agent.name || agent.role.replace('_', ' ')}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '10px',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your goal..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px 14px',
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-hover)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          style={{
            padding: '10px',
            backgroundColor: input.trim() && !isLoading ? 'var(--accent)' : 'var(--border)',
            border: 'none',
            borderRadius: '8px',
            cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          <Send size={18} color={input.trim() && !isLoading ? '#fff' : 'var(--text-dim)'} />
        </button>
      </form>
    </div>
  )
}

import { AgentGraph } from '@/lib/nl/types'

export interface ChatPanelProps {
  onGoalSubmit: (goal: string) => void
  onTemplateSelect: (goal: string) => void
  messages: Array<{ role: 'user' | 'bot'; content: string }>
  isLoading?: boolean
  assembledGraph?: AgentGraph | null
}
