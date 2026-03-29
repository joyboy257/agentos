import { NextRequest, NextResponse } from 'next/server'
import { InProcessRunner } from '@/lib/runtime/runner'
import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent } from '@/lib/nl/types'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const { graph } = await req.json() as { graph: AgentGraph }
  
  if (!graph || !graph.agents || !graph.connections) {
    return NextResponse.json({ error: 'Invalid graph' }, { status: 400 })
  }
  
  const runId = nanoid()
  
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      
      const runner = new InProcessRunner()
      
      await runner.execute(
        {
          onStatus: (e: AgentStatusEvent) => send('status', e),
          onDone: (e: RunDoneEvent) => send('done', e),
          onError: (e: RunErrorEvent) => send('error', e),
        },
        { runId, graph, signal: req.signal }
      )
      
      controller.close()
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
