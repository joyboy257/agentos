import { NextRequest, NextResponse } from 'next/server'
import { interpret } from '@/lib/nl/interpret'

export async function POST(req: NextRequest) {
  try {
    const { goal } = await req.json()

    if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
      return NextResponse.json(
        { error: true, message: "Please describe what you want to do." },
        { status: 400 }
      )
    }

    const result = await interpret(goal.trim())

    if (result.ok && 'graph' in result) {
      return NextResponse.json(result.graph)
    } else if (!result.ok && 'clarification' in result) {
      return NextResponse.json({
        clarification: true,
        question: result.question,
        options: result.options
      })
    } else {
      return NextResponse.json({
        error: true,
        message: result.message
      }, { status: 400 })
    }

  } catch (err) {
    console.error('/api/assemble error:', err)
    return NextResponse.json(
      { error: true, message: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
