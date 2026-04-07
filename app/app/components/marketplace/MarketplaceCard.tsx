'use client'

import { useState } from 'react'
import type { SkillManifest } from '@/lib/skills/types'

interface MarketplaceCardProps {
  skill: SkillManifest
  onInstall: (name: string) => Promise<void>
  isInstalled: boolean
}

const ARCHETYPE_COLORS = {
  Ingest: '#3b82f6',
  Process: '#8b5cf6',
  Distill: '#f59e0b',
} as const

export function MarketplaceCard({ skill, onInstall, isInstalled }: MarketplaceCardProps) {
  const [installing, setInstalling] = useState(false)
  const [hovered, setHovered] = useState(false)

  async function handleInstall() {
    if (installing || isInstalled) return
    setInstalling(true)
    try {
      await onInstall(skill.name)
    } finally {
      setInstalling(false)
    }
  }

  const badgeColor = ARCHETYPE_COLORS[skill.archetype] ?? '#6b7280'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#ffffff',
        borderRadius: 12,
        padding: 20,
        border: '1px solid #e5e7eb',
        boxShadow: hovered ? '0 8px 25px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.3 }}>
            {skill.name}
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.4 }}>
            {skill.description}
          </p>
        </div>
      </div>

      {/* Archetype badge + tool count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '3px 8px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            color: '#ffffff',
            background: badgeColor,
          }}
        >
          {skill.archetype}
        </span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {skill.tools.length} tool{skill.tools.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* CTA button */}
      {isInstalled ? (
        <button
          disabled
          style={{
            marginTop: 'auto',
            padding: '9px 16px',
            background: '#d1fae5',
            border: '1px solid #6ee7b7',
            borderRadius: 8,
            color: '#065f46',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Installed
        </button>
      ) : (
        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            marginTop: 'auto',
            padding: '9px 16px',
            background: installing ? '#e5e7eb' : '#4f46e5',
            border: 'none',
            borderRadius: 8,
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            cursor: installing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'background 0.15s',
          }}
        >
          {installing ? (
            <>
              <svg
                style={{ animation: 'spin 1s linear infinite' }}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Installing...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add to canvas
            </>
          )}
        </button>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}