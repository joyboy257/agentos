'use client';

import { useState, useEffect } from 'react';
import { TimelineItem } from '@/components/activity-log/timeline-item';
import { TimelineFiltersBar, type TimelineFilters } from '@/components/activity-log/timeline-filters';
import type { Run } from '@/lib/db/types';

export default function ActivityPage() {
  const [runs, setRuns] = useState<(Run & { agent_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TimelineFilters>({ dateRange: 'week' });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    fetchRuns(1, filters);
  }, [filters]);

  async function fetchRuns(newPage: number, currentFilters: TimelineFilters) {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(newPage),
      limit: '20',
    });
    if (currentFilters.agentId) params.set('agent_id', currentFilters.agentId);
    if (currentFilters.status) params.set('status', currentFilters.status);
    if (currentFilters.dateRange) params.set('date_range', currentFilters.dateRange);

    try {
      const res = await fetch(`/api/runs?${params}`);
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
    fetchRuns(nextPage, filters);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0ec', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid #e5e5e3', background: '#ffffff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a18' }}>Activity Log</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b6b68' }}>See what your agents have been working on</p>
      </div>

      {/* Filter bar */}
      <TimelineFiltersBar
        agents={[]}
        onFilterChange={handleFilterChange}
      />

      {/* Run list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {!loading && runs.length === 0 && !initialLoad ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: 300,
            gap: 8,
          }}>
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1a1a18' }}>No activity yet</p>
            <p style={{ margin: 0, fontSize: 13, color: '#6b6b68' }}>Your agents will appear here after their first run</p>
          </div>
        ) : (
          <>
            {runs.map(run => (
              <TimelineItem
                key={run.id}
                run={run}
                onClick={(r) => console.log('Run clicked:', r)}
              />
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#ffffff',
                  border: '1px solid #e5e5e3',
                  borderRadius: 8,
                  cursor: loading ? 'default' : 'pointer',
                  marginTop: 12,
                  fontSize: 14,
                  color: '#6b6b68',
                }}
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            )}
          </>
        )}
        {loading && runs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
      </div>

      <style>{`
        .skeleton {
          background: linear-gradient(90deg, #f0f0ec 25%, #e5e5e3 50%, #f0f0ec 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e5e3',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
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