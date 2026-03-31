'use client';

import { useState } from 'react';
import { listTemplates, type AgentTemplate } from '@/lib/tools/templates';
import { TemplateCard } from './template-card';

interface TemplatePickerProps {
  onSelect: (template: AgentTemplate, customGoal?: string) => void;
  onSkip: () => void;
}

export function TemplatePicker({ onSelect, onSkip }: TemplatePickerProps) {
  const [selected, setSelected] = useState<AgentTemplate | null>(null);
  const [customGoal, setCustomGoal] = useState('');

  const templates = listTemplates();

  const handleSelect = (template: AgentTemplate) => {
    setSelected(template);
  };

  const handleHire = () => {
    if (selected) {
      onSelect(selected, customGoal);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Hire Your First AI Employee
        </h1>
        <p className="text-gray-600">
          Choose a template to get started, or describe what you need in plain English.
        </p>
      </div>

      <div className="flex gap-4 mb-8">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {selected && (
        <div className="w-full max-w-2xl mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-medium text-gray-900 mb-2">
            Customizing: {selected.name}
          </h3>
          <textarea
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            placeholder={`e.g., "${selected.description}"`}
            className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
        </div>
      )}

      <div className="flex gap-4">
        {selected && (
          <button
            onClick={handleHire}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Hire {selected.name}
          </button>
        )}
        <button
          onClick={onSkip}
          className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          Build My Own
        </button>
      </div>
    </div>
  );
}
