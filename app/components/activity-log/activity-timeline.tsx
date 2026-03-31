'use client';

import { useState, useEffect } from 'react';
import type { Run } from '@/lib/db/types';
import { TimelineItem } from './timeline-item';
import { TimelineFiltersBar } from './timeline-filters';
import type { TimelineFilters } from './timeline-filters';

interface ActivityTimelineProps {
  initialRuns?: Run[];
}

export function ActivityTimeline({ initialRuns = [] }: ActivityTimelineProps) {
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [loading, setLoading] = useState(!initialRuns.length);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<TimelineFilters>({ dateRange: 'week' });

  useEffect(() => {
    async function fetchRuns() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '20',
          ...(filters.agentId && { agent_id: filters.agentId }),
          ...(filters.status && { status: filters.status }),
          ...(filters.dateRange && { date_range: filters.dateRange }),
        });

        const res = await fetch(`/api/runs?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (page === 1) {
            setRuns(data.runs);
          } else {
            setRuns((prev) => [...prev, ...data.runs]);
          }
          setHasMore(data.runs.length === 20);
        }
      } catch (error) {
        console.error('Failed to fetch runs:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRuns();
  }, [page, filters]);

  // TODO: SSE subscription for new runs

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <TimelineFiltersBar
        agents={[]} // TODO: Populate with user's agents
        onFilterChange={setFilters}
      />

      {/* Timeline */}
      <div className="flex-1 overflow-auto">
        {runs.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No activity yet</p>
            <p className="text-sm">Your agent runs will appear here</p>
          </div>
        ) : (
          <>
            {runs.map((run) => (
              <TimelineItem
                key={run.id}
                run={run}
                onClick={(r) => console.log('Run clicked:', r)}
              />
            ))}

            {hasMore && (
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loading}
                className="w-full py-3 text-sm text-blue-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
