import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { SkillDefinition, SkillManifest } from './types'
import { parseSkillMarkdown } from './skill-parser'

// Skills live at the repo root (/Users/deon/agentos/skills), two levels up from the app/ directory
const SKILLS_DIR = join(process.cwd(), '..', '..', 'skills')

function skillDir(): string {
  return SKILLS_DIR
}

function listSkillDirs(): string[] {
  const dir = skillDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => {
    return readdirSync(join(dir, name)).includes('SKILL.md')
  })
}

/**
 * Returns all skill definitions (full manifest + body).
 */
export function listSkills(): SkillDefinition[] {
  const skillDirs = listSkillDirs()
  const results: SkillDefinition[] = []

  for (const name of skillDirs) {
    const skill = getSkill(name)
    if (skill) results.push(skill)
  }

  return results
}

/**
 * Returns a single skill by its directory name, or null if not found.
 */
export function getSkill(name: string): SkillDefinition | null {
  const filePath = join(skillDir(), name, 'SKILL.md')
  if (!existsSync(filePath)) return null

  try {
    const content = readFileSync(filePath, 'utf-8')
    return parseSkillMarkdown(content)
  } catch {
    return null
  }
}

/**
 * Returns only the manifest portion of all skills.
 * Useful for directory listing without reading full body.
 */
export function listSkillManifests(): SkillManifest[] {
  return listSkills().map(s => s.manifest)
}
