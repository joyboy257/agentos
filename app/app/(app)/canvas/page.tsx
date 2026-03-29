'use client'

import { CanvasPanel } from '@/components/canvas-panel'
import { ChatPanel } from '@/components/chat-panel'
import { useState } from 'react'
import { Agent, Connection } from '@/lib/nl/types'

export default function CanvasPage() {
  const [assembledGraph, setAssembledGraph] = useState<{ agents: Agent[]; connections: Connection[] } | null>(null)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'bot'; content: string }>>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleGoalSubmit = (goal: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: goal }])
    setIsLoading(true)

    setTimeout(() => {
      const botMessage = `I've assembled your agent team for: "${goal}"

Based on your request, I've created a workflow with the following agents ready to work together.`

      setMessages((prev) => [...prev, { role: 'bot', content: botMessage }])

      // Create demo graph
      const demoGraph: { agents: Agent[]; connections: Connection[] } = {
        agents: [
          { id: 'reader-1', role: 'email_reader', tools: ['gmail'], name: 'Email Reader', description: 'Reads emails from inbox' },
          { id: 'drafter-1', role: 'response_drafter', tools: ['llm'], name: 'Response Drafter', description: 'Drafts response emails' },
          { id: 'sender-1', role: 'llm', tools: ['gmail'], name: 'Email Sender', description: 'Sends emails' },
        ],
        connections: [
          { from: 'reader-1', to: 'drafter-1' },
          { from: 'drafter-1', to: 'sender-1' },
        ],
      }
      setAssembledGraph(demoGraph)
      setIsLoading(false)
    }, 1500)
  }

  const handleTemplateSelect = (goal: string) => {
    handleGoalSubmit(goal)
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Floating chat bubble / input */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          zIndex: 100,
          width: '320px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ marginBottom: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Chat
          </div>
          <input
            type="text"
            placeholder="Describe your goal..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                handleGoalSubmit(e.currentTarget.value.trim())
                e.currentTarget.value = ''
              }
            }}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Full canvas */}
      <CanvasPanel
        assembledGraph={assembledGraph}
        onModeToggle={() => {}}
        mode="canvas"
      />
    </div>
  )
}
