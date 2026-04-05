export type SkillArchetype = 'Ingest' | 'Process' | 'Distill'

export interface SkillManifest {
  name: string
  version: string
  description: string
  archetype: SkillArchetype
  tools: string[]
  escalation_threshold?: string
  auto_approve_contacts?: string[]
  triggers: string[]
}

export interface SkillDefinition {
  manifest: SkillManifest
  body: string // markdown body
}
