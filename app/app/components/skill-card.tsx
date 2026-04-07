'use client'

import type { SkillManifest } from '@/lib/skills/types'

const ARCHETYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Ingest: { bg: '#1a1f3c', text: '#93c5fd', border: '#2d3a8c' },
  Process: { bg: '#2a1f0a', text: '#fcd34d', border: '#5c3d0e' },
  Distill: { bg: '#0f2a1a', text: '#86efac', border: '#1a5c32' },
}

interface SkillCardProps {
  skill: {
    name: string
    description: string
    archetype?: string
    tools: string[]
    version?: string
  }
  onInstall: (skillId: string) => void
  installing?: boolean
}

export function SkillCard({ skill, onInstall, installing = false }: SkillCardProps) {
  const archetypeStyle = ARCHETYPE_COLORS[skill.archetype ?? ''] ?? {
    bg: '#1a1a18',
    text: '#9ca3af',
    border: '#2a2a2a',
  }

  return (
    <div
      style={{
        background: '#1a1a18',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#3a3a4a'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = '#2a2a2a'
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
      }}
    >
      {/* Header: name + archetype badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: 2,
              lineHeight: 1.3,
            }}
          >
            {skill.name}
          </h3>
          {skill.version && (
            <span style={{ fontSize: 11, color: '#52525b', fontFamily: 'ui-monospace, monospace' }}>
              v{skill.version}
            </span>
          )}
        </div>
        {skill.archetype && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 999,
              background: archetypeStyle.bg,
              color: archetypeStyle.text,
              border: `1px solid ${archetypeStyle.border}`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {skill.archetype}
          </span>
        )}
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
        {skill.description}
      </p>

      {/* Tools */}
      {skill.tools.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#52525b',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 6,
            }}
          >
            Tools
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {skill.tools.map(tool => (
              <span
                key={tool}
                style={{
                  fontSize: 11,
                  fontFamily: 'ui-monospace, monospace',
                  background: '#0f0f0f',
                  color: '#6b6b7b',
                  border: '1px solid #2a2a2a',
                  borderRadius: 4,
                  padding: '2px 7px',
                }}
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Install button */}
      <button
        onClick={() => onInstall(skill.name)}
        disabled={installing}
        style={{
          marginTop: 'auto',
          padding: '9px 16px',
          background: installing ? '#2a2a3a' : '#6366f1',
          border: 'none',
          borderRadius: 8,
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 600,
          cursor: installing ? 'not-allowed' : 'pointer',
          opacity: installing ? 0.7 : 1,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => {
          if (!installing) (e.currentTarget as HTMLButtonElement).style.background = '#5558e3'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = installing ? '#2a2a3a' : '#6366f1'
        }}
      >
        {installing ? 'Installing...' : 'Install to Canvas'}
      </button>
    </div>
  )
}
