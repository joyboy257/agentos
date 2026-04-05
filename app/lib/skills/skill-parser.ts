import type { SkillDefinition, SkillManifest, SkillArchetype } from './types'

const ARCHETYPES: SkillArchetype[] = ['Ingest', 'Process', 'Distill']

// Known tools — extend as the platform grows
const KNOWN_TOOLS = new Set([
  'llm',
  'web.search',
  'web.fetch',
  'gmail.read',
  'gmail.send',
  'gmail.draft',
])

/**
 * Parses YAML frontmatter from SKILL.md content.
 * Returns { manifest, body } where body is everything after the closing ---.
 */
export function parseSkillMarkdown(content: string): SkillDefinition {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!frontmatterMatch) {
    throw new Error('Missing YAML frontmatter delimiters (---)')
  }

  const [, rawYaml, body] = frontmatterMatch
  const manifest = parseYamlManifest(rawYaml)

  return { manifest, body: body.trim() }
}

function parseYamlManifest(rawYaml: string): SkillManifest {
  const manifest: Record<string, unknown> = {}
  const lines = rawYaml.split(/\r?\n/)

  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()

    if (value === '') continue

    // Array value: [item1, item2, ...]
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
      ;(manifest as Record<string, unknown>)[key] = items
      continue
    }

    // Scalar value
    ;(manifest as Record<string, unknown>)[key] = value.replace(/^["']|["']$/g, '')
  }

  // Type assertions — caller validates
  return manifest as unknown as SkillManifest
}

/**
 * Validates a SkillDefinition and returns an array of error strings.
 * Empty array means the skill is valid.
 */
export function validateSkill(definition: SkillDefinition): string[] {
  const errors: string[] = []
  const { manifest } = definition

  if (!manifest.name) {
    errors.push('manifest.name is required')
  }
  if (!manifest.version) {
    errors.push('manifest.version is required')
  }
  if (!manifest.description) {
    errors.push('manifest.description is required')
  }
  if (!manifest.archetype) {
    errors.push('manifest.archetype is required')
  } else if (!ARCHETYPES.includes(manifest.archetype)) {
    errors.push(`manifest.archetype must be one of: ${ARCHETYPES.join(', ')}`)
  }
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    errors.push('manifest.tools must be a non-empty array')
  } else {
    for (const tool of manifest.tools) {
      if (!KNOWN_TOOLS.has(tool)) {
        errors.push(`Unknown tool: ${tool}`)
      }
    }
  }
  if (!Array.isArray(manifest.triggers) || manifest.triggers.length === 0) {
    errors.push('manifest.triggers must be a non-empty array')
  }

  return errors
}
