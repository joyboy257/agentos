import { NextRequest, NextResponse } from 'next/server'
import { ulid } from 'ulid'
import { listSkillManifests, getSkill } from '@/lib/skills/skill-registry'
import { getSessionFromCookie } from '@/lib/auth/session'
import { createAgent } from '@/lib/db/queries'
import { listCanvasesForUser, getCanvas, updateCanvas } from '@/lib/db/queries'
import type { Agent } from '@/lib/db/types'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const name = searchParams.get('name')

  if (name) {
    const skill = getSkill(name)
    if (!skill) {
      return NextResponse.json({ error: `Skill not found: ${name}` }, { status: 404 })
    }
    return NextResponse.json({ skill })
  }

  const manifests = listSkillManifests()
  return NextResponse.json({ skills: manifests })
}

/**
 * Installs a skill by creating its agents in the user's canvas.
 *
 * POST /api/skills
 * Body: { name: string, canvasId?: string }
 *
 * Auth: getSessionFromCookie
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.userId

    const body = await req.json()
    const { name, canvasId } = body

    if (!name) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 })
    }

    const skill = getSkill(name)
    if (!skill) {
      return NextResponse.json({ error: `Skill not found: ${name}` }, { status: 404 })
    }

    // Resolve the target canvas
    let canvas = canvasId ? await getCanvas(canvasId) : null

    // Fall back to the user's default canvas
    if (!canvas) {
      const canvases = await listCanvasesForUser(userId)
      canvas = canvases.find((c) => c.is_default) ?? canvases[0] ?? null
    }

    if (!canvas) {
      return NextResponse.json({ error: 'No canvas found. Create a canvas first.' }, { status: 404 })
    }

    // A skill defines one agent: name + tools + archetype-driven role
    const role: Agent['role'] = skill.manifest.archetype === 'Ingest'
      ? 'research_agent'
      : 'support_agent'

    const agent = await createAgent({
      user_id: userId,
      name: skill.manifest.name,
      role,
      config: {
        skillId: skill.manifest.name,
        skillVersion: skill.manifest.version,
        tools: skill.manifest.tools,
        triggers: skill.manifest.triggers,
        description: skill.manifest.description,
      },
    })

    // Append the new agent to the canvas's agents list
    const canvasAgents: string[] = JSON.parse(canvas.agents_json || '[]')
    canvasAgents.push(agent.id)
    await updateCanvas(canvas.id, { agents_json: canvasAgents })

    return NextResponse.json({
      success: true,
      agent,
      canvasId: canvas.id,
    })
  } catch (err) {
    console.error('[skills] POST error:', err)
    return NextResponse.json({ error: 'Failed to install skill' }, { status: 500 })
  }
}
