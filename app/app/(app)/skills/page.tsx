'use client'

import { useState, useEffect } from 'react'
import type { SkillManifest } from '@/lib/skills/types'

const ARCHETYPE_COLORS: Record<string, string> = {
  Ingest: 'bg-blue-100 text-blue-700',
  Process: 'bg-amber-100 text-amber-700',
  Distill: 'bg-green-100 text-green-700',
}

function SkillCard({ manifest, onInstall }: { manifest: SkillManifest; onInstall: (name: string) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5 flex flex-col gap-3 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 leading-tight">{manifest.name}</h3>
          <span className="text-xs text-gray-400 font-mono">v{manifest.version}</span>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${ARCHETYPE_COLORS[manifest.archetype] ?? 'bg-gray-100 text-gray-600'}`}>
          {manifest.archetype}
        </span>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed">{manifest.description}</p>

      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Tools</p>
        <div className="flex flex-wrap gap-1.5">
          {manifest.tools.map(tool => (
            <span key={tool} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
              {tool}
            </span>
          ))}
        </div>
      </div>

      {manifest.triggers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Triggers</p>
          <div className="flex flex-wrap gap-1.5">
            {manifest.triggers.map(trigger => (
              <span key={trigger} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-100">
                {trigger}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => onInstall(manifest.name)}
        className="mt-auto w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Install to Canvas
      </button>
    </div>
  )
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/skills')
      .then(r => r.json())
      .then(data => setSkills(data.skills ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function handleInstall(name: string) {
    setInstalling(name)
    // Phase 2 scope: just shows the config, doesn't wire to canvas yet
    setTimeout(() => {
      setInstalling(null)
      setInstalled(prev => new Set([...prev, name]))
    }, 600)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Skills Directory</h1>
          <p className="mt-1.5 text-gray-500">
            Portable agent configurations you can install to your canvas.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <span>Loading skills...</span>
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>No skills bundled yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {skills.map(manifest => (
              <SkillCard
                key={manifest.name}
                manifest={manifest}
                onInstall={handleInstall}
              />
            ))}
          </div>
        )}

        {installed.size > 0 && (
          <div className="mt-8 p-4 bg-green-50 border border-green-100 rounded-xl">
            <p className="text-sm text-green-700 font-medium">
              Skills ready to configure: {[...installed].join(', ')}
            </p>
            <p className="text-xs text-green-600 mt-1">
              Full canvas integration is a Phase 2 feature.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
