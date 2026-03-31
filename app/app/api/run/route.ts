import { NextRequest, NextResponse } from 'next/server'
import { InProcessRunner } from '@/lib/runtime/runner'
import { DurableRunner } from '@/lib/runtime/durable-runner'
import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent } from '@/lib/nl/types'
import { nanoid } from 'nanoid'

const durableRunner = new DurableRunner();

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Route: /api/run/immediate (InProcessRunner) vs /api/run/scheduled (DurableRunner)
  const { route, ...data } = body;

  if (route === 'scheduled') {
    // Called by BullMQ worker
    const { agentId, userId, sessionId, args } = data;
    const result = await durableRunner.execute({ agentId, userId, sessionId, args });
    return NextResponse.json(result);
  }

  // Default: immediate run (existing InProcessRunner behavior)
  const { graph } = data as { graph: AgentGraph };

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
