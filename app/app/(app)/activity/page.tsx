'use client';

import { useState, useEffect } from 'react';
import { TimelineItem } from '@/components/activity-log/timeline-item';
import { TimelineFiltersBar, type TimelineFilters } from '@/components/activity-log/timeline-filters';
import type { ReasoningEvent } from '@/lib/tracing/event-schema';
import { MemoryFactCard, type MemoryFactData } from '@/components/memory-fact-card';

interface RunWithAgent {
  id: string;
  agent_id: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  result: string | null;
  agent_name?: string;
}

interface ReasoningTrace {
  id: string;
  run_id: string;
  agent_id: string;
  events: ReasoningEvent[];
  flagged: boolean;
  created_at: Date;
  expires_at: Date;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  completed: { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  failed: { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
  waiting_for_approval: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' },
  running: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  scheduled: { bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-400' },
  paused: { bg: 'bg-gray-100', text: 'text-gray-800', dot: 'bg-gray-400' },
};

function formatDuration(startedAt: Date | null, completedAt: Date | null, status: string): string {
  if (status === 'running') return 'In progress';
  if (!startedAt) return '—';
  const end = completedAt ? new Date(completedAt) : new Date();
  const diffMs = end.getTime() - new Date(startedAt).getTime();
  if (diffMs < 0) return '—';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function SlideOver({ run, onClose }: { run: RunWithAgent | null; onClose: () => void }) {
  const [trace, setTrace] = useState<ReasoningTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'result'>('events');

  useEffect(() => {
    if (!run) return;
    setTrace(null);
    setActiveTab('events');
    const runId = run.id
    setLoading(true);

    async function fetchTrace() {
      try {
        const traceRes = await fetch(`/api/runs/${runId}/trace`);
        if (traceRes.ok) {
          const data = await traceRes.json();
          setTrace(data.trace);
        }
      } catch {
        // No stored trace available
      } finally {
        setLoading(false);
      }
    }

    fetchTrace();
  }, [run]);

  if (!run) return null;

  const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.scheduled;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
          background: '#ffffff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 50, display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e5e5e3',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a1a18' }}>
                {run.agent_name ?? 'Agent Run'}
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                {run.status.replace('_', ' ')}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#6b6b68' }}>
              {run.id.slice(0, 8).toUpperCase()} &middot; {formatDuration(run.started_at, run.completed_at, run.status)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b6b68', fontSize: 18 }}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e5e3' }}>
          {(['events', 'result'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: 500, textTransform: 'capitalize',
                background: activeTab === tab ? '#ffffff' : '#f5f5f3',
                color: activeTab === tab ? '#1a1a18' : '#6b6b68',
                borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              {tab === 'events' ? 'Reasoning Trace' : 'Result'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {activeTab === 'events' && (
            loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ height: 80, borderRadius: 8 }} className="skeleton" />
                ))}
              </div>
            ) : trace ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(trace.events as ReasoningEvent[]).map((event, i) => (
                  <EventCard key={i} event={event} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8 }}>
                <svg style={{ color: '#d1d5db' }} className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p style={{ fontSize: 14, color: '#6b6b68', textAlign: 'center' }}>
                  No reasoning trace available for this run.
                  <br />
                  Traces are stored for 90 days.
                </p>
              </div>
            )
          )}

