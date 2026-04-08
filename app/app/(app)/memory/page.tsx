'use client'

import { useState, useEffect } from 'react'
import { MemoryFactCard, type MemoryFactData } from '@/components/memory-fact-card'

type FactStatus = 'pending' | 'confirmed' | 'denied'

interface MemorySection {
  status: FactStatus
  label: string
  facts: MemoryFactData[]
  loading: boolean
  error: string | null
}

const SECTIONS: { status: FactStatus; label: string }[] = [
  { status: 'pending', label: 'Needs Review' },
  { status: 'confirmed', label: 'Confirmed Facts' },
  { status: 'denied', label: 'Denied Facts' },
]

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 200,
        gap: 8,
      }}
    >
      <svg
        className="w-10 h-10 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
      <p style={{ margin: 0, fontSize: 14, color: '#6b6b68', textAlign: 'center' }}>{message}</p>
    </div>
  )
}

export default function MemoryPage() {
  const [sections, setSections] = useState<Record<FactStatus, MemorySection>>({
    pending: { status: 'pending', label: 'Needs Review', facts: [], loading: false, error: null },
    confirmed: { status: 'confirmed', label: 'Confirmed Facts', facts: [], loading: false, error: null },
    denied: { status: 'denied', label: 'Denied Facts', facts: [], loading: false, error: null },
  })
  const [activeTab, setActiveTab] = useState<FactStatus>('pending')
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    fetchAllSections()
  }, [])

  async function fetchAllSections() {
    setInitialLoad(true)
    // Fetch all three statuses in parallel
    await Promise.allSettled([
      fetchSection('pending'),
      fetchSection('confirmed'),
      fetchSection('denied'),
    ])
    setInitialLoad(false)
  }

  async function fetchSection(status: FactStatus) {
    setSections(prev => ({
      ...prev,
      [status]: { ...prev[status], loading: true, error: null },
    }))

    try {
      const res = await fetch(`/api/memory/facts?status=${status}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSections(prev => ({
        ...prev,
        [status]: { ...prev[status], facts: data.facts ?? [], loading: false },
      }))
    } catch (err) {
      setSections(prev => ({
        ...prev,
        [status]: { ...prev[status], error: 'Failed to load facts', loading: false },
      }))
    }
  }

  async function handleConfirm(factId: string) {
    await fetch(`/api/memory/facts/${factId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm' }),
    })
    // Move from pending to confirmed
    setSections(prev => {
      const fact = prev.pending.facts.find(f => f.id === factId)
      if (!fact) return prev
      const updated = { ...fact, confirmed_at: new Date().toISOString() }
      return {
        ...prev,
        pending: { ...prev.pending, facts: prev.pending.facts.filter(f => f.id !== factId) },
        confirmed: { ...prev.confirmed, facts: [updated, ...prev.confirmed.facts] },
      }
    })
  }

  async function handleDeny(factId: string) {
    await fetch(`/api/memory/facts/${factId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deny' }),
    })
    // Move from pending to denied
    setSections(prev => {
      const fact = prev.pending.facts.find(f => f.id === factId)
      if (!fact) return prev
      const updated = { ...fact, denied_at: new Date().toISOString() }
      return {
        ...prev,
        pending: { ...prev.pending, facts: prev.pending.facts.filter(f => f.id !== factId) },
        denied: { ...prev.denied, facts: [updated, ...prev.denied.facts] },
      }
    })
  }

  const currentSection = sections[activeTab]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--ui-bg)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '24px 32px 16px',
          borderBottom: '1px solid #e5e5e3',
          background: '#ffffff',
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a18' }}>
            Memory
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b6b68' }}>
            Facts your agent has learned about you
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e5e5e3',
          background: '#ffffff',
          padding: '0 32px',
        }}
      >
        {SECTIONS.map(({ status, label }) => {
          const count = sections[status].facts.length
          return (
            <button
              key={status}
              onClick={() => setActiveTab(status)}
              style={{
                padding: '10px 20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                background: activeTab === status ? '#ffffff' : 'transparent',
                color: activeTab === status ? '#1a1a18' : '#6b6b68',
                borderBottom:
                  activeTab === status ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              {label}
              {count > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    background: status === 'pending' ? '#6366f1' : '#e5e5e3',
                    color: status === 'pending' ? '#fff' : '#6b6b68',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 7px',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {currentSection.loading && initialLoad ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : currentSection.error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              gap: 8,
            }}
          >
            <p style={{ margin: 0, fontSize: 14, color: '#dc2626' }}>
              {currentSection.error}
            </p>
            <button
              onClick={() => fetchSection(activeTab)}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid #e5e5e3',
                background: '#ffffff',
                fontSize: 13,
                cursor: 'pointer',
                color: '#1a1a18',
              }}
            >
              Retry
            </button>
          </div>
        ) : currentSection.facts.length === 0 ? (
          <EmptyState
            message={
              activeTab === 'pending'
                ? 'No pending facts to review. Confirmed facts will appear here as your agent learns.'
                : activeTab === 'confirmed'
                ? 'No confirmed facts yet. Review pending facts to confirm them.'
                : 'No denied facts.'
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {currentSection.facts.map(fact => (
              <MemoryFactCard
                key={fact.id}
                fact={fact}
                onConfirm={handleConfirm}
                onDeny={handleDeny}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        .skeleton {
          background: linear-gradient(90deg, var(--ui-bg) 25%, var(--ui-border) 50%, var(--ui-bg) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e5e3',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 16, width: '50%', marginBottom: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 12, width: '30%', borderRadius: 4 }} />
        </div>
        <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 999 }} />
      </div>
    </div>
  )
}
