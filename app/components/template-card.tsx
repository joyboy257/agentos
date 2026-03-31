'use client';

import type { AgentTemplate } from '@/lib/tools/templates';

interface TemplateCardProps {
  template: AgentTemplate;
  onSelect: (template: AgentTemplate) => void;
}

export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  return (
    <button
      onClick={() => onSelect(template)}
      className="flex flex-col p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:shadow-md transition-all text-left w-72"
    >
      <div
        className="w-12 h-12 rounded-lg mb-4 flex items-center justify-center"
        style={{ backgroundColor: template.color + '20' }}
      >
        <div
          className="w-6 h-6 rounded-full"
          style={{ backgroundColor: template.color }}
        />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {template.name}
      </h3>

      <p className="text-gray-600 text-sm mb-4 flex-1">
        {template.description}
      </p>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span
          className="px-2 py-1 rounded-full text-white"
          style={{ backgroundColor: template.color }}
        >
          {template.role.replace('_', ' ')}
        </span>
        {template.heartbeat_schedule ? (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Scheduled
          </span>
        ) : (
          <span>On-demand</span>
        )}
      </div>
    </button>
  );
}
