'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { SkillManifest } from '@/lib/skills/types'
import { SkillCard } from '@/app/components/skill-card'

export default function SkillsPage() {
  const router = useRouter()
  const [skills, setSkills] = useState<SkillManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/skills')
        if (!res.ok) throw new Error(`Failed to load skills: ${res.status}`)
        const data = await res.json()
        setSkills(data.skills ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleInstall(skillName: string) {
    if (!skillName) return
    setInstalling(skillName)
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillName }),
      })
      if (!res.ok) throw new Error(`Install failed: ${res.status}`)
      setInstalled(prev => new Set([...prev, skillName]))
    } catch {
      // Keep installing state on failure so user can retry
    } finally {
      setInstalling(null)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--ui-bg)',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '40px 32px',
        }}
      >
        {/* Page header */}
        <div style={{ marginBottom: 36 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-0.01em',
            }}
          >
            Skills Directory
          </h1>
          <p style={{ marginTop: 6, fontSize: 14, color: '#6b6b7b' }}>
            Portable agent configurations Maria can install to her canvas.
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 0',
              color: '#6b6b7b',
              fontSize: 14,
              gap: 10,
            }}
          >
            <svg
              style={{ animation: 'spin 1s linear infinite' }}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Loading skills...
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 0',
              gap: 8,
              color: '#ef4444',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 14 }}>{error}</p>
            <button
              onClick={() => { setLoading(true); setError(null); }}
              style={{
                marginTop: 8,
                padding: '7px 14px',
                background: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: 6,
                color: '#9ca3af',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && skills.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 0',
              gap: 10,
              color: '#52525b',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p style={{ fontSize: 14, color: '#6b6b7b' }}>No skills available yet.</p>
            <p style={{ fontSize: 12, color: '#52525b' }}>
              Skills are bundled in the <code style={{ fontFamily: 'ui-monospace' }}>skills/</code> directory.
            </p>
          </div>
        )}

        {/* Skills grid */}
        {!loading && !error && skills.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 20,
            }}
          >
            {skills.map(skill => (
              <SkillCard
                key={skill.name}
                skill={skill}
                onInstall={handleInstall}
                installing={installing === skill.name}
              />
            ))}
          </div>
        )}

        {/* Installed success banner */}
        {installed.size > 0 && (
          <div
            style={{
              marginTop: 32,
              padding: '14px 18px',
              background: '#0f2a1a',
              border: '1px solid #1a5c32',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#86efac' }}>
                Skills installed: {[...installed].join(', ')}
              </p>
              <p style={{ fontSize: 12, color: '#4ade80', marginTop: 2 }}>
                Open the canvas to wire these skills into your team.
              </p>
            </div>
            <button
              onClick={() => router.push('/canvas')}
              style={{
                padding: '8px 16px',
                background: '#22c55e',
                border: 'none',
                borderRadius: 7,
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Go to Canvas
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
