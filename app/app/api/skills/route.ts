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
