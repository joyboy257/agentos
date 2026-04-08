'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Canvas {
  id: string
  user_id: string
  name: string
  domain: string | null
  agents_json: string
  connections_json: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export default function PortfoliosPage() {
  const router = useRouter()
  const [canvases, setCanvases] = useState<Canvas[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetch('/api/canvases')
      .then(r => r.json())
      .then(data => {
        setCanvases(data.canvases ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/canvases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      if (data.canvas) {
        setCanvases(prev => [data.canvas, ...prev])
        setNewName('')
        setShowCreate(false)
        router.push(`/canvas?canvasId=${data.canvas.id}`)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (canvasId: string) => {
    if (!confirm('Delete this canvas? This cannot be undone.')) return
    await fetch(`/api/canvases/${canvasId}`, { method: 'DELETE' })
    setCanvases(prev => prev.filter(c => c.id !== canvasId))
  }

  const agentCount = (canvas: Canvas) => {
    try {
      return JSON.parse(canvas.agents_json).length
    } catch {
      return 0
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ui-bg)', color: 'var(--ui-text)', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto', marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, fontFamily: "'IBM Plex Serif', Georgia, serif", color: 'var(--ui-text)' }}>Canvases</h1>
            <p style={{ color: 'var(--ui-text-secondary)', margin: '8px 0 0', fontSize: 15 }}>
              Your AI teams, organized by domain
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10,
              background: '#6366f1', color: '#fff',
              border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Canvas
          </button>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <form onSubmit={handleCreate} style={{
            background: '#1a1a1a', borderRadius: 16, padding: 32,
            width: 440, border: '1px solid #2a2a2a',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px' }}>New Canvas</h2>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. HVAC Lead Team, Real Estate Research..."
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8,
                background: '#0f0f0f', border: '1px solid #2a2a2a',
                color: '#fff', fontSize: 15, outline: 'none', marginBottom: 24,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName('') }}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  background: 'transparent', border: '1px solid #2a2a2a',
                  color: '#9ca3af', fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  background: creating ? '#4f46e5' : '#6366f1',
                  border: 'none', color: '#fff', fontSize: 14,
                  fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? 'Creating...' : 'Create Canvas'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 60 }}>Loading...</div>
        ) : canvases.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            border: '2px dashed #2a2a2a', borderRadius: 16,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎨</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>No canvases yet</h2>
            <p style={{ color: '#6b7280', margin: '0 0 24px' }}>
              Create your first canvas to start building your AI team
            </p>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: '10px 24px', borderRadius: 8,
                background: '#6366f1', border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Create First Canvas
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}>
            {canvases.map(canvas => (
              <Link
                key={canvas.id}
                href={`/canvas?canvasId=${canvas.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  borderRadius: 16,
                  padding: 24,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#6366f1'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#2a2a2a'
                    ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#fff' }}>
                        {canvas.name}
                      </h3>
                      {canvas.domain && (
                        <p style={{ fontSize: 12, color: '#6366f1', margin: '4px 0 0', fontWeight: 500 }}>
                          {canvas.domain}
                        </p>
                      )}
                    </div>
                    {canvas.is_default && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px',
                        borderRadius: 100, background: '#6366f1', color: '#fff',
                      }}>
                        DEFAULT
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
                        {agentCount(canvas)}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>agents</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
                        {(() => {
                          try {
                            return JSON.parse(canvas.connections_json).length
                          } catch {
                            return 0
                          }
                        })()}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>connections</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#4b5563' }}>
                      Updated {new Date(canvas.updated_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDelete(canvas.id)
                      }}
                      style={{
                        padding: '6px 12px', borderRadius: 6,
                        background: 'transparent', border: '1px solid #2a2a2a',
                        color: '#6b7280', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Link>
            ))}

            {/* New Canvas card */}
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: 'transparent',
                border: '2px dashed #2a2a2a',
                borderRadius: 16,
                padding: 24,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                minHeight: 180,
                color: '#4b5563',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'
                ;(e.currentTarget as HTMLButtonElement).style.color = '#6366f1'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a'
                ;(e.currentTarget as HTMLButtonElement).style.color = '#4b5563'
              }}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 32, height: 32 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600 }}>New Canvas</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
