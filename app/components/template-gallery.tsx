'use client'

import { TemplateCard } from './template-card'

const templates = [
  {
    name: 'Customer Email Agent',
    agents: ['reader', 'drafter', 'sender'],
  },
  {
    name: 'Lead Research Agent',
    agents: ['researcher', 'enricher'],
  },
  {
    name: 'Customer Support Agent',
    agents: ['reader', 'responder', 'escalator'],
  },
]

interface TemplateGalleryProps {
  onTemplateSelect: (goal: string) => void
}

export function TemplateGallery({ onTemplateSelect }: TemplateGalleryProps) {
  const handleTemplateClick = (template: typeof templates[0]) => {
    const goal = `Build a ${template.name.toLowerCase()} workflow`
    onTemplateSelect(goal)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '40px',
      }}
    >
      <h2
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '32px',
        }}
      >
        Start with a template
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px',
          maxWidth: '720px',
          width: '100%',
        }}
      >
        {templates.map((template) => (
          <TemplateCard
            key={template.name}
            name={template.name}
            agents={template.agents}
            onClick={() => handleTemplateClick(template)}
          />
        ))}
      </div>
    </div>
  )
}
