import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getSkill } from '@/lib/skills/skill-registry'
import type { SkillManifest } from '@/lib/skills/types'

interface Props {
  params: Promise<{ skillName: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { skillName } = await params
  const decoded = decodeURIComponent(skillName)
  const skill = getSkill(decoded)
  if (!skill) return { title: 'Skill Not Found' }
  return { title: skill.manifest.name }
}

const ARCHETYPE_COLORS = {
  Ingest: '#3b82f6',
  Process: '#8b5cf6',
  Distill: '#f59e0b',
} as const

function ArchetypeBadge({ archetype }: { archetype: SkillManifest['archetype'] }) {
  const color = ARCHETYPE_COLORS[archetype] ?? '#6b7280'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: '#ffffff',
        background: color,
      }}
    >
      {archetype}
    </span>
  )
}

export default async function SkillDetailPage({ params }: Props) {
  const { skillName } = await params
  const decoded = decodeURIComponent(skillName)
  const skill = getSkill(decoded)

  if (!skill) notFound()

  const { manifest, body } = skill

  // Extract sample workflows from body
  const workflows = body
    .split('\n')
    .filter(line => line.startsWith('- "'))
    .map(line => line.replace(/^-\s*"|"\s*$/g, '').trim())

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f9fafb' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 32px' }}>

        {/* Back link */}
        <Link
          href="/marketplace"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: '#6b7280',
            textDecoration: 'none',
            marginBottom: 28,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Marketplace
        </Link>

        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', margin: 0 }}>
              {manifest.name}
            </h1>
            <ArchetypeBadge archetype={manifest.archetype} />
          </div>
          <p style={{ fontSize: 16, color: '#4b5563', lineHeight: 1.6, margin: 0 }}>
            {manifest.description}
          </p>
        </div>

        {/* Tools included */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
            Tools included
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {manifest.tools.map(tool => (
              <span
                key={tool}
                style={{
                  padding: '6px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#374151',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {tool}
              </span>
            ))}
          </div>
        </section>

        {/* What it does */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
            What it does
          </h2>
          <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
            {body.replace(/^#.*\n/, '').replace(/^##.*\n*/gm, '').trim()}
          </p>
        </section>

        {/* Sample workflows */}
        {workflows.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
              Sample workflows
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {workflows.map((workflow, i) => (
                <div
                  key={i}
                  style={{
                    padding: '14px 16px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                  }}
                >
                  <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.5 }}>
                    &ldquo;{workflow}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div style={{ padding: '24px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
            Ready to add this skill?
          </h3>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>
            It will be added to your canvas as a new agent.
          </p>
          <form
            action={async () => {
              'use server'
              // Server action handles install — for now redirect to canvas
              // The actual POST is handled client-side via the marketplace page
            }}
          >
            <Link
              href="/marketplace"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 20px',
                background: '#4f46e5',
                borderRadius: 8,
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Back to Marketplace
            </Link>
          </form>
        </div>
      </div>
    </div>
  )
}