import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getTeamsByUser, createTeam } from '@/lib/db/queries'
import { nanoid } from 'nanoid'

export async function GET() {
  const session = await getSessionFromCookie()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const teams = await getTeamsByUser(session.userId)
  return NextResponse.json({ teams })
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, agents, connections } = await req.json()
  if (!name || !agents || !connections) {
    return NextResponse.json({ error: 'name, agents, connections required' }, { status: 400 })
  }

  const id = nanoid()
  await createTeam(id, session.userId, name, JSON.stringify(agents), JSON.stringify(connections))

  return NextResponse.json({ id, name, agents, connections })
}
