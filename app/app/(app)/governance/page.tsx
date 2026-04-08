'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { GovernanceActionCard, type GovernanceActionData } from '@/app/components/governance-action-card'

type ActionStatus = 'pending' | 'approved' | 'denied'

interface GovernanceSection {
  status: ActionStatus
  label: string
  actions: GovernanceActionData[]
  loading: boolean
  error: string | null
}

const SECTIONS: { status: ActionStatus; label: string }[] = [
  { status: 'pending', label: 'Pending Review' },
  { status: 'approved', label: 'Approved' },
  { status: 'denied', label: 'Denied' },
]

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '40px 24px',
        background: '#f9fafb',
        borderRadius: 12,
        border: '2px dashed #e5e7eb',
      }}
    >
      <AlertTriangle size={28} style={{ color: '#d1d5db', margin: '0 auto 10px' }} />
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
        {message}
      </p>
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a1a18' }}>{label}</h2>
      {count > 0 && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#6b6b68',
            background: '#e5e5e3',
            borderRadius: 999,
            padding: '1px 8px',
          }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

export default function GovernancePage() {
  const [sections, setSections] = useState<Record<ActionStatus, GovernanceSection>>({
    pending: { status: 'pending', label: 'Pending Review', actions: [], loading: false, error: null },
    approved: { status: 'approved', label: 'Approved', actions: [], loading: false, error: null },
    denied: { status: 'denied', label: 'Denied', actions: [], loading: false, error: null },
  })
  const [activeTab, setActiveTab] = useState<ActionStatus>('pending')
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    fetchAllSections()
  }, [])

  async function fetchAllSections() {
    setInitialLoad(true)
    await Promise.allSettled([
      fetchSection('pending'),
      fetchSection('approved'),
      fetchSection('denied'),
    ])
    setInitialLoad(false)
  }

  async function fetchSection(status: ActionStatus) {
    setSections(prev => ({
      ...prev,
      [status]: { ...prev[status], loading: true, error: null },
    }))

    try {
      const res = await fetch(`/api/governance?status=${status}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSections(prev => ({
        ...prev,
        [status]: { ...prev[status], actions: data.actions ?? [], loading: false },
      }))
    } catch {
      setSections(prev => ({
        ...prev,
        [status]: { ...prev[status], error: 'Failed to load', loading: false },
      }))
    }
  }

  const handleResolve = useCallback(
    async (actionId: string, status: 'approved' | 'denied') => {
      const res = await fetch(`/api/governance/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to resolve')
      // Move action to the resolved section optimistically
      setSections(prev => {
        const source = status === 'approved' ? prev.pending : prev.pending
        const target = status === 'approved' ? 'approved' : 'denied'
        const action = source.actions.find(a => a.id === actionId)
        if (!action) return prev
        const resolved = { ...action, status, resolved_at: new Date().toISOString() }
        return {
          ...prev,
          pending: { ...prev.pending, actions: prev.pending.actions.filter(a => a.id !== actionId) },
          [target]: { ...prev[target], actions: [resolved, ...prev[target].actions] },
        }
      })
    },
    []
  )

  const currentSection = sections[activeTab]
  const pendingCount = sections.pending.actions.length

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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a18' }}>
              Governance Board
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b6b68' }}>
              Review and approve structural changes to your agent team
            </p>
          </div>
          {pendingCount > 0 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 99,
                background: '#fef3c7',
                border: '1px solid #f59e0b',
              }}
            >
              <Clock size={13} style={{ color: '#92400e' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                {pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}
              </span>
            </div>
          )}
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
          const count = sections[status].actions.length
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
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
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
            <p style={{ margin: 0, fontSize: 14, color: '#dc2626' }}>{currentSection.error}</p>
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
        ) : currentSection.actions.length === 0 ? (
          <EmptyState
            message={
              activeTab === 'pending'
                ? 'No pending changes. New agents and tools will appear here for review.'
                : activeTab === 'approved'
                ? 'No approved changes yet.'
                : 'No denied changes.'
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {currentSection.actions.map(action => (
              <GovernanceActionCard
                key={action.id}
                action={action}
                onResolve={handleResolve}
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
        borderRadius: 10,
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 11, width: '25%', borderRadius: 4 }} />
        </div>
      </div>
    </div>
  )
}
