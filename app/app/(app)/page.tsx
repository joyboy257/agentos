'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  status: string
  lastRunAt: string | null
  runCountToday: number
  escalatedCountToday: number
  budgetUsedPercent: number
}

interface RecentRun {
  id: string
  agentName: string
  status: string
  summary: string
  startedAt: string | null
}

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load dashboard data in parallel
    Promise.all([
      fetch('/api/agents').then(r => r.json()).catch(() => ({ agents: [] })),
      fetch('/api/activity?limit=5').then(r => r.json()).catch(() => ({ runs: [] })),
    ]).then(([agentsData, activityData]) => {
      setAgents(agentsData.agents ?? [])
      setRecentRuns(activityData.runs ?? [])
      setLoading(false)
    })
  }, [])

  const statusColors: Record<string, string> = {
    running: '#22c55e',
    idle: '#a3a3a0',
    stopped: '#a3a3a0',
    scheduled: '#f59e0b',
    error: '#ef4444',
    waiting: '#60a5fa',
    paused_budget: '#f59e0b',
  }

  const statusLabels: Record<string, string> = {
    running: 'Running',
    idle: 'Idle',
    stopped: 'Stopped',
    scheduled: 'Scheduled',
    error: 'Error',
    waiting: 'Waiting for input',
    paused_budget: 'Budget exceeded',
  }

  const activeCount = agents.filter(a => a.status === 'running').length
  const idleCount = agents.filter(a => a.status === 'idle').length
  const escalatedToday = agents.reduce((acc, a) => acc + (a.escalatedCountToday ?? 0), 0)

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--ui-bg)',
        minHeight: '100vh',
      }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        style={{
          padding: '32px 40px 24px',
          borderBottom: '1px solid var(--ui-border)',
          background: 'var(--ui-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1
              style={{
                fontFamily: "'IBM Plex Serif', Georgia, serif",
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--ui-text)',
                letterSpacing: '-0.02em',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Good morning, Maria.
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 15,
                color: 'var(--ui-text-secondary)',
              }}
            >
              Here's what your agents are up to today.
            </p>
          </div>
          <Link
            href="/canvas"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: 'var(--ui-accent)',
              color: '#fff',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(91, 79, 233, 0.3)',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--ui-accent-hover)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(91, 79, 233, 0.4)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--ui-accent)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(91, 79, 233, 0.3)'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="5.5" height="5.5" rx="1.25" />
              <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.25" />
              <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.25" />
              <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.25" />
            </svg>
            Open Canvas
          </Link>
        </div>

        {/* Stats row */}
        {loading ? (
          <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 72, flex: 1, borderRadius: 12, background: 'var(--ui-bg)' }} className="skeleton" />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
            <StatCard label="Active agents" value={String(activeCount)} accent="#22c55e" />
            <StatCard label="Idle" value={String(idleCount)} accent="#a3a3a0" />
            <StatCard label="Escalations today" value={String(escalatedToday)} accent="#f59e0b" />
            <StatCard label="Total agents" value={String(agents.length)} accent="var(--ui-accent)" />
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* Agents grid */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2
              style={{
                fontFamily: "'IBM Plex Serif', Georgia, serif",
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--ui-text)',
                margin: 0,
              }}
            >
              Your agents
            </h2>
            <Link
              href="/canvas"
              style={{
                fontSize: 13,
                color: 'var(--ui-accent)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Manage in Canvas →
            </Link>
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 120, borderRadius: 12 }} className="skeleton" />)}
            </div>
          ) : agents.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '48px 0',
                gap: 12,
                background: 'var(--ui-surface)',
                borderRadius: 16,
                border: '1px solid var(--ui-border)',
              }}
            >
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="12" fill="var(--ui-bg)" />
                <path d="M20 10L28 26H12L20 10Z" stroke="var(--ui-text-tertiary)" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              </svg>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>No agents yet</p>
              <p style={{ fontSize: 13, color: 'var(--ui-text-secondary)', margin: 0 }}>
                Go to Canvas to create your first AI employee
              </p>
              <Link
                href="/canvas"
                style={{
                  marginTop: 8,
                  padding: '8px 18px',
                  background: 'var(--ui-accent)',
                  color: '#fff',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Open Canvas
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  statusColor={statusColors[agent.status] ?? statusColors.idle}
                  statusLabel={statusLabels[agent.status] ?? 'Unknown'}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2
              style={{
                fontFamily: "'IBM Plex Serif', Georgia, serif",
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--ui-text)',
                margin: 0,
              }}
            >
              Recent runs
            </h2>
            <Link
              href="/activity"
              style={{
                fontSize: 13,
                color: 'var(--ui-accent)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              View all activity →
            </Link>
          </div>

          {recentRuns.length === 0 ? (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                background: 'var(--ui-surface)',
                borderRadius: 12,
                border: '1px solid var(--ui-border)',
                color: 'var(--ui-text-secondary)',
                fontSize: 14,
              }}
            >
              No runs yet. Your agents will appear here after their first run.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentRuns.map(run => (
                <RunRow key={run.id} run={run} statusColors={statusColors} />
              ))}
            </div>
          )}
        </section>
      </div>

      <style>{`
        .skeleton {
          background: linear-gradient(90deg, var(--ui-bg) 25%, #f0f0ec 50%, var(--ui-bg) 75%);
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '16px 20px',
        background: 'var(--ui-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 12,
        borderTop: `3px solid ${accent}`,
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--ui-text)',
          lineHeight: 1,
          fontFamily: "'IBM Plex Serif', Georgia, serif",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: 'var(--ui-text-secondary)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function AgentCard({ agent, statusColor, statusLabel }: { agent: Agent; statusColor: string; statusLabel: string }) {
  return (
    <div
      style={{
        padding: '18px 20px',
        background: 'var(--ui-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 12,
        transition: 'box-shadow 0.15s, transform 0.15s',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div
          style={{
            fontFamily: "'IBM Plex Serif', Georgia, serif",
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--ui-text)',
          }}
        >
          {agent.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              boxShadow: agent.status === 'running' ? `0 0 6px ${statusColor}` : 'none',
              animation: agent.status === 'running' ? 'pulseDot 2s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--ui-text-secondary)', fontWeight: 500 }}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ui-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Runs today</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ui-text)' }}>{agent.runCountToday}</div>
        </div>
        {(agent.escalatedCountToday ?? 0) > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--ui-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Escalated</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>{agent.escalatedCountToday}</div>
          </div>
        )}
        {agent.budgetUsedPercent > 0 && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--ui-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Budget</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 5, background: 'var(--ui-border)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(agent.budgetUsedPercent, 100)}%`,
                    height: '100%',
                    background: agent.budgetUsedPercent > 80 ? '#ef4444' : agent.budgetUsedPercent > 50 ? '#f59e0b' : '#22c55e',
                    borderRadius: 3,
                  }}
                />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ui-text-secondary)' }}>
                {agent.budgetUsedPercent}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RunRow({ run, statusColors }: { run: RecentRun; statusColors: Record<string, string> }) {
  const color = statusColors[run.status] ?? '#a3a3a0'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        background: 'var(--ui-surface)',
        border: '1px solid var(--ui-border)',
        borderRadius: 10,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ui-text)' }}>{run.agentName ?? 'Agent'}</div>
        <div style={{ fontSize: 12, color: 'var(--ui-text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {run.summary ?? '—'}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ui-text-tertiary)', flexShrink: 0 }}>
        {run.startedAt ? formatTimeAgo(run.startedAt) : '—'}
      </div>
    </div>
  )
}

function formatTimeAgo(date: string): string {
  const now = new Date()
  const d = new Date(date)
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}