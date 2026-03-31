'use client';

import type { Run } from '@/lib/db/types';

interface TimelineItemProps {
  run: Run & { agent_name?: string; actions_count?: number };
  onClick?: (run: Run) => void;
}

const STATUS_STYLES = {
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  waiting_for_approval: 'bg-amber-100 text-amber-800',
  running: 'bg-blue-100 text-blue-800',
  scheduled: 'bg-gray-100 text-gray-800',
  paused: 'bg-gray-100 text-gray-800',
};

export function TimelineItem({ run, onClick }: TimelineItemProps) {
  const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.scheduled;
  const timeAgo = formatTimeAgo(run.created_at);

  return (
    <button
      onClick={() => onClick?.(run)}
      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-100"
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900">
            {run.agent_name ?? 'Agent'}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
            {run.status.replace('_', ' ')}
          </span>
        </div>
        <div className="text-sm text-gray-500">
          {run.actions_count ?? 0} actions
        </div>
      </div>

      {/* Time */}
      <div className="text-sm text-gray-400 flex-shrink-0">
        {timeAgo}
      </div>
    </button>
  );
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