          {activeTab === 'result' && (
            <div style={{ fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', background: '#f9fafb', padding: 16, borderRadius: 8 }}>
              {run.result ?? 'No result recorded.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  observation: 'border-l-blue-400 bg-blue-50',
  classification: 'border-l-purple-400 bg-purple-50',
  decision: 'border-l-green-400 bg-green-50',
  action: 'border-l-orange-400 bg-orange-50',
  warning: 'border-l-yellow-400 bg-yellow-50',
  approval_required: 'border-l-amber-400 bg-amber-50',
  approval_resolved: 'border-l-green-400 bg-green-50',
  status: 'border-l-gray-400 bg-gray-50',
  done: 'border-l-green-500 bg-green-50',
  error: 'border-l-red-400 bg-red-50',
};

function getEventSummary(event: ReasoningEvent): string {
  const content = event.content as Record<string, unknown>;
  switch (event.type) {
    case 'observation': return (content.text as string) || '';
    case 'classification': return `Classified as "${content.label}"${content.confidence ? ` (${Math.round((content.confidence as number) * 100)}%)` : ''}`;
    case 'decision': return `Decided: ${content.chosen}`;
    case 'action': return `Action: ${content.action}`;
    case 'warning': return `Warning: ${content.text}`;
    case 'approval_required': return `Approval required: ${content.summary}`;
    case 'approval_resolved': return `Approval ${content.decision}`;
    case 'status': return `Status: ${content.status}`;
    case 'done': return `Completed: ${content.summary}`;
    case 'error': return `Error: ${content.message}`;
    default: return JSON.stringify(content);
  }
}

function EventCard({ event }: { event: ReasoningEvent }) {
  const colorClass = EVENT_TYPE_COLORS[event.type] || 'border-l-gray-300 bg-gray-50';
  const timestamp = new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className={`border-l-4 ${colorClass} rounded-r-lg p-3`} style={{ borderLeftWidth: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>
          {event.type.replace('_', ' ')}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{timestamp}</span>
      </div>
      <p style={{ fontSize: 13, color: '#1a1a18', margin: 0, lineHeight: 1.5 }}>
        {getEventSummary(event)}
      </p>
    </div>
  );
}

export default function ActivityPage() {
  const [runs, setRuns] = useState<RunWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TimelineFilters>({ dateRange: 'week' });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRun, setSelectedRun] = useState<RunWithAgent | null>(null);
  const [activeTab, setActiveTab] = useState<'runs' | 'learned'>('runs');
  const [pendingFacts, setPendingFacts] = useState<MemoryFactData[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch runs when filters or search change
  useEffect(() => {
    fetchRuns(1);
  }, [filters, debouncedSearch]);

  async function fetchRuns(newPage: number) {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(newPage),
      limit: '20',
    });
    if (filters.agentId) params.set('teamId', filters.agentId);
    if (filters.status) params.set('status', filters.status);
    if (filters.dateRange) params.set('dateRange', filters.dateRange);
    if (debouncedSearch) params.set('search', debouncedSearch);

    try {
      const res = await fetch(`/api/activity?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (newPage === 1) {
          setRuns(data.runs);
        } else {
          setRuns(prev => [...prev, ...data.runs]);
        }
        setHasMore(data.runs.length === 20);
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }

  function handleFilterChange(newFilters: TimelineFilters) {
    setFilters(newFilters);
    setPage(1);
  }

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRuns(nextPage);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--ui-bg)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ui-text)', fontFamily: "'IBM Plex Serif', Georgia, serif" }}>Activity Log</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b6b68' }}>
              Runs are retained for 90 days
            </p>
          </div>
          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search agents or status..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: 280, padding: '8px 12px 8px 36px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
                background: '#f9fafb',
              }}
            />
          </div>
        </div>
      </div>

      {/* Tab bar — Runs vs Learned Facts */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-surface)', padding: '0 32px' }}>
        {(['runs', 'learned'] as const).map(tab => (
          <button
            key={tab}
            onClick={async () => {
              setActiveTab(tab)
              if (tab === 'learned' && pendingFacts.length === 0) {
                setFactsLoading(true)
                try {
                  const res = await fetch('/api/memory/facts?status=pending')
                  if (res.ok) {
                    const data = await res.json()
                    setPendingFacts(data.facts ?? [])
                  }
                } catch (err) {
                  console.error('Failed to fetch pending facts:', err)
                } finally {
                  setFactsLoading(false)
                }
              }
            }}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: 500,
              background: activeTab === tab ? '#ffffff' : 'transparent',
              color: activeTab === tab ? '#1a1a18' : '#6b6b68',
              borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
            }}
          >
            {tab === 'runs' ? 'Runs' : 'Learned Facts'}
            {tab === 'learned' && pendingFacts.length > 0 && (
              <span style={{
                marginLeft: 6, background: '#6366f1', color: '#fff',
                borderRadius: 999, fontSize: 11, fontWeight: 700,
                padding: '1px 7px',
              }}>
                {pendingFacts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Run list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {activeTab === 'runs' && (
          <>
            {!loading && runs.length === 0 && !initialLoad ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: 300, gap: 8,
              }}>
                <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1a1a18' }}>No activity found</p>
                <p style={{ margin: 0, fontSize: 13, color: '#6b6b68' }}>
                  {debouncedSearch ? 'Try a different search term' : 'Your agents will appear here after their first run'}
                </p>
              </div>
            ) : (
              <>
                {runs.map(run => (
                  <RunRow
                    key={run.id}
                    run={run}
                    onClick={() => setSelectedRun(run)}
                  />
                ))}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '12px', background: '#ffffff',
                      border: '1px solid #e5e5e3', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
                      marginTop: 12, fontSize: 14, color: '#6b6b68',
                    }}
                  >
                    {loading ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </>
            )}
            {loading && runs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            )}
          </>
        )}

        {activeTab === 'learned' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!factsLoading && pendingFacts.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: 200, gap: 8,
              }}>
                <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p style={{ margin: 0, fontSize: 14, color: '#6b6b68', textAlign: 'center' }}>
                  No pending facts to review.
                  <br />
                  Facts extracted from runs will appear here for confirmation.
                </p>
              </div>
            ) : (
              <>
                {factsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ height: 80, borderRadius: 8 }} className="skeleton" />
                    <div style={{ height: 80, borderRadius: 8 }} className="skeleton" />
                  </div>
                ) : (
                  pendingFacts.map(fact => (
                    <MemoryFactCard
                      key={fact.id}
                      fact={fact}
                      onConfirm={async (id) => {
                        await fetch(`/api/memory/facts/${id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'confirm' }),
                        })
                        setPendingFacts(prev => prev.filter(f => f.id !== id))
                      }}
                      onDeny={async (id) => {
                        await fetch(`/api/memory/facts/${id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'deny' }),
                        })
                        setPendingFacts(prev => prev.filter(f => f.id !== id))
                      }}
                    />
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Slide-over */}
      <SlideOver run={selectedRun} onClose={() => setSelectedRun(null)} />

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
  );
}

function RunRow({ run, onClick }: { run: RunWithAgent; onClick: () => void }) {
  const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.scheduled;

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px', background: '#ffffff', border: '1px solid #e5e5e3',
        borderRadius: 12, marginBottom: 8, cursor: 'pointer', textAlign: 'left',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Status dot */}
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusStyle.dot, flexShrink: 0 }} />

      {/* Left: agent name + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a18' }}>
            {run.agent_name ?? 'Agent'}
          </span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            #{run.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#6b6b68' }}>
          {run.status.replace('_', ' ')} &middot; {formatDuration(run.started_at, run.completed_at, run.status)}
        </div>
      </div>

      {/* Right: time */}
      <div style={{ fontSize: 13, color: '#9ca3af', flexShrink: 0 }}>
        {run.started_at ? formatTimeAgo(run.started_at) : '—'}
      </div>

      {/* Chevron */}
      <svg style={{ color: '#d1d5db', flexShrink: 0 }} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e5e5e3', borderRadius: 12,
      padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 4 }} />
        </div>
        <div className="skeleton" style={{ height: 24, width: 80, borderRadius: 999 }} />
      </div>
    </div>
  );
}
