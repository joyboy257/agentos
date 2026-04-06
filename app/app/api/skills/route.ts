import { NextRequest, NextResponse } from 'next/server'
import { listSkillManifests, getSkill } from '@/lib/skills/skill-registry'

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, canvasId } = body

    if (!name) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 })
    }

    const skill = getSkill(name)
    if (!skill) {
      return NextResponse.json({ error: `Skill not found: ${name}` }, { status: 404 })
    }

    // Phase 2 scope: validate + return skill config for canvas wiring
    // Canvas wire creation will be implemented in a follow-up
    return NextResponse.json({
      success: true,
      skill: skill.manifest,
      canvasId: canvasId ?? null,
      message: 'Skill found. Canvas wiring is a Phase 2 feature.',
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
