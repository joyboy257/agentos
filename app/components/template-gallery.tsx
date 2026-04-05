'use client'

import { TemplateCard } from './template-card'
import { listTemplates, type AgentTemplate } from '@/lib/tools/templates'

interface TemplateGalleryProps {
  onTemplateSelect: (goal: string) => void
}

export function TemplateGallery({ onTemplateSelect }: TemplateGalleryProps) {
  const templates = listTemplates()

  const handleTemplateClick = (template: AgentTemplate) => {
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
            key={template.id}
            template={template}
            onSelect={handleTemplateClick}
          />
        ))}
      </div>
    </div>
  )
}
