'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { SkillManifest } from '@/lib/skills/types'
import { MarketplaceCard } from '@/app/components/marketplace/MarketplaceCard'
import { MarketplaceFilter } from '@/app/components/marketplace/MarketplaceFilter'

export default function MarketplacePage() {
  const router = useRouter()
  const [skills, setSkills] = useState<SkillManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState<string | null>(null)

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
    if (!skillName || installing) return
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
      // keep installing state so user can retry
    } finally {
      setInstalling(null)
    }
  }

  const filtered = skills.filter(skill => {
    const matchesSearch =
      !search ||
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'All' || skill.archetype === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f9fafb' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', margin: 0 }}>
            Skill Marketplace
          </h1>
          <p style={{ marginTop: 6, fontSize: 15, color: '#6b7280' }}>
            Equip your agents with specialized skills
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', maxWidth: 400 }}>
            <svg
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search skills..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                color: '#111827',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ marginBottom: 28 }}>
          <MarketplaceFilter active={filter} onChange={setFilter} />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#6b7280', fontSize: 14, gap: 10 }}>
            <svg style={{ animation: 'spin 1s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Loading skills...
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 8, color: '#ef4444' }}>
            <p style={{ fontSize: 14 }}>{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 8, color: '#9ca3af' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p style={{ fontSize: 14 }}>No skills match your search</p>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 20,
            }}
          >
            {filtered.map(skill => (
              <MarketplaceCard
                key={skill.name}
                skill={skill}
                onInstall={handleInstall}
                isInstalled={installed.has(skill.name)}
              />
            ))}
          </div>
        )}

        {/* Installed banner */}
        {installed.size > 0 && (
          <div
            style={{
              marginTop: 32,
              padding: '14px 18px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>
                Skills installed: {[...installed].join(', ')}
              </p>
              <p style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
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