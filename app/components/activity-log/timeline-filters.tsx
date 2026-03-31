'use client';

import { useState } from 'react';

interface TimelineFiltersProps {
  agents: Array<{ id: string; name: string }>;
  onFilterChange: (filters: TimelineFilters) => void;
}

export interface TimelineFilters {
  agentId?: string;
  status?: string;
  dateRange?: 'today' | 'week' | 'month' | 'all';
}

export function TimelineFiltersBar({ agents, onFilterChange }: TimelineFiltersProps) {
  const [filters, setFilters] = useState<TimelineFilters>({
    dateRange: 'week',
  });

  const handleChange = (updates: Partial<TimelineFilters>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="flex flex-wrap gap-4 p-4 bg-gray-50 border-b border-gray-200">
      {/* Agent filter */}
      <select
        value={filters.agentId ?? ''}
        onChange={(e) => handleChange({ agentId: e.target.value || undefined })}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Agents</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>

      {/* Status filter */}
      <select
        value={filters.status ?? ''}
        onChange={(e) => handleChange({ status: e.target.value || undefined })}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Statuses</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
        <option value="running">Running</option>
        <option value="waiting_for_approval">Escalated</option>
      </select>

      {/* Date range filter */}
      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
        {(['today', 'week', 'month', 'all'] as const).map((range) => (
          <button
            key={range}
            onClick={() => handleChange({ dateRange: range })}
            className={`px-3 py-1.5 text-sm transition-colors ${
              filters.dateRange === range
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {range === 'today' ? 'Today' : range === 'week' ? 'Week' : range === 'month' ? 'Month' : 'All'}
          </button>
        ))}
      </div>
    </div>
  );
}
